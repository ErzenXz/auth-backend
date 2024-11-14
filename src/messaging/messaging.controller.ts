import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessageDto } from './dtos/message.dto';
import { Auth, HttpContext } from 'src/auth/decorators';
import { IHttpContext } from 'src/auth/models';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Messaging')
@Controller('messaging')
export class MessagingController {
  constructor(private messagingService: MessagingService) {}

  @Post('send/:username')
  @Auth()
  async sendMessage(
    @Param('username') username: string,
    @Body() messageDto: MessageDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.messagingService.sendMessage(context, username, messageDto);
  }

  @Get('conversations')
  @Auth()
  async getConversations(@HttpContext() context: IHttpContext) {
    return this.messagingService.getConversationThreads(context.user.id);
  }

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

  @Get('searchUsers')
  @Auth()
  async searchUsers(@Query('query') query: string) {
    return this.messagingService.searchUsers(query);
  }

  @Get('unreadMessages')
  @Auth()
  async getUnreadMessages(@HttpContext() context: IHttpContext) {
    return this.messagingService.getUnreadMessages(context);
  }

  @Delete('delete/:messageId')
  @Auth()
  async deleteMessage(
    @HttpContext() context: IHttpContext,
    @Param('messageId') messageId: number,
  ) {
    return this.messagingService.deleteMessage(context, messageId);
  }

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

  @Get('userInfo/:username')
  @Auth()
  async getUserInfo(
    @Param('username') username: string,
    @HttpContext() context: IHttpContext,
  ) {
    return this.messagingService.getUserInfo(username);
  }
}
