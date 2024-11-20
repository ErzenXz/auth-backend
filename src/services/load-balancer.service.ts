// load-balancer.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface NodeStatus {
  nodeId: number;
  status: 'online' | 'offline' | 'busy' | 'idle';
}

@Injectable()
export class LoadBalancerService {
  private readonly nodes: Map<number, NodeStatus> = new Map();
  private readonly taskQueue: any[] = [];
  private currentNodeIndex = 0;

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.eventEmitter.on('node.status', (status: NodeStatus) => {
      this.nodes.set(status.nodeId, status);
    });
  }

  assignTask(task: any) {
    const nodeIds = Array.from(this.nodes.keys());
    if (nodeIds.length === 0) {
      console.log('No available nodes, queuing task');
      this.taskQueue.push(task);
      return;
    }

    // round-robin load balancing
    const nodeId = nodeIds[this.currentNodeIndex % nodeIds.length];
    this.currentNodeIndex++;

    this.eventEmitter.emit('task.assign', { ...task, nodeId });
    console.log(`Assigned task ${task.id} to node ${nodeId}`);
  }
}
