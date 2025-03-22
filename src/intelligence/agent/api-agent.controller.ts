import {
  Body,
  Controller,
  Post,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AgentService } from './agent.service';
import { ExecuteAgentDto, AgentExecutionResponseDto } from './dto';

@ApiTags('Agent API')
@Controller('api/agents')
export class ApiAgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('execute')
  @ApiOperation({ summary: 'Execute an agent using an API key' })
  @ApiResponse({
    status: 200,
    description: 'Agent executed successfully',
    type: AgentExecutionResponseDto,
  })
  @ApiQuery({
    name: 'api_key',
    required: true,
    description: 'API Key for authentication',
  })
  @ApiQuery({
    name: 'agent_id',
    required: true,
    description: 'ID of the agent to execute',
  })
  async executeAgent(
    @Query('api_key') apiKey: string,
    @Query('agent_id') agentId: string,
    @Body() executeAgentDto: ExecuteAgentDto,
  ): Promise<AgentExecutionResponseDto> {
    if (!apiKey) {
      throw new BadRequestException('API key is required');
    }

    if (!agentId) {
      throw new BadRequestException('Agent ID is required');
    }

    return this.agentService.executeAgentWithApiKey(
      agentId,
      executeAgentDto,
      apiKey,
    );
  }
}
