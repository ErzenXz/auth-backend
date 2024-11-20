// command-control.service.ts
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';

export interface Node {
  nodeId: string;
  ipAddress: string;
  port: number;
}

@Injectable()
export class CommandControlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommandControlService.name);
  private readonly nodes: Map<string, Node> = new Map();
  private currentNode: Node;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  onModuleInit() {
    const nodeId = uuidv4();
    process.env.NODE_ID = nodeId;
    const ipAddress = this.getLocalIpAddress();
    const port = Number(process.env.PORT) || 3000;

    this.currentNode = { nodeId, ipAddress, port };
    const added = this.addNode(this.currentNode);
    if (added) {
      this.logger.log(
        `Current node added: ${JSON.stringify(this.currentNode)}`,
      );
      this.eventEmitter.emit('node.added', this.currentNode);
      console.log(`Node ID: ${nodeId}`);
    }
  }

  onModuleDestroy() {
    if (this.currentNode) {
      const removed = this.removeNode(this.currentNode.nodeId);
      if (removed) {
        this.logger.log(`Current node removed: ${this.currentNode.nodeId}`);
        this.eventEmitter.emit('node.removed', this.currentNode);
      }
    }
  }

  addNode(node: Node): boolean {
    if (this.nodes.has(node.nodeId)) {
      this.logger.warn(`Node ID ${node.nodeId} already exists.`);
      return false;
    }
    this.nodes.set(node.nodeId, node);
    this.logger.log(`Node ID ${node.nodeId} added.`);
    return true;
  }

  removeNode(nodeId: string): boolean {
    if (this.nodes.delete(nodeId)) {
      this.logger.log(`Node ID ${nodeId} removed.`);
      return true;
    }
    this.logger.warn(`Node ID ${nodeId} not found.`);
    return false;
  }

  controlNode(nodeId: string, action: 'start' | 'stop' | 'restart'): void {
    if (!this.nodes.has(nodeId)) {
      this.logger.warn(`Node ID ${nodeId} does not exist.`);
      return;
    }
    this.logger.log(`Emitting control action: ${action} for node: ${nodeId}`);
    this.eventEmitter.emit('control', { nodeId, action });
  }

  stopAll(): void {
    this.logger.log('Stopping all nodes.');
    this.nodes.forEach((_, nodeId) => {
      this.controlNode(nodeId, 'stop');
    });
  }

  restartAll(): void {
    this.logger.log('Restarting all nodes.');
    this.nodes.forEach((_, nodeId) => {
      this.controlNode(nodeId, 'restart');
    });
  }

  getAllNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  private getLocalIpAddress(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  @OnEvent('node.added')
  handleNodeAdded(node: Node) {
    if (node.nodeId === this.currentNode.nodeId) {
      // Ignore events emitted by self
      return;
    }
    const added = this.addNode(node);
    if (added) {
      this.logger.log(`Node added from event: ${node.nodeId}`);
    }
  }

  @OnEvent('node.removed')
  handleNodeRemoved(node: Node) {
    if (node.nodeId === this.currentNode.nodeId) {
      // Ignore events emitted by self
      return;
    }
    const removed = this.removeNode(node.nodeId);
    if (removed) {
      this.logger.log(`Node removed from event: ${node.nodeId}`);
    }
  }

  @OnEvent('control')
  handleControlCommand(command: {
    nodeId: string;
    action: 'start' | 'stop' | 'restart';
  }) {
    this.logger.log(`Control command received: ${JSON.stringify(command)}`);
    if (command.nodeId === this.currentNode.nodeId) {
      if (command.action === 'stop' || command.action === 'restart') {
        process.exit(0);
      }
    }
  }
}
