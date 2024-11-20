import { Injectable } from '@nestjs/common';
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

/**
 * Service for managing messaging functionalities, including sending and retrieving messages.
 *
 * This class provides methods to send encrypted messages, retrieve conversation threads,
 * manage user subscriptions for push notifications, and handle user-related messaging operations.
 * It utilizes Prisma for database interactions, an encryption service for securing message content,
 * and an event emitter for real-time message notifications.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: XCacheService,
  ) {}

  /**
   * Sends a message to a specified user after encrypting the content.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {string} receiverUsername - The username of the message recipient.
   * @param {MessageDto} messageDto - The data transfer object containing the message content.
   * @returns {Promise<any>} A promise that resolves to the created message object.
   * @throws {Error} Throws an error if the receiver is not found.
   */
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

  /**
   * Retrieves conversation threads for a specified user.
   *
   * @param {number} userId - The ID of the user whose conversation threads are to be retrieved.
   * @returns {Promise<any[]>} A promise that resolves to an array of conversation threads.
   */
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

  /**
   * Retrieves messages for a specific conversation between two users.
   *
   * @param {number} userId - The ID of the requesting user.
   * @param {number} conversationUserId - The ID of the user in the conversation.
   * @param {number} pageSize - The number of messages to retrieve per page.
   * @param {number} page - The page number to retrieve.
   * @returns {Promise<any[]>} A promise that resolves to an array of messages for the conversation.
   */
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

  /**
   * Searches for users based on a query string.
   *
   * @param {string} query - The search query to find users.
   * @returns {Promise<any[]>} A promise that resolves to an array of matching users.
   */
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

  /**
   * Deletes a specific message by its ID.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {number} messageId - The ID of the message to be deleted.
   * @returns {Promise<{ success?: boolean; error?: string }>} A promise that resolves to the result of the deletion operation.
   */
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
      console.info('Error deleting message:', error);
      return { error: 'An unexpected error occurred. Please try again later.' };
    }
  }

  /**
   * Deletes a conversation with a specific user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {number} userId - The ID of the user in the conversation to be deleted.
   * @returns {Promise<{ success: boolean }>} A promise that resolves to the result of the deletion operation.
   */
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

  /**
   * Retrieves unread messages for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any[]>} A promise that resolves to an array of unread messages.
   */
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

  /**
   * Retrieves detailed user information based on the username.
   *
   * @param {string} username - The username of the user whose information is to be retrieved.
   * @returns {Promise<DetailedUserInfo | null>} A promise that resolves to the user information or null if not found.
   */
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

    if (!user) {
      return null;
    }

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

  /**
   * Saves a user's subscription for push notifications.
   *
   * @param {number} userId - The ID of the user subscribing to notifications.
   * @param {any} subscription - The subscription object containing push notification details.
   * @returns {Promise<void>} A promise that resolves when the subscription is saved.
   */
  async saveSubscription(userId: number, subscription: any) {
    await this.prisma.pushSubscription.create({
      data: {
        userId: userId,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
    });
  }

  /**
   * Retrieves all push subscriptions for a specific user.
   *
   * @param {number} userId - The ID of the user whose subscriptions are to be retrieved.
   * @returns {Promise<any[]>} A promise that resolves to an array of subscriptions.
   */
  async getSubscriptions(userId: number) {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
    });
  }

  /**
   * Finds a user and their subscriptions based on the username.
   *
   * @param {string} username - The username of the user to find.
   * @returns {Promise<{ user: any; subscriptions: any }>} A promise that resolves to an object containing the user and their subscription.
   */
  async findUserAndSubscriptionsByUsername(username: string) {
    const user = await this.prisma.user.findFirst({
      where: { username },
    });

    if (!user) {
      return { user: null, subscriptions: [] };
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: user.id },
    });

    return { user, subscriptions };
  }

  /**
   * Deletes a user's subscription for push notifications.
   *
   * @param {number} userId - The ID of the user whose subscription is to be deleted.
   * @param {string} endpoint - The endpoint of the subscription to be deleted.
   * @returns {Promise<void>} A promise that resolves when the subscription is deleted.
   */

  async deleteSubscription(userId: number, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: {
        userId,
        endpoint,
      },
    });

    return { message: 'Subscription deleted successfully!' };
  }
}
