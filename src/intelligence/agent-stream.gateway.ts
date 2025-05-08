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
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  namespace: '/agent',
})
export class AgentStreamGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly intelligenceService: IntelligenceService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
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
    // Nothing to do on disconnect for now
  }

  @SubscribeMessage('startAgentPipeline')
  async handleAgentPipeline(
    @MessageBody() data: { message: string; projectId: string; threadId?: string; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Validate required fields
      if (!data.message || !data.projectId || !data.userId) {
        client.emit('agentPipelineError', { 
          error: 'Missing required parameters (message, projectId, or userId)' 
        });
        return;
      }

      // Execute the agent pipeline with streaming callback
      await this.intelligenceService.executeAgentPipelineStream(
        data.message,
        data.projectId,
        data.threadId,
        data.userId,
        (chunk) => {
          client.emit('agentPipelineChunk', chunk);
        }
      );
      
      // Signal completion
      client.emit('agentPipelineComplete', { 
        timestamp: new Date().toISOString(),
        message: 'Agent pipeline execution completed'
      });
    } catch (err) {
      client.emit('agentPipelineError', { 
        error: err?.message || 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }
}
