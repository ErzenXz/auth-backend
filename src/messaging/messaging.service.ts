import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { IHttpContext } from 'src/auth/models';
import { MessageDto } from './dtos/message.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserMessage } from './models/message.modal';

@Injectable()
export class MessagingService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private eventEmitter: EventEmitter2,
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

    return message;
  }

  async getConversationThreads(userId: number) {
    const threads = await this.prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: {
        senderId: true,
        receiverId: true,
      },
    });

    const userIds = threads
      .map((message) =>
        message.senderId !== userId ? message.senderId : message.receiverId,
      )
      .filter((value, index, self) => self.indexOf(value) === index);

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        profilePicture: true,
        fullName: true,
      },
    });

    return users;
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
      },
      orderBy: { timestamp: 'desc' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });

    return messages.reverse().map((message) => ({
      ...message,
      content: this.encryptionService.decrypt(
        JSON.parse(message.content).iv,
        JSON.parse(message.content).content,
      ),
    }));
  }

  async getMessagesForUser(userId: number) {
    const messages = await this.prisma.message.findMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      orderBy: { timestamp: 'asc' },
    });

    return messages.map((message) => ({
      ...message,
      content: this.encryptionService.decrypt(
        JSON.parse(message.content).iv,
        JSON.parse(message.content).content,
      ),
    }));
  }

  async searchUsers(query: string) {
    return this.prisma.user.findMany({
      where: {
        OR: [{ username: { contains: query } }, { email: { contains: query } }],
      },
      select: { id: true, username: true, profilePicture: true },
    });
  }

  async deleteMessage(context: IHttpContext, messageId: number) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderId !== context.user.id) {
      throw new Error('You can only delete your own messages');
    }

    return this.prisma.message.delete({ where: { id: messageId } });
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
      throw new Error('No conversation found between the users');
    }

    return this.prisma.message.deleteMany({
      where: {
        OR: [
          { senderId: context.user.id, receiverId: userId },
          { senderId: userId, receiverId: context.user.id },
        ],
      },
    });
  }
}
