import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { IntelligenceService } from './intelligence.service';
import { CreateChatDto } from './dtos/create-chat.dto';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  namespace: '/ai',
})
export class IntelligenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly intelligenceService: IntelligenceService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    const token = client.handshake.query.token as string;

    try {
      const payload = this.jwtService.verify(token);
      client.join(`user_${payload.sub}`);
      client.data.userId = payload.sub;
    } catch (err) {
      console.info('Invalid token:', err.message);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('chatPlainStream')
  async handleChatStreamPlain(
    @ConnectedSocket() client: Socket,
    @MessageBody() createChatDto: CreateChatDto,
  ) {
    try {
      // Get userId directly from client data (set during handleConnection)
      const userId = client.data.userId;
      if (!userId) {
        client.emit('chatError', { error: 'User not authenticated' });
        return;
      }

      client.emit('chatStarted', { status: 'processing' });

      try {
        const stream = await this.intelligenceService.processChatPlainStream(
          createChatDto.message,
          userId,
          createChatDto.chatId,
          createChatDto.model,
        );

        let chunkCount = 0;
        for await (const chunk of stream) {
          client.emit('chatChunk', { content: chunk });
          chunkCount++;

          if (chunkCount % 5 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }

        client.emit('chatComplete', { status: 'done' });
      } catch (innerError) {
        console.error('Stream processing error:', innerError);
        client.emit('chatError', {
          error: `Stream processing failed: ${innerError.message}`,
        });
      }
    } catch (error) {
      console.error('Chat handler error:', error);
      client.emit('chatError', { error: error.message });
    }
  }

  @SubscribeMessage('chatStream')
  async handleChatStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() createChatDto: CreateChatDto,
  ) {
    try {
      // Get userId directly from client data (set during handleConnection)
      const userId = client.data.userId;
      if (!userId) {
        client.emit('chatError', { error: 'User not authenticated' });
        return;
      }

      client.emit('chatStarted', { status: 'processing' });

      try {
        const stream = await this.intelligenceService.processChatStream(
          createChatDto.message,
          userId,
          createChatDto.chatId,
          createChatDto.model,
        );

        let chunkCount = 0;
        for await (const chunk of stream) {
          client.emit('chatChunk', { content: chunk });
          chunkCount++;

          if (chunkCount % 5 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }

        client.emit('chatComplete', { status: 'done' });
      } catch (innerError) {
        console.error('Stream processing error:', innerError);
        client.emit('chatError', {
          error: `Stream processing failed: ${innerError.message}`,
        });
      }
    } catch (error) {
      console.error('Chat handler error:', error);
      client.emit('chatError', { error: error.message });
    }
  }
}
