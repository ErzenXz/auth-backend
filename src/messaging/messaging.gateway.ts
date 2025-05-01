import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * WebSocket gateway for managing real-time messaging connections.
 *
 * This class implements the OnGatewayConnection interface to handle WebSocket connections
 * and manage user subscriptions based on JWT authentication. It listens for events related
 * to message sending and emits updates to the appropriate users in real-time.
 * It also handles call signaling for WebRTC-based voice and video calls.
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

  // Map to store active user connections
  private userSockets = new Map<string, string[]>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
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

      // Store socket ID in the userSockets map
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, [client.id]);
      } else {
        this.userSockets.get(userId).push(client.id);
      }

      // Get user's groups and subscribe to group rooms
      this.subscribeToUserGroups(client, userId);

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

  /**
   * Subscribes a user to all their group chat rooms.
   *
   * @param {Socket} client - The WebSocket client.
   * @param {string} userId - The ID of the user.
   * @returns {Promise<void>} A promise that resolves when the subscription is complete.
   */
  private async subscribeToUserGroups(client: Socket, userId: string) {
    try {
      const userGroups = await this.prisma.groupMember.findMany({
        where: { userId },
        select: { groupId: true },
      });

      // Join each group room
      for (const { groupId } of userGroups) {
        client.join(`group_${groupId}`);
        this.logger.log(`User ${userId} subscribed to group ${groupId}`);
      }
    } catch (error) {
      this.logger.error(`Error subscribing to user groups: ${error.message}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Remove the socket from userSockets map
    if (client.data.userId) {
      const userId = client.data.userId;
      const userSocketIds = this.userSockets.get(userId) || [];
      const updatedSocketIds = userSocketIds.filter((id) => id !== client.id);

      if (updatedSocketIds.length === 0) {
        this.userSockets.delete(userId);
        this.logger.log(`User ${userId} has no active connections`);
      } else {
        this.userSockets.set(userId, updatedSocketIds);
        this.logger.log(
          `User ${userId} still has ${updatedSocketIds.length} active connections`,
        );
      }
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

  /**
   * Handles the event when a group message is sent.
   *
   * This method listens for the 'group.message.sent' event and emits a 'refreshGroupMessages' event
   * to the group's WebSocket room, notifying all members to refresh their message list.
   *
   * @param {any} data - The data object containing details about the sent message.
   * @returns {void}
   */
  @OnEvent('group.message.sent')
  handleGroupMessageSent(data: any) {
    this.logger.log(
      `Group message sent event received: ${JSON.stringify(data)}`,
    );
    const { groupId, sender, content } = data;

    if (!groupId) {
      this.logger.error('No groupId in group.message.sent event');
      return;
    }

    const roomName = `group_${groupId}`;
    this.logger.log(`Emitting refreshGroupMessages to room: ${roomName}`);

    this.server.to(roomName).emit('refreshGroupMessages', {
      groupId,
      sender: {
        id: sender.id,
        username: sender.username,
        fullName: sender.fullName,
        profilePicture: sender.profilePicture,
      },
      preview: content.substring(0, 50),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handles the event when a group is created.
   *
   * @param {any} group - The group object.
   * @returns {void}
   */
  @OnEvent('group.created')
  handleGroupCreated(group: any) {
    this.logger.log(`Group created event received: ${JSON.stringify(group)}`);

    // Notify all members about the new group
    group.members.forEach((member: any) => {
      const userId = member.userId || member.user?.id;
      if (userId) {
        this.server.to(`user_${userId}`).emit('groupCreated', {
          group: {
            id: group.id,
            name: group.name,
            description: group.description,
            memberCount: group.members.length,
          },
        });
      }
    });
  }

  /**
   * Handles the event when members are added to a group.
   *
   * @param {any} data - The data object containing details about the added members.
   * @returns {void}
   */
  @OnEvent('group.members.added')
  handleGroupMembersAdded(data: any) {
    this.logger.log(
      `Group members added event received: ${JSON.stringify(data)}`,
    );
    const { groupId, newMembers } = data;

    // Notify new members that they've been added
    newMembers.forEach((userId: string) => {
      this.server.to(`user_${userId}`).emit('addedToGroup', {
        groupId,
        timestamp: new Date().toISOString(),
      });

      // Get all sockets for this user and join them to the group room
      const userSocketIds = this.userSockets.get(userId) || [];
      userSocketIds.forEach((socketId) => {
        const socket = this.server.sockets.sockets.get(socketId);
        if (socket) {
          socket.join(`group_${groupId}`);
        }
      });
    });
  }

  /**
   * Handles the event when a call is initiated.
   *
   * @param {any} data - The data object containing details about the call.
   * @returns {void}
   */
  @OnEvent('call.initiated')
  handleCallInitiated(data: any) {
    this.logger.log(`Call initiated event received: ${JSON.stringify(data)}`);
    const { callId, initiator, participants, type } = data;

    // Notify all participants about the incoming call
    participants.forEach((userId: string) => {
      this.server.to(`user_${userId}`).emit('incomingCall', {
        callId,
        initiator,
        type,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Handles the event when a user joins a call.
   *
   * @param {any} data - The data object containing details about the joined user.
   * @returns {void}
   */
  @OnEvent('call.participant.joined')
  handleCallParticipantJoined(data: any) {
    this.logger.log(
      `Call participant joined event received: ${JSON.stringify(data)}`,
    );
    const { callId, userId, username, fullName, profilePicture } = data;

    // Notify all participants that someone joined
    this.server.to(`call_${callId}`).emit('userJoinedCall', {
      callId,
      user: {
        id: userId,
        username,
        fullName,
        profilePicture,
      },
      timestamp: new Date().toISOString(),
    });

    // Join the user to the call room
    const userSocketIds = this.userSockets.get(userId) || [];
    userSocketIds.forEach((socketId) => {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket) {
        socket.join(`call_${callId}`);
      }
    });
  }

  /**
   * Handles the event when a user leaves a call.
   *
   * @param {any} data - The data object containing details about the user who left.
   * @returns {void}
   */
  @OnEvent('call.participant.left')
  handleCallParticipantLeft(data: any) {
    this.logger.log(
      `Call participant left event received: ${JSON.stringify(data)}`,
    );
    const { callId, userId } = data;

    // Notify all participants that someone left
    this.server.to(`call_${callId}`).emit('userLeftCall', {
      callId,
      userId,
      timestamp: new Date().toISOString(),
    });

    // Remove the user from the call room
    const userSocketIds = this.userSockets.get(userId) || [];
    userSocketIds.forEach((socketId) => {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(`call_${callId}`);
      }
    });
  }

  /**
   * Handles WebRTC signaling for call participants.
   *
   * @param {Socket} client - The WebSocket client.
   * @param {any} data - The signaling data.
   * @returns {Promise<void>} A promise that resolves when the signaling is complete.
   */
  @SubscribeMessage('call-signal')
  async handleCallSignal(client: Socket, data: any) {
    this.logger.log(
      `Call signal received from ${client.data.userId}: ${JSON.stringify(data)}`,
    );
    const { recipientId, callId, signalData } = data;

    if (!recipientId || !callId || !signalData) {
      this.logger.error('Missing required data for call signal');
      return;
    }

    // Forward the signal to the recipient
    this.server.to(`user_${recipientId}`).emit('call-signal', {
      callId,
      senderId: client.data.userId,
      signalData,
    });
  }

  /**
   * Handles ICE candidate exchanges for WebRTC.
   *
   * @param {Socket} client - The WebSocket client.
   * @param {any} data - The ICE candidate data.
   * @returns {Promise<void>} A promise that resolves when the ICE candidate is forwarded.
   */
  @SubscribeMessage('ice-candidate')
  async handleIceCandidate(client: Socket, data: any) {
    this.logger.log(`ICE candidate received from ${client.data.userId}`);
    const { recipientId, callId, candidate } = data;

    if (!recipientId || !callId || !candidate) {
      this.logger.error('Missing required data for ICE candidate');
      return;
    }

    // Forward the ICE candidate to the recipient
    this.server.to(`user_${recipientId}`).emit('ice-candidate', {
      callId,
      senderId: client.data.userId,
      candidate,
    });
  }
}
