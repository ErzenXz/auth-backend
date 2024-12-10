import { IsString, IsEnum } from 'class-validator';

/**
 * Data transfer object for executing commands on nodes
 * @class ExecuteCommandDto
 *
 * @property {string} targetNodeId - The ID of the target node to execute command on
 * @property {'start' | 'stop' | 'restart' | 'status'} command - The command to execute on the target node
 *
 * @swagger
 * @ApiProperty({ description: 'The ID of the target node', type: String })
 * @ApiProperty({ description: 'Command to execute', enum: ['start', 'stop', 'restart', 'status'] })
 */
export class ExecuteCommandDto {
  @IsString()
  targetNodeId: string;

  @IsEnum(['start', 'stop', 'restart', 'status'])
  command: 'start' | 'stop' | 'restart' | 'status';
}
