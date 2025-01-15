// command-control.service.ts
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';

export interface Node {
  nodeId: string;
  ipAddress: string;
  port: number;
  lastHeartbeat: number;
  status: 'active' | 'inactive';
  isLeader: boolean;
  tasksInProgress: number;
}

@Injectable()
export class CommandControlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommandControlService.name);
  private readonly nodesKey = 'active_nodes';
  private currentNode: Node;
  private redisClient: Redis;
  private subscriber: Redis;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.redisClient = new Redis({
      host: process.env.REDIS_URL,
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      username: process.env.REDIS_USER || 'default',
      password: process.env.REDIS_PASSWORD,
    });
    this.subscriber = this.redisClient.duplicate();
  }

  async onModuleInit() {
    const nodeId = uuidv4();
    const ipAddress = this.getLocalIpAddress();
    const port = Number(process.env.PORT) || 3000;

    this.currentNode = {
      nodeId,
      ipAddress,
      port,
      lastHeartbeat: Date.now(),
      status: 'active',
      isLeader: false,
      tasksInProgress: 0,
    };

    await this.registerNode();

    // Start heartbeat
    setInterval(() => this.sendHeartbeat(), 5000);

    // Start cleanup of stale nodes
    this.cleanupInterval = setInterval(() => this.cleanupStaleNodes(), 10000);

    // Elect leader
    setTimeout(() => this.electLeader(), 1000);

    // Subscribe to commands and tasks
    this.subscribeToChannels();
  }

  async onModuleDestroy() {
    await this.unregisterNode();
    await this.redisClient.quit();
    await this.subscriber.quit();
    clearInterval(this.cleanupInterval);
  }

  private async registerNode() {
    await this.redisClient.set(
      `${this.nodesKey}:${this.currentNode.nodeId}`,
      JSON.stringify(this.currentNode),
      'EX',
      20,
    );
    this.logger.log(`Node registered: ${this.currentNode.nodeId}`);
  }

  private async unregisterNode() {
    await this.redisClient.hdel(this.nodesKey, this.currentNode.nodeId);
    this.logger.log(`Node unregistered: ${this.currentNode.nodeId}`);
  }

  private async sendHeartbeat() {
    this.currentNode.lastHeartbeat = Date.now();
    await this.redisClient.set(
      `${this.nodesKey}:${this.currentNode.nodeId}`,
      JSON.stringify(this.currentNode),
      'EX',
      20,
    );
  }

  async getAllNodes(): Promise<Node[]> {
    const keys = await this.redisClient.keys(`${this.nodesKey}:*`);
    const nodes: Node[] = [];

    if (keys.length === 0) {
      return nodes;
    }

    const values = await this.redisClient.mget(keys);

    for (const value of values) {
      if (value) {
        const node: Node = JSON.parse(value);
        node.status = 'active';
        nodes.push(node);
      }
    }
    return nodes;
  }

  async currentNodeServer(): Promise<Node> {
    return this.currentNode;
  }

  private async cleanupStaleNodes() {
    const nodesData = await this.redisClient.hgetall(this.nodesKey);

    for (const key of Object.keys(nodesData)) {
      const node: Node = JSON.parse(nodesData[key]);
      if (Date.now() - node.lastHeartbeat >= 15000) {
        await this.redisClient.hdel(this.nodesKey, key);
        this.logger.log(`Removed stale node: ${key}`);
      }
    }
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

  private async electLeader() {
    const nodes = await this.getAllNodes();
    if (nodes.length === 0) {
      this.currentNode.isLeader = true;
      await this.registerNode();
      return;
    }

    const sortedNodes = [...nodes].sort((a, b) =>
      a.nodeId.localeCompare(b.nodeId),
    );
    const leaderNode = sortedNodes[0];

    if (leaderNode.nodeId === this.currentNode.nodeId) {
      this.currentNode.isLeader = true;
      await this.registerNode();
      this.logger.log('This node has been elected as the leader.');
    } else {
      this.currentNode.isLeader = false;
      await this.registerNode();
    }
  }

  async executeRemoteCommand(
    targetNodeId: string,
    command: 'start' | 'stop' | 'restart' | 'status',
  ): Promise<void> {
    // Publish command to the target node
    await this.redisClient.publish(
      `node-command:${targetNodeId}`,
      JSON.stringify({ command }),
    );
    this.logger.log(`Command '${command}' sent to node ${targetNodeId}`);
  }

  async distributeTask(taskData: any): Promise<void> {
    const nodes = await this.getAllNodes();
    // Find the node with the least tasks in progress
    const targetNode = nodes.reduce((prev, curr) =>
      prev.tasksInProgress < curr.tasksInProgress ? prev : curr,
    );
    // Publish task to the target node
    await this.redisClient.publish(
      `node-task:${targetNode.nodeId}`,
      JSON.stringify(taskData),
    );
    this.logger.log(`Task distributed to node ${targetNode.nodeId}`);
  }

  private subscribeToChannels() {
    this.subscriber.subscribe(
      `node-command:${this.currentNode.nodeId}`,
      `node-task:${this.currentNode.nodeId}`,
    );

    this.subscriber.on('message', (channel, message) => {
      if (channel === `node-command:${this.currentNode.nodeId}`) {
        const { command } = JSON.parse(message);
        this.handleCommand(command);
      } else if (channel === `node-task:${this.currentNode.nodeId}`) {
        const taskData = JSON.parse(message);
        this.handleTask(taskData);
      }
    });
  }

  private handleCommand(command: string) {
    switch (command) {
      case 'start':
        // Implement start logic
        this.logger.log(`Start command received.`);
        break;
      case 'stop':
        // Implement stop logic
        this.logger.log(`Stop command received. Shutting down.`);
        process.exit(0);
      case 'restart':
        // Implement restart logic
        this.logger.log(`Restart command received. Restarting.`);
        process.exit(0);
      case 'status':
        // Implement status report
        this.logger.log(`Status command received.`);
        break;
    }
  }

  private async handleTask(taskData: any) {
    try {
      this.currentNode.tasksInProgress++;
      await this.registerNode();
      // Process the task
      // ... task processing logic ...
      this.logger.log(`Task received and processing started.`);
    } catch (error) {
      this.logger.error(`Error processing task: ${error.message}`);
    } finally {
      this.currentNode.tasksInProgress--;
      await this.registerNode();
    }
  }

  async getNodeStatistics(): Promise<any> {
    const nodes = await this.getAllNodes();
    return nodes.map((node) => ({
      nodeId: node.nodeId,
      ipAddress: node.ipAddress,
      port: node.port,
      status: node.status,
      isLeader: node.isLeader,
      tasksInProgress: node.tasksInProgress,
    }));
  }
}
