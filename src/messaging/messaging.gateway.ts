import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';

/**
 * WebSocket gateway for managing real-time messaging connections.
 *
 * This class implements the OnGatewayConnection interface to handle WebSocket connections
 * and manage user subscriptions based on JWT authentication. It listens for events related
 * to message sending and emits updates to the appropriate users in real-time.
 */
@WebSocketGateway({
  namespace: '/messaging',
  cors: true,
})
export class MessagingGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(MessagingGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  afterInit(server: Server) {
    this.logger.log(
      `WebSocket Gateway initialized with adapter: ${server.adapter.constructor.name}`,
    );

    // Check if Redis adapter is being used
    const adapterName = server.adapter.constructor.name;
    if (adapterName.includes('Redis')) {
      this.logger.log('Redis adapter is configured correctly');
    } else {
      this.logger.warn(
        `Warning: Not using Redis adapter! Current adapter: ${adapterName}`,
      );
    }
  }

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
    this.logger.log(`Client connected: ${client.id}`);
    const token = client.handshake.query.token as string;

    if (!token) {
      this.logger.error('No token provided in connection handshake');
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      this.logger.log(`User ${userId} authenticated and connected`);

      client.join(`user_${userId}`);
      client.data.userId = userId;

      // Confirm to the client that they're connected
      client.emit('connectionStatus', { connected: true, userId });

      // Debug: list all rooms the client joined
      const rooms = Array.from(client.rooms);
      this.logger.log(`Client ${client.id} joined rooms: ${rooms.join(', ')}`);

      // Add a custom event listener for testing
      client.on('ping', (data) => {
        this.logger.log(
          `Received ping from client ${client.id}: ${JSON.stringify(data)}`,
        );
        client.emit('pong', { timestamp: new Date().toISOString() });
      });
    } catch (err) {
      this.logger.error(`Invalid token: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
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
    this.logger.log(`Message sent event received: ${JSON.stringify(message)}`);
    const { receiverId } = message;

    if (!receiverId) {
      this.logger.error('No receiverId in message.sent event');
      return;
    }

    const roomName = `user_${receiverId}`;
    this.logger.log(`Emitting refreshMessages to room: ${roomName}`);

    // Check if the room exists and has clients
    let clientCount = 0;
    try {
      // Access rooms through the server's socket adapter safely
      const rooms = this.server.sockets.adapter.rooms;
      clientCount = rooms.get(roomName)?.size || 0;
    } catch (error) {
      this.logger.error(`Error checking room clients: ${error.message}`);
    }

    this.logger.log(`Room ${roomName} has ${clientCount} connected clients`);

    this.server.to(roomName).emit('refreshMessages', {
      timestamp: new Date().toISOString(),
      messageId: message.id || 'unknown',
    });
  }
}
