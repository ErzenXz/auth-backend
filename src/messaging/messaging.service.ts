import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { IHttpContext } from 'src/auth/models';
import { MessageDto } from './dtos/message.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserMessage } from './models/message.modal';
import { response } from 'express';
import { XCacheService } from 'src/cache/cache.service';
import { UserSettings } from 'src/privacy/models/user-settings.model';
import { DetailedUserInfo } from 'src/privacy/models/profile-user.model';

@Injectable()
export class MessagingService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private eventEmitter: EventEmitter2,
    private cacheService: XCacheService,
  ) {}

  async sendMessage(
    context: IHttpContext,
    receiverUsername: string,
    messageDto: MessageDto,
  ) {
    const receiver = await this.prisma.user.findFirst({
      where: { username: receiverUsername },
    });

    if (!receiver) {
      throw new Error('Receiver not found');
    }

    const encryptedMessage = this.encryptionService.encrypt(messageDto.content);

    const message = this.prisma.message.create({
      data: {
        senderId: context.user.id,
        receiverId: receiver.id,
        content: JSON.stringify(encryptedMessage),
      },
    });

    const uMessage = new UserMessage();
    uMessage.senderId = context.user.id;
    uMessage.receiverId = receiver.id;
    uMessage.content = messageDto.content;

    this.eventEmitter.emit('message.sent', uMessage);

    this.cacheService.delCache(`messages:${context.user.id}/${receiver.id}`);
    this.cacheService.delCache(`conversationThreads:${context.user.id}`);

    return message;
  }

  async getConversationThreads(userId: number) {
    const cacheKey = `conversationThreads:${userId}`;
    const cachedThreads = await this.cacheService.getCache(cacheKey);

    if (cachedThreads) {
      return JSON.parse(cachedThreads);
    }

    const threads = await this.prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: {
        timestamp: 'desc',
      },
      include: {
        MessageRead: {
          where: {
            AND: [
              { userId: userId },
              {
                message: {
                  receiverId: userId,
                },
              },
            ],
          },
        },
      },
    });

    const conversationsMap = new Map<number, any>();

    for (const message of threads) {
      const otherUserId =
        message.senderId !== userId ? message.senderId : message.receiverId;

      if (!conversationsMap.has(otherUserId)) {
        const otherUser = await this.prisma.user.findUnique({
          where: { id: otherUserId },
          select: {
            id: true,
            username: true,
            profilePicture: true,
            fullName: true,
          },
        });

        const decryptedContent = this.encryptionService.decrypt(
          JSON.parse(message.content).iv,
          JSON.parse(message.content).content,
        );
        const lastMessageContent = decryptedContent
          .split(' ')
          .slice(0, 10)
          .join(' ');

        const hasSeen =
          message.senderId === userId || message.MessageRead.length > 0;

        conversationsMap.set(otherUserId, {
          ...otherUser,
          lastChat: message.timestamp,
          lastMessage: lastMessageContent,
          hasSeen: hasSeen,
        });
      }
    }

    const conversations = Array.from(conversationsMap.values());
    await this.cacheService.setCache(cacheKey, JSON.stringify(conversations));
    return conversations;
  }

  async getMessagesForConversation(
    userId: number,
    conversationUserId: number,
    pageSize: number,
    page: number,
  ) {
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: conversationUserId },
          { senderId: conversationUserId, receiverId: userId },
        ],
        NOT: {
          MessageDeletion: {
            some: {
              userId: userId,
            },
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        MessageRead: true,
        MessageDeletion: true,
      },
    });

    // Identify unread messages
    const unreadMessages = messages.filter(
      (message) =>
        message.receiverId === userId &&
        !message.MessageRead.some((read) => read.userId === userId),
    );

    // Mark unread messages as read
    if (unreadMessages.length > 0) {
      const messageReads = unreadMessages.map((message) => ({
        messageId: message.id,
        userId: userId,
      }));

      await this.prisma.messageRead.createMany({
        data: messageReads,
        skipDuplicates: true,
      });
    }

    return messages.reverse().map((message) => ({
      ...message,
      content: this.encryptionService.decrypt(
        JSON.parse(message.content).iv,
        JSON.parse(message.content).content,
      ),
    }));
  }

  async searchUsers(query: string) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: trimmedQuery, mode: 'insensitive' } },
          { email: { contains: trimmedQuery, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, profilePicture: true },
      take: 8,
    });
  }

  async deleteMessage(context: IHttpContext, messageId: number) {
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!message) {
        return { error: 'Message not found' };
      }

      if (message.senderId !== context.user.id) {
        return { error: 'You are not authorized' };
      }

      await this.prisma.messageRead.deleteMany({
        where: { messageId: messageId },
      });

      await this.prisma.messageRead.deleteMany({
        where: { messageId: messageId },
      });
      await this.prisma.message.delete({ where: { id: messageId } });

      return { success: true };
    } catch (error) {
      return { error: 'An unexpected error occurred. Please try again later.' };
    }
  }

  async deleteConversation(context: IHttpContext, userId: number) {
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: context.user.id, receiverId: userId },
          { senderId: userId, receiverId: context.user.id },
        ],
      },
    });

    if (messages.length === 0) {
      return response.status(404).json({ message: 'Conversation not found' });
    }

    // Add deletion records for the requesting user
    const deletions = messages.map((message) => ({
      messageId: message.id,
      userId: context.user.id,
    }));

    await this.prisma.messageDeletion.createMany({
      data: deletions,
      skipDuplicates: true,
    });

    // delete messages from DB if both users have deleted them
    await this.prisma.message.deleteMany({
      where: {
        id: { in: messages.map((m) => m.id) },
        AND: {
          MessageDeletion: {
            every: {
              userId: { in: [context.user.id, userId] },
            },
          },
        },
      },
    });

    return { success: true };
  }

  async getUnreadMessages(context: IHttpContext) {
    const unreadMessages = await this.prisma.message.findMany({
      where: {
        receiverId: context.user.id,
        NOT: {
          MessageRead: {
            some: {
              userId: context.user.id,
            },
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      include: {
        MessageRead: true,
      },
    });

    return unreadMessages.reverse().map((message) => ({
      ...message,
      content: this.encryptionService.decrypt(
        JSON.parse(message.content).iv,
        JSON.parse(message.content).content,
      ),
    }));
  }

  async getUserInfo(username: string): Promise<DetailedUserInfo | null> {
    const user = await this.prisma.user.findFirst({
      where: { username },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        profilePicture: true,
        UserPrivaySettings: {
          select: {
            settings: true,
          },
        },
      },
    });

    if (!user) return null;

    const userPrivacySetting = user.UserPrivaySettings[0];
    const settings: UserSettings =
      (userPrivacySetting?.settings as UserSettings) || {};

    const activityStatus = settings.profile?.activeStatus || false;

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      profilePicture: user.profilePicture,
      activityStatus,
    };
  }
}
