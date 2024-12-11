export class NodeStatsDto {
  nodeId: string;
  ipAddress: string;
  port: number;
  status: 'active' | 'inactive';
  isLeader: boolean;
  tasksInProgress: number;
}
