import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessageDto } from './dtos/message.dto';
import { Auth, HttpContext } from 'src/auth/decorators';
import { IHttpContext } from 'src/auth/models';
import { ApiTags } from '@nestjs/swagger';
import * as webPush from 'web-push';

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
      const subscriptions =
        await this.messagingService.findUserAndSubscriptionsByUsername(
          username,
        );
      for (const subscription of subscriptions.subscriptions) {
        if (subscription.endpoint) {
          await webPush.sendNotification(
            subscription,
            JSON.stringify({
              title: 'New Message from ' + context.user.fullName,
              body: messageDto.content,
            }),
          );
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
    @Param('conversationUserId') conversationUserId: number,
    @Query('pageSize') pageSize = 20,
    @Query('page') page = 1,
  ) {
    if (!conversationUserId) {
      return [];
    }

    return this.messagingService.getMessagesForConversation(
      context.user.id,
      +conversationUserId,
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
    @Param('messageId') messageId: number,
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
    @Param('conversationUserId') conversationUserId: number,
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
    await this.messagingService.saveSubscription(userId, subscription);
    return { message: 'Subscription saved successfully!' };
  }

  /**
   * Deletes a user's subscription for push notifications.
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
    const { userId } = context.user;
    const { endpoint } = subscription;

    return await this.messagingService.deleteSubscription(userId, endpoint);
  }
}
