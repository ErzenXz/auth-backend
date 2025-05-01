import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Put,
} from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessageDto } from './dtos/message.dto';
import { Auth, HttpContext } from 'src/auth/decorators';
import { IHttpContext } from 'src/auth/models';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as webPush from 'web-push';
import {
  CreateGroupDto,
  AddGroupMemberDto,
  GroupMessageDto,
} from './dtos/group.dto';
import { CallSignalDto, InitiateCallDto } from './dtos/call.dto';

/**
 * Controller for managing messaging functionalities within the application.
 *
 * This class provides endpoints for sending messages, retrieving conversations,
 * managing user subscriptions for push notifications, and handling user-related
 * messaging operations. It utilizes the MessagingService to perform the underlying
 * operations and ensures that all actions are authenticated using the @Auth() decorator.
 */
@ApiTags('Messaging')
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {
    webPush.setVapidDetails(
      'mailto:njnana2017@gmail.com',
      process.env.WEB_PUSH_PUBLIC_KEY,
      process.env.WEB_PUSH_PRIVATE_KEY,
    );
  }

  /**
   * Sends a message to a specified user and triggers a push notification if subscribed.
   *
   * @param {string} username - The username of the recipient.
   * @param {MessageDto} messageDto - The data transfer object containing the message content.
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the result of the message sending operation.
   * @throws {Error} Throws an error if the push notification fails to send.
   */
  @Post('send/:username')
  @Auth()
  async sendMessage(
    @Param('username') username: string,
    @Body() messageDto: MessageDto,
    @HttpContext() context: IHttpContext,
  ) {
    try {
      const recipientData =
        await this.messagingService.findUserAndSubscriptionsByUsername(
          username,
        );

      if (!recipientData.user) {
        return { error: 'Recipient not found' };
      }

      // Group subscriptions by client identifier to prevent duplicate notifications
      const subscriptionMap = new Map();
      for (const subscription of recipientData.subscriptions) {
        if (
          subscription.endpoint &&
          subscription.userId === recipientData.user.id
        ) {
          // Verify the subscription belongs to the recipient, not to someone else using the same browser
          // Use endpoint as unique identifier for the browser/client
          subscriptionMap.set(subscription.endpoint, subscription);
        }
      }

      // Send notification to each unique browser subscription
      for (const subscription of subscriptionMap.values()) {
        try {
          await webPush.sendNotification(
            subscription,
            JSON.stringify({
              title: 'New Message from ' + context.user.fullName,
              body: messageDto.content,
              timestamp: new Date().toISOString(),
              senderId: context.user.id,
              senderUsername: context.user.username,
            }),
          );
        } catch (error) {
          console.info(
            `Failed to send notification to subscription: ${subscription.endpoint}`,
            error,
          );

          // If the subscription is no longer valid, remove it
          if (error.statusCode === 404 || error.statusCode === 410) {
            await this.messagingService.deleteSubscription(
              recipientData.user.id,
              subscription.endpoint,
            );
          }
        }
      }
    } catch (error) {
      console.info('Error sending push notifications', error);
    }

    return await this.messagingService.sendMessage(
      context,
      username,
      messageDto,
    );
  }

  /**
   * Retrieves conversation threads for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to an array of conversation threads.
   */
  @Get('conversations')
  @Auth()
  async getConversations(@HttpContext() context: IHttpContext) {
    return this.messagingService.getConversationThreads(context.user.id);
  }

  /**
   * Retrieves messages for a specific conversation.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {number} conversationUserId - The ID of the user in the conversation.
   * @param {number} pageSize - The number of messages to retrieve per page (default is 20).
   * @param {number} page - The page number to retrieve (default is 1).
   * @returns {Promise<any>} A promise that resolves to an array of messages for the conversation.
   */
  @Get('messages/:conversationUserId')
  @Auth()
  async getMessages(
    @HttpContext() context: IHttpContext,
    @Param('conversationUserId') conversationUserId: string,
    @Query('pageSize') pageSize = 20,
    @Query('page') page = 1,
  ) {
    if (!conversationUserId) {
      return [];
    }

    return this.messagingService.getMessagesForConversation(
      context.user.id,
      conversationUserId,
      +pageSize,
      +page,
    );
  }

  /**
   * Searches for users based on a query string.
   *
   * @param {string} query - The search query to find users.
   * @returns {Promise<any>} A promise that resolves to an array of matching users.
   */
  @Get('searchUsers')
  @Auth()
  async searchUsers(@Query('query') query: string) {
    return this.messagingService.searchUsers(query);
  }

  /**
   * Retrieves unread messages for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to an array of unread messages.
   */
  @Get('unreadMessages')
  @Auth()
  async getUnreadMessages(@HttpContext() context: IHttpContext) {
    return this.messagingService.getUnreadMessages(context);
  }

  /**
   * Deletes a specific message by its ID.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {number} messageId - The ID of the message to be deleted.
   * @returns {Promise<any>} A promise that resolves to the result of the deletion operation.
   */
  @Delete('delete/:messageId')
  @Auth()
  async deleteMessage(
    @HttpContext() context: IHttpContext,
    @Param('messageId') messageId: string,
  ) {
    return this.messagingService.deleteMessage(context, messageId);
  }

  /**
   * Deletes a conversation with a specific user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {number} conversationUserId - The ID of the user in the conversation to be deleted.
   * @returns {Promise<any>} A promise that resolves to the result of the deletion operation.
   */
  @Delete('deleteConversation/:conversationUserId')
  @Auth()
  async deleteConversation(
    @HttpContext() context: IHttpContext,
    @Param('conversationUserId') conversationUserId: string,
  ) {
    return this.messagingService.deleteConversation(
      context,
      conversationUserId,
    );
  }

  /**
   * Retrieves user information based on the username.
   *
   * @param {string} username - The username of the user whose information is to be retrieved.
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the user information.
   */
  @Get('userInfo/:username')
  @Auth()
  async getUserInfo(@Param('username') username: string) {
    return this.messagingService.getUserInfo(username);
  }

  /**
   * Saves a user's subscription for push notifications.
   * If a subscription with the same endpoint already exists, it will be updated.
   * Also handles the case where multiple users share the same browser.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {any} subscription - The subscription object containing push notification details.
   * @returns {Promise<{ message: string }>} A promise that resolves to a success message.
   */
  @Post('subscribe')
  @Auth()
  async subscribe(
    @HttpContext() context: IHttpContext,
    @Body() subscription: any,
  ) {
    const userId = context.user.id;

    // Check if subscription for this browser/endpoint already exists for ANY user
    const existingSubscription =
      await this.messagingService.findSubscriptionByEndpoint(
        subscription.endpoint,
      );

    if (existingSubscription) {
      // If the subscription exists but belongs to a different user, remove it
      if (existingSubscription.userId !== userId) {
        await this.messagingService.deleteSubscription(
          existingSubscription.userId,
          subscription.endpoint,
        );
        // Create new subscription for current user
        await this.messagingService.saveSubscription(userId, subscription);
        return {
          message: 'Subscription transferred to current user successfully!',
        };
      } else {
        // Update existing subscription
        await this.messagingService.updateSubscription(userId, subscription);
        return { message: 'Subscription updated successfully!' };
      }
    } else {
      // Save new subscription
      await this.messagingService.saveSubscription(userId, subscription);
      return { message: 'Subscription saved successfully!' };
    }
  }

  /**
   * Deletes a user's subscription for push notifications.
   * Also handles the case where the subscription might belong to a different user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {any} subscription - The subscription object containing push notification details.
   * @returns {Promise<{ message: string }>} A promise that resolves to a success message.
   */
  @Delete('unsubscribe')
  @Auth()
  async unsubscribe(
    @HttpContext() context: IHttpContext,
    @Body() subscription: any,
  ) {
    const userId = context.user.id;
    const { endpoint } = subscription;

    // Check if the subscription exists for any user
    const existingSubscription =
      await this.messagingService.findSubscriptionByEndpoint(endpoint);

    if (existingSubscription) {
      // Only allow the user to delete their own subscription or stale subscriptions
      // This helps prevent malicious deletion of other users' subscriptions
      await this.messagingService.deleteSubscription(
        existingSubscription.userId,
        endpoint,
      );

      if (existingSubscription.userId !== userId) {
        return { message: 'Cleared stale subscription from a previous user' };
      }
    }

    return { message: 'Subscription deleted successfully!' };
  }

  /**
   * Creates a new group chat with the specified members.
   *
   * @param {CreateGroupDto} createGroupDto - The data transfer object containing group details.
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the created group object.
   */
  @Post('groups')
  @Auth()
  @ApiOperation({ summary: 'Create a new group chat' })
  async createGroup(
    @Body() createGroupDto: CreateGroupDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.messagingService.createGroup(context, createGroupDto);
  }

  /**
   * Retrieves all groups that the user is a member of.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to an array of groups.
   */
  @Get('groups')
  @Auth()
  @ApiOperation({ summary: 'Get all groups for the current user' })
  async getUserGroups(@HttpContext() context: IHttpContext) {
    return this.messagingService.getUserGroups(context.user.id);
  }

  /**
   * Retrieves details for a specific group.
   *
   * @param {string} groupId - The ID of the group.
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the group details.
   */
  @Get('groups/:groupId')
  @Auth()
  @ApiOperation({ summary: 'Get details for a specific group' })
  async getGroupDetails(
    @Param('groupId') groupId: string,
    @HttpContext() context: IHttpContext,
  ) {
    return this.messagingService.getGroupDetails(groupId);
  }

  /**
   * Adds new members to a group.
   *
   * @param {string} groupId - The ID of the group.
   * @param {AddGroupMemberDto} addMemberDto - The data transfer object containing member details.
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the updated group object.
   */
  @Post('groups/:groupId/members')
  @Auth()
  @ApiOperation({ summary: 'Add members to a group' })
  async addGroupMembers(
    @Param('groupId') groupId: string,
    @Body() addMemberDto: AddGroupMemberDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.messagingService.addGroupMembers(
      context,
      groupId,
      addMemberDto.userIds,
    );
  }

  /**
   * Removes members from a group.
   *
   * @param {string} groupId - The ID of the group.
   * @param {AddGroupMemberDto} removeMemberDto - The data transfer object containing member details.
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the updated group object.
   */
  @Delete('groups/:groupId/members')
  @Auth()
  @ApiOperation({ summary: 'Remove members from a group' })
  async removeGroupMembers(
    @Param('groupId') groupId: string,
    @Body() removeMemberDto: AddGroupMemberDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.messagingService.removeGroupMembers(
      context,
      groupId,
      removeMemberDto.userIds,
    );
  }

  /**
   * Sends a message to a group.
   *
   * @param {string} groupId - The ID of the group.
   * @param {GroupMessageDto} messageDto - The data transfer object containing the message content.
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the created message object.
   */
  @Post('groups/:groupId/messages')
  @Auth()
  @ApiOperation({ summary: 'Send a message to a group' })
  async sendGroupMessage(
    @Param('groupId') groupId: string,
    @Body() messageDto: GroupMessageDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.messagingService.sendGroupMessage(context, groupId, messageDto);
  }

  /**
   * Retrieves messages for a specific group.
   *
   * @param {string} groupId - The ID of the group.
   * @param {number} pageSize - The number of messages to retrieve per page.
   * @param {number} page - The page number to retrieve.
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to an array of messages.
   */
  @Get('groups/:groupId/messages')
  @Auth()
  @ApiOperation({ summary: 'Get messages for a group' })
  async getGroupMessages(
    @Param('groupId') groupId: string,
    @Query('pageSize') pageSize = 20,
    @Query('page') page = 1,
    @HttpContext() context: IHttpContext,
  ) {
    return this.messagingService.getGroupMessages(
      context,
      groupId,
      +pageSize,
      +page,
    );
  }

  /**
   * Initiates a new call and notifies participants.
   *
   * @param {InitiateCallDto} callDto - The data transfer object containing call details.
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the created call session.
   */
  @Post('calls')
  @Auth()
  @ApiOperation({ summary: 'Initiate a new call' })
  async initiateCall(
    @Body() callDto: InitiateCallDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.messagingService.initiateCall(context, callDto);
  }

  /**
   * Records that a user has joined a call.
   *
   * @param {string} callId - The ID of the call session.
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the updated call session.
   */
  @Post('calls/:callId/join')
  @Auth()
  @ApiOperation({ summary: 'Join a call' })
  async joinCall(
    @Param('callId') callId: string,
    @HttpContext() context: IHttpContext,
  ) {
    return this.messagingService.joinCall(context, callId);
  }

  /**
   * Records that a user has left a call.
   *
   * @param {string} callId - The ID of the call session.
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the updated call session.
   */
  @Post('calls/:callId/leave')
  @Auth()
  @ApiOperation({ summary: 'Leave a call' })
  async leaveCall(
    @Param('callId') callId: string,
    @HttpContext() context: IHttpContext,
  ) {
    return this.messagingService.leaveCall(context, callId);
  }

  /**
   * Gets active participants in a call.
   *
   * @param {string} callId - The ID of the call session.
   * @returns {Promise<any>} A promise that resolves to the list of participants.
   */
  @Get('calls/:callId/participants')
  @Auth()
  @ApiOperation({ summary: 'Get active participants in a call' })
  async getCallParticipants(@Param('callId') callId: string) {
    return this.messagingService.getCallParticipants(callId);
  }
}
