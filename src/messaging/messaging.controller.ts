import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessageDto } from './dtos/message.dto';
import { Auth, HttpContext } from 'src/auth/decorators';
import { IHttpContext } from 'src/auth/models';

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
}
