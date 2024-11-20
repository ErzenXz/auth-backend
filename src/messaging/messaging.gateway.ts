import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * WebSocket gateway for managing real-time messaging connections.
 *
 * This class implements the OnGatewayConnection interface to handle WebSocket connections
 * and manage user subscriptions based on JWT authentication. It listens for events related
 * to message sending and emits updates to the appropriate users in real-time.
 */
@WebSocketGateway({
  namespace: '/messaging',
})
export class MessagingGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) {}

  /**
   * Handles a new WebSocket connection from a client.
   *
   * This method verifies the JWT token provided in the connection handshake,
   * joins the client to a specific room based on the user ID, and stores the user ID
   * in the client's data for future reference. If the token is invalid, the client is disconnected.
   *
   * @param {Socket} client - The WebSocket client that is connecting.
   * @returns {Promise<void>} A promise that resolves when the connection handling is complete.
   * @throws {Error} Throws an error if the JWT token verification fails.
   */
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

  /**
   * Handles the event when a message is sent.
   *
   * This method listens for the 'message.sent' event and emits a 'refreshMessages' event
   * to the receiver's WebSocket room, notifying them to refresh their message list.
   *
   * @param {any} message - The message object containing details about the sent message.
   * @param {string} message.receiverId - The ID of the user who is the intended recipient of the message.
   * @returns {void}
   */
  @OnEvent('message.sent')
  handleMessageSent(message: any) {
    const { receiverId } = message;
    this.server.to(`user_${receiverId}`).emit('refreshMessages');
  }
}
