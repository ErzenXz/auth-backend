import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { AgentService } from './agent.service';
import { IHttpContext } from 'src/auth/models';
import {
  CreateAgentDto,
  UpdateAgentDto,
  CreateAgentStepDto,
  UpdateAgentStepDto,
  CreateAgentCredentialDto,
  UpdateAgentCredentialDto,
  CreateAgentVariableDto,
  UpdateAgentVariableDto,
  ExecuteAgentDto,
  AgentExecutionResponseDto,
} from './dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { HttpContext } from 'src/auth/decorators/headers.decorator';

@ApiTags('Agents')
@Controller('agents')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new agent' })
  @ApiResponse({ status: 201, description: 'The agent has been created' })
  @Auth()
  async createAgent(
    @Body() createAgentDto: CreateAgentDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.agentService.createAgent(createAgentDto, context.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all agents for the current user' })
  @ApiResponse({ status: 200, description: 'List of agents' })
  @Auth()
  async getAgents(@HttpContext() context: IHttpContext) {
    return this.agentService.getAgents(context.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific agent by ID' })
  @ApiResponse({ status: 200, description: 'Agent found' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @Auth()
  async getAgent(
    @Param('id') id: string,
    @HttpContext() context: IHttpContext,
  ) {
    return this.agentService.getAgent(id, context.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing agent' })
  @ApiResponse({ status: 200, description: 'Agent updated' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @Auth()
  async updateAgent(
    @Param('id') id: string,
    @Body() updateAgentDto: UpdateAgentDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.agentService.updateAgent(id, updateAgentDto, context.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an agent' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Agent deleted' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @Auth()
  async deleteAgent(
    @Param('id') id: string,
    @HttpContext() context: IHttpContext,
  ) {
    await this.agentService.deleteAgent(id, context.user.id);
  }

  // Steps endpoints
  @Post(':agentId/steps')
  @ApiOperation({ summary: 'Add a step to an agent' })
  @ApiResponse({ status: 201, description: 'Step added' })
  @Auth()
  async addStep(
    @Param('agentId') agentId: string,
    @Body() createStepDto: CreateAgentStepDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.agentService.addStep(agentId, createStepDto, context.user.id);
  }

  @Put(':agentId/steps/:stepId')
  @ApiOperation({ summary: 'Update a step' })
  @ApiResponse({ status: 200, description: 'Step updated' })
  @Auth()
  async updateStep(
    @Param('agentId') agentId: string,
    @Param('stepId') stepId: string,
    @Body() updateStepDto: UpdateAgentStepDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.agentService.updateStep(
      agentId,
      stepId,
      updateStepDto,
      context.user.id,
    );
  }

  @Delete(':agentId/steps/:stepId')
  @ApiOperation({ summary: 'Delete a step' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Step deleted' })
  @Auth()
  async deleteStep(
    @Param('agentId') agentId: string,
    @Param('stepId') stepId: string,
    @HttpContext() context: IHttpContext,
  ) {
    await this.agentService.deleteStep(agentId, stepId, context.user.id);
  }

  // Credentials endpoints
  @Post(':agentId/credentials')
  @ApiOperation({ summary: 'Add a credential to an agent' })
  @ApiResponse({ status: 201, description: 'Credential added' })
  @Auth()
  async addCredential(
    @Param('agentId') agentId: string,
    @Body() createCredentialDto: CreateAgentCredentialDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.agentService.addCredential(
      agentId,
      createCredentialDto,
      context.user.id,
    );
  }

  @Put(':agentId/credentials/:credentialId')
  @ApiOperation({ summary: 'Update a credential' })
  @ApiResponse({ status: 200, description: 'Credential updated' })
  @Auth()
  async updateCredential(
    @Param('agentId') agentId: string,
    @Param('credentialId') credentialId: string,
    @Body() updateCredentialDto: UpdateAgentCredentialDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.agentService.updateCredential(
      agentId,
      credentialId,
      updateCredentialDto,
      context.user.id,
    );
  }

  @Delete(':agentId/credentials/:credentialId')
  @ApiOperation({ summary: 'Delete a credential' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Credential deleted' })
  @Auth()
  async deleteCredential(
    @Param('agentId') agentId: string,
    @Param('credentialId') credentialId: string,
    @HttpContext() context: IHttpContext,
  ) {
    await this.agentService.deleteCredential(
      agentId,
      credentialId,
      context.user.id,
    );
  }

  // Variables endpoints
  @Post(':agentId/variables')
  @ApiOperation({ summary: 'Add a variable to an agent' })
  @ApiResponse({ status: 201, description: 'Variable added' })
  @Auth()
  async addVariable(
    @Param('agentId') agentId: string,
    @Body() createVariableDto: CreateAgentVariableDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.agentService.addVariable(
      agentId,
      createVariableDto,
      context.user.id,
    );
  }

  @Put(':agentId/variables/:variableId')
  @ApiOperation({ summary: 'Update a variable' })
  @ApiResponse({ status: 200, description: 'Variable updated' })
  @Auth()
  async updateVariable(
    @Param('agentId') agentId: string,
    @Param('variableId') variableId: string,
    @Body() updateVariableDto: UpdateAgentVariableDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.agentService.updateVariable(
      agentId,
      variableId,
      updateVariableDto,
      context.user.id,
    );
  }

  @Delete(':agentId/variables/:variableId')
  @ApiOperation({ summary: 'Delete a variable' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Variable deleted' })
  @Auth()
  async deleteVariable(
    @Param('agentId') agentId: string,
    @Param('variableId') variableId: string,
    @HttpContext() context: IHttpContext,
  ) {
    await this.agentService.deleteVariable(
      agentId,
      variableId,
      context.user.id,
    );
  }

  // Execution endpoint
  @Post(':id/execute')
  @ApiOperation({ summary: 'Execute an agent' })
  @ApiResponse({
    status: 200,
    description: 'Agent executed successfully',
    type: AgentExecutionResponseDto,
  })
  @Auth()
  async executeAgent(
    @Param('id') id: string,
    @Body() executeAgentDto: ExecuteAgentDto,
    @HttpContext() context: IHttpContext,
  ): Promise<AgentExecutionResponseDto> {
    return this.agentService.executeAgent(id, executeAgentDto, context.user.id);
  }

  // Execution history endpoints
  @Get(':id/executions')
  @ApiOperation({ summary: 'Get execution history for an agent' })
  @ApiResponse({ status: 200, description: 'List of executions' })
  @Auth()
  async getExecutions(
    @Param('id') id: string,
    @HttpContext() context: IHttpContext,
  ) {
    return this.agentService.getExecutions(id, context.user.id);
  }

  @Get(':id/executions/:executionId')
  @ApiOperation({ summary: 'Get a specific execution' })
  @ApiResponse({ status: 200, description: 'Execution found' })
  @Auth()
  async getExecution(
    @Param('id') id: string,
    @Param('executionId') executionId: string,
    @HttpContext() context: IHttpContext,
  ) {
    return this.agentService.getExecution(id, executionId, context.user.id);
  }
}
