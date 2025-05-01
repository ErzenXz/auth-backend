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
import { CreateGroupDto, GroupMessageDto } from './dtos/group.dto';
import { CallType, InitiateCallDto } from './dtos/call.dto';

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
    if (context.user.username === receiverUsername) {
      return response
        .status(400)
        .json({ message: 'You cannot send a message to yourself' });
    }

    const receiver = await this.prisma.user.findFirst({
      where: { username: receiverUsername },
    });

    if (!receiver) {
      return response.status(400).json({ message: 'Receiver not found' });
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
  async getConversationThreads(userId: string) {
    if (!userId) {
      return response.status(400).json({ message: 'Invalid user ID' });
    }

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

    const conversationsMap = new Map<string, any>();

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
    userId: string,
    conversationUserId: string,
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
  async deleteMessage(context: IHttpContext, messageId: string) {
    try {
      if (!messageId) {
        return response.status(400).json({ message: 'Invalid message ID' });
      }

      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!message) {
        return response.status(404).json({ message: 'Message not found' });
      }

      if (message.senderId !== context.user.id) {
        return response.status(403).json({ message: 'You are not authorized' });
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
  async deleteConversation(context: IHttpContext, userId: string) {
    if (context.user.id === userId) {
      return response
        .status(400)
        .json({ message: 'You cannot delete a conversation with yourself' });
    }

    if (!userId) {
      return response.status(400).json({ message: 'Invalid user ID' });
    }

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
        refreshTokens: {
          orderBy: {
            lastUsed: 'desc',
          },
          take: 1,
          select: {
            lastUsed: true,
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

    const activityStatusEnabled = settings.profile?.activeStatus || false;

    // Only check online status if user has enabled activity status
    const isOnline = activityStatusEnabled
      ? user.refreshTokens[0]?.lastUsed
        ? new Date().getTime() -
            new Date(user.refreshTokens[0].lastUsed).getTime() <
          10 * 60 * 1000
        : false
      : false;

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      profilePicture: user.profilePicture,
      activityStatus: isOnline,
    };
  }

  /**
   * Saves a user's subscription for push notifications.
   *
   * @param {string} userId - The ID of the user subscribing to notifications.
   * @param {any} subscription - The subscription object containing push notification details.
   * @returns {Promise<void>} A promise that resolves when the subscription is saved.
   */
  async saveSubscription(userId: string, subscription: any) {
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
   * Finds a subscription by endpoint only, regardless of user.
   *
   * @param {string} endpoint - The endpoint of the subscription to find.
   * @returns {Promise<any>} A promise that resolves to the found subscription or null.
   */
  async findSubscriptionByEndpoint(endpoint: string) {
    return this.prisma.pushSubscription.findFirst({
      where: {
        endpoint,
      },
    });
  }

  /**
   * Finds a subscription by user ID and endpoint.
   *
   * @param {string} userId - The ID of the user.
   * @param {string} endpoint - The endpoint of the subscription to find.
   * @returns {Promise<any>} A promise that resolves to the found subscription or null.
   */
  async findUserSubscriptionByEndpoint(userId: string, endpoint: string) {
    return this.prisma.pushSubscription.findFirst({
      where: {
        userId,
        endpoint,
      },
    });
  }

  /**
   * Updates an existing subscription for push notifications.
   *
   * @param {string} userId - The ID of the user subscribing to notifications.
   * @param {any} subscription - The updated subscription object.
   * @returns {Promise<any>} A promise that resolves to the updated subscription.
   */
  async updateSubscription(userId: string, subscription: any) {
    // First, find the existing subscription
    const existingSubscription = await this.prisma.pushSubscription.findFirst({
      where: {
        userId,
        endpoint: subscription.endpoint,
      },
    });

    if (!existingSubscription) {
      return null;
    }

    // Then update it with new keys
    return this.prisma.pushSubscription.update({
      where: {
        id: existingSubscription.id,
      },
      data: {
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
   * @param {string} userId - The ID of the user whose subscriptions are to be retrieved.
   * @returns {Promise<any[]>} A promise that resolves to an array of subscriptions.
   */
  async getSubscriptions(userId: string) {
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
    if (!username) {
      return { user: null, subscriptions: [] };
    }

    const user = await this.prisma.user.findFirst({
      where: { username },
    });

    if (!user) {
      return { user: null, subscriptions: [] };
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        userId: true,
        endpoint: true,
        keys: true,
      },
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

  async deleteSubscription(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: {
        userId,
        endpoint,
      },
    });

    return { message: 'Subscription deleted successfully!' };
  }

  /**
   * Creates a new group with the specified name, description, and members.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {CreateGroupDto} createGroupDto - The data transfer object containing group details.
   * @returns {Promise<any>} A promise that resolves to the created group object.
   */
  async createGroup(context: IHttpContext, createGroupDto: CreateGroupDto) {
    const { name, description, members } = createGroupDto;

    // Create the group
    const group = await this.prisma.group.create({
      data: {
        name,
        description,
        createdBy: context.user.id,
      },
    });

    // Add the creator as an admin
    await this.prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: context.user.id,
        role: 'ADMIN',
      },
    });

    // Add other members
    if (members && members.length > 0) {
      const uniqueMembers = [...new Set(members)].filter(
        (id) => id !== context.user.id,
      );

      await this.prisma.groupMember.createMany({
        data: uniqueMembers.map((userId) => ({
          groupId: group.id,
          userId,
          role: 'MEMBER',
        })),
        skipDuplicates: true,
      });
    }

    // Get the complete group with members
    const groupWithMembers = await this.prisma.group.findUnique({
      where: { id: group.id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                profilePicture: true,
              },
            },
          },
        },
      },
    });

    this.eventEmitter.emit('group.created', groupWithMembers);

    return groupWithMembers;
  }

  /**
   * Retrieves all groups for a user.
   *
   * @param {string} userId - The ID of the user.
   * @returns {Promise<any>} A promise that resolves to an array of groups.
   */
  async getUserGroups(userId: string) {
    const cacheKey = `userGroups:${userId}`;
    const cachedGroups = await this.cacheService.getCache(cacheKey);

    if (cachedGroups) {
      return JSON.parse(cachedGroups);
    }

    const groups = await this.prisma.group.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
          take: 5,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePicture: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    await this.cacheService.setCache(cacheKey, JSON.stringify(groups));
    return groups;
  }

  /**
   * Adds new members to a group.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {string} groupId - The ID of the group.
   * @param {string[]} userIds - Array of user IDs to add.
   * @returns {Promise<any>} A promise that resolves to the updated group object.
   */
  async addGroupMembers(
    context: IHttpContext,
    groupId: string,
    userIds: string[],
  ) {
    // Check if the user is an admin of the group
    const membership = await this.prisma.groupMember.findFirst({
      where: {
        groupId,
        userId: context.user.id,
        role: 'ADMIN',
      },
    });

    if (!membership) {
      return { error: 'Only group admins can add members' };
    }

    // Add new members
    const uniqueUsers = [...new Set(userIds)];
    await this.prisma.groupMember.createMany({
      data: uniqueUsers.map((userId) => ({
        groupId,
        userId,
        role: 'MEMBER',
      })),
      skipDuplicates: true,
    });

    // Clear cache
    await this.cacheService.delCache(`userGroups:${context.user.id}`);

    // Emit event for real-time updates
    this.eventEmitter.emit('group.members.added', {
      groupId,
      addedBy: context.user.id,
      newMembers: uniqueUsers,
    });

    return this.getGroupDetails(groupId);
  }

  /**
   * Removes members from a group.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {string} groupId - The ID of the group.
   * @param {string[]} userIds - Array of user IDs to remove.
   * @returns {Promise<any>} A promise that resolves to the updated group object.
   */
  async removeGroupMembers(
    context: IHttpContext,
    groupId: string,
    userIds: string[],
  ) {
    // Check if the user is an admin of the group
    const membership = await this.prisma.groupMember.findFirst({
      where: {
        groupId,
        userId: context.user.id,
        role: 'ADMIN',
      },
    });

    if (!membership) {
      return { error: 'Only group admins can remove members' };
    }

    // Remove members
    await this.prisma.groupMember.deleteMany({
      where: {
        groupId,
        userId: {
          in: userIds,
        },
        // Ensure admins can't be removed by other admins
        NOT: {
          role: 'ADMIN',
        },
      },
    });

    // Clear cache
    await this.cacheService.delCache(`userGroups:${context.user.id}`);
    for (const userId of userIds) {
      await this.cacheService.delCache(`userGroups:${userId}`);
    }

    // Emit event for real-time updates
    this.eventEmitter.emit('group.members.removed', {
      groupId,
      removedBy: context.user.id,
      removedMembers: userIds,
    });

    return this.getGroupDetails(groupId);
  }

  /**
   * Retrieves details for a specific group.
   *
   * @param {string} groupId - The ID of the group.
   * @returns {Promise<any>} A promise that resolves to the group details.
   */
  async getGroupDetails(groupId: string) {
    return this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                profilePicture: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Sends a message to a group and notifies all members.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {string} groupId - The ID of the group.
   * @param {GroupMessageDto} messageDto - The data transfer object containing the message content.
   * @returns {Promise<any>} A promise that resolves to the created message object.
   */
  async sendGroupMessage(
    context: IHttpContext,
    groupId: string,
    messageDto: GroupMessageDto,
  ) {
    // Check if user is a member of the group
    const membership = await this.prisma.groupMember.findFirst({
      where: {
        groupId,
        userId: context.user.id,
      },
    });

    if (!membership) {
      return { error: 'You are not a member of this group' };
    }

    const encryptedMessage = this.encryptionService.encrypt(messageDto.content);

    const message = await this.prisma.groupMessage.create({
      data: {
        groupId,
        senderId: context.user.id,
        content: JSON.stringify(encryptedMessage),
      },
    });

    // Emit event for real-time updates
    this.eventEmitter.emit('group.message.sent', {
      message,
      sender: context.user,
      groupId,
      content: messageDto.content,
    });

    // Clear cache
    await this.cacheService.delCache(`groupMessages:${groupId}`);

    return message;
  }

  /**
   * Retrieves messages for a specific group.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {string} groupId - The ID of the group.
   * @param {number} pageSize - The number of messages to retrieve per page.
   * @param {number} page - The page number to retrieve.
   * @returns {Promise<any[]>} A promise that resolves to an array of messages for the group.
   */
  async getGroupMessages(
    context: IHttpContext,
    groupId: string,
    pageSize: number = 20,
    page: number = 1,
  ) {
    // Check if user is a member of the group
    const membership = await this.prisma.groupMember.findFirst({
      where: {
        groupId,
        userId: context.user.id,
      },
    });

    if (!membership) {
      return { error: 'You are not a member of this group' };
    }

    const cacheKey = `groupMessages:${groupId}:${page}:${pageSize}`;
    const cachedMessages = await this.cacheService.getCache(cacheKey);

    if (cachedMessages) {
      return JSON.parse(cachedMessages);
    }

    const messages = await this.prisma.groupMessage.findMany({
      where: {
        groupId,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const messagesWithSenders = await Promise.all(
      messages.map(async (message) => {
        const sender = await this.prisma.user.findUnique({
          where: { id: message.senderId },
          select: {
            id: true,
            username: true,
            fullName: true,
            profilePicture: true,
          },
        });

        return {
          ...message,
          content: this.encryptionService.decrypt(
            JSON.parse(message.content).iv,
            JSON.parse(message.content).content,
          ),
          sender,
        };
      }),
    );

    const result = messagesWithSenders.reverse();
    await this.cacheService.setCache(cacheKey, JSON.stringify(result));

    return result;
  }

  /**
   * Initiates a call session and notifies participants.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {InitiateCallDto} callDto - The data transfer object containing call details.
   * @returns {Promise<any>} A promise that resolves to the created call session.
   */
  async initiateCall(context: IHttpContext, callDto: InitiateCallDto) {
    const { type, participants } = callDto;

    // Create call session
    const callSession = await this.prisma.callSession.create({
      data: {
        initiatorId: context.user.id,
        type,
      },
    });

    // Add initiator as participant
    await this.prisma.callParticipant.create({
      data: {
        callId: callSession.id,
        userId: context.user.id,
      },
    });

    // Emit event for real-time notification to participants
    this.eventEmitter.emit('call.initiated', {
      callId: callSession.id,
      initiator: {
        id: context.user.id,
        username: context.user.username,
        fullName: context.user.fullName,
        profilePicture: context.user.profilePicture,
      },
      participants,
      type,
    });

    return {
      callId: callSession.id,
      type,
      initiator: context.user.id,
      participants,
    };
  }

  /**
   * Records that a user has joined a call.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {string} callId - The ID of the call session.
   * @returns {Promise<any>} A promise that resolves to the updated call session.
   */
  async joinCall(context: IHttpContext, callId: string) {
    // Check if call exists
    const call = await this.prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: true,
      },
    });

    if (!call) {
      return { error: 'Call session not found' };
    }

    // Check if user is already in the call
    const existingParticipant = call.participants.find(
      (p) => p.userId === context.user.id,
    );

    if (!existingParticipant) {
      // Add user as participant
      await this.prisma.callParticipant.create({
        data: {
          callId,
          userId: context.user.id,
        },
      });
    } else if (existingParticipant.leaveTime) {
      // If user left and is rejoining, update leave time to null
      await this.prisma.callParticipant.update({
        where: { id: existingParticipant.id },
        data: { leaveTime: null },
      });
    }

    // Emit event for real-time update
    this.eventEmitter.emit('call.participant.joined', {
      callId,
      userId: context.user.id,
      username: context.user.username,
      fullName: context.user.fullName,
      profilePicture: context.user.profilePicture,
    });

    return {
      callId,
      joined: true,
    };
  }

  /**
   * Records that a user has left a call.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {string} callId - The ID of the call session.
   * @returns {Promise<any>} A promise that resolves to the updated call session.
   */
  async leaveCall(context: IHttpContext, callId: string) {
    // Find participant record
    const participant = await this.prisma.callParticipant.findFirst({
      where: {
        callId,
        userId: context.user.id,
        leaveTime: null,
      },
    });

    if (!participant) {
      return { error: 'User is not in the call' };
    }

    // Update leave time
    await this.prisma.callParticipant.update({
      where: { id: participant.id },
      data: { leaveTime: new Date() },
    });

    // Check if this was the last participant
    const remainingParticipants = await this.prisma.callParticipant.count({
      where: {
        callId,
        leaveTime: null,
      },
    });

    // If no participants remain, end the call
    if (remainingParticipants === 0) {
      await this.prisma.callSession.update({
        where: { id: callId },
        data: { endTime: new Date() },
      });
    }

    // Emit event for real-time update
    this.eventEmitter.emit('call.participant.left', {
      callId,
      userId: context.user.id,
    });

    return {
      callId,
      left: true,
      callEnded: remainingParticipants === 0,
    };
  }

  /**
   * Gets active participants in a call.
   *
   * @param {string} callId - The ID of the call session.
   * @returns {Promise<any>} A promise that resolves to the list of participants.
   */
  async getCallParticipants(callId: string) {
    const participants = await this.prisma.callParticipant.findMany({
      where: {
        callId,
        leaveTime: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            profilePicture: true,
          },
        },
      },
    });

    return participants;
  }
}
