import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';

@WebSocketGateway()
export class MessagingGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.query.token as string;
    try {
      const payload = this.jwtService.verify(token);
      client.join(`user_${payload.sub}`);
      client.data.userId = payload.sub;
    } catch (err) {
      client.disconnect();
    }
  }

  @OnEvent('message.sent')
  handleMessageSent(message: any) {
    const receiverId = message.receiverId;
    this.server.to(`user_${receiverId}`).emit('refreshMessages');
  }
}
