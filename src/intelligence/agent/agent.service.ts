import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AgentExecutionService } from './services/agent-execution.service';
import { CredentialManagerService } from './services/credential-manager.service';
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

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly agentExecutionService: AgentExecutionService,
    private readonly credentialManagerService: CredentialManagerService,
  ) {}

  async createAgent(createAgentDto: CreateAgentDto, userId: string) {
    return this.prismaService.agent.create({
      data: {
        name: createAgentDto.name,
        description: createAgentDto.description,
        userId,
      },
    });
  }

  async getAgents(userId: string) {
    return this.prismaService.agent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAgent(id: string, userId: string) {
    const agent = await this.prismaService.agent.findFirst({
      where: { id, userId },
      include: {
        steps: {
          orderBy: { order: 'asc' },
        },
        variables: true,
        credentials: {
          select: {
            id: true,
            name: true,
            type: true,
            updatedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }

    return agent;
  }

  async updateAgent(
    id: string,
    updateAgentDto: UpdateAgentDto,
    userId: string,
  ) {
    await this.verifyAgentOwnership(id, userId);

    return this.prismaService.agent.update({
      where: { id },
      data: {
        name: updateAgentDto.name,
        description: updateAgentDto.description,
      },
    });
  }

  async deleteAgent(id: string, userId: string) {
    await this.verifyAgentOwnership(id, userId);

    // Delete in order to respect foreign key constraints
    await this.prismaService.$transaction([
      this.prismaService.agentCredential.deleteMany({
        where: { agentId: id },
      }),
      this.prismaService.agentVariable.deleteMany({
        where: { agentId: id },
      }),
      this.prismaService.agentStep.deleteMany({
        where: { agentId: id },
      }),
      this.prismaService.agent.delete({
        where: { id },
      }),
    ]);
  }

  // Steps management
  async addStep(
    agentId: string,
    createStepDto: CreateAgentStepDto,
    userId: string,
  ) {
    await this.verifyAgentOwnership(agentId, userId);

    return this.prismaService.agentStep.create({
      data: {
        name: createStepDto.name,
        description: createStepDto.description,
        type: createStepDto.type,
        config: createStepDto.config,
        order: createStepDto.order,
        nextOnSuccess: createStepDto.nextOnSuccess,
        nextOnFailure: createStepDto.nextOnFailure,
        agentId,
      },
    });
  }

  async updateStep(
    agentId: string,
    stepId: string,
    updateStepDto: UpdateAgentStepDto,
    userId: string,
  ) {
    await this.verifyAgentOwnership(agentId, userId);
    await this.verifyStepExists(stepId, agentId);

    return this.prismaService.agentStep.update({
      where: { id: stepId },
      data: {
        name: updateStepDto.name,
        description: updateStepDto.description,
        type: updateStepDto.type,
        config: updateStepDto.config,
        order: updateStepDto.order,
        nextOnSuccess: updateStepDto.nextOnSuccess,
        nextOnFailure: updateStepDto.nextOnFailure,
      },
    });
  }

  async deleteStep(agentId: string, stepId: string, userId: string) {
    await this.verifyAgentOwnership(agentId, userId);
    await this.verifyStepExists(stepId, agentId);

    return this.prismaService.agentStep.delete({
      where: { id: stepId },
    });
  }

  // Credentials management
  async addCredential(
    agentId: string,
    createCredentialDto: CreateAgentCredentialDto,
    userId: string,
  ) {
    await this.verifyAgentOwnership(agentId, userId);

    // Use credential manager to securely store the credential
    return this.credentialManagerService.storeCredential(
      userId,
      agentId,
      createCredentialDto.name,
      createCredentialDto.value,
      createCredentialDto.type,
    );
  }

  async updateCredential(
    agentId: string,
    credentialId: string,
    updateCredentialDto: UpdateAgentCredentialDto,
    userId: string,
  ) {
    await this.verifyAgentOwnership(agentId, userId);
    await this.verifyCredentialExists(credentialId, agentId);

    // Delete existing credential and create a new one
    await this.credentialManagerService.deleteCredential(agentId, credentialId);

    return this.credentialManagerService.storeCredential(
      userId,
      agentId,
      updateCredentialDto.name,
      updateCredentialDto.value,
      updateCredentialDto.type,
    );
  }

  async deleteCredential(
    agentId: string,
    credentialId: string,
    userId: string,
  ) {
    await this.verifyAgentOwnership(agentId, userId);
    await this.verifyCredentialExists(credentialId, agentId);

    return this.credentialManagerService.deleteCredential(
      agentId,
      credentialId,
    );
  }

  // Variables management
  async addVariable(
    agentId: string,
    createVariableDto: CreateAgentVariableDto,
    userId: string,
  ) {
    await this.verifyAgentOwnership(agentId, userId);

    return this.prismaService.agentVariable.create({
      data: {
        name: createVariableDto.name,
        defaultValue: createVariableDto.defaultValue,
        description: createVariableDto.description,
        agentId,
      },
    });
  }

  async updateVariable(
    agentId: string,
    variableId: string,
    updateVariableDto: UpdateAgentVariableDto,
    userId: string,
  ) {
    await this.verifyAgentOwnership(agentId, userId);
    await this.verifyVariableExists(variableId, agentId);

    return this.prismaService.agentVariable.update({
      where: { id: variableId },
      data: {
        name: updateVariableDto.name,
        defaultValue: updateVariableDto.defaultValue,
        description: updateVariableDto.description,
      },
    });
  }

  async deleteVariable(agentId: string, variableId: string, userId: string) {
    await this.verifyAgentOwnership(agentId, userId);
    await this.verifyVariableExists(variableId, agentId);

    return this.prismaService.agentVariable.delete({
      where: { id: variableId },
    });
  }

  // Agent execution
  async executeAgent(
    agentId: string,
    executeAgentDto: ExecuteAgentDto,
    userId: string,
  ): Promise<AgentExecutionResponseDto> {
    await this.verifyAgentOwnership(agentId, userId);

    try {
      const result = await this.agentExecutionService.executeAgent(
        agentId,
        executeAgentDto.input,
        userId,
      );

      return {
        id: result.id,
        status: result.status,
        output: result.output,
        error: result.error,
        executionPath: result.executionPath,
        startTime: result.startTime.toISOString(),
        endTime: result.endTime ? result.endTime.toISOString() : null,
        tokenUsage: result.tokenUsage,
      };
    } catch (error) {
      this.logger.error(`Error executing agent ${agentId}:`, error);

      // Return a structured error response
      return {
        id: '', // ID will be empty for failed executions that couldn't be saved
        status: 'FAILED',
        output: {},
        error: error instanceof Error ? error.message : String(error),
        executionPath: [],
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        tokenUsage: 0,
      };
    }
  }

  /**
   * Execute an agent with API key authentication
   */
  async executeAgentWithApiKey(
    agentId: string,
    executeAgentDto: ExecuteAgentDto,
    apiKey: string,
  ): Promise<AgentExecutionResponseDto> {
    // 1. Verify API key and get application
    const application = await this.prismaService.application.findFirst({
      where: { apiKey },
    });

    if (!application) {
      throw new NotFoundException('Invalid API key');
    }

    // 2. Find the agent (regardless of owner)
    const agent = await this.prismaService.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    try {
      // 3. Execute the agent using the agent owner's user ID
      const result = await this.agentExecutionService.executeAgent(
        agentId,
        executeAgentDto.input,
        agent.userId,
      );

      // 4. Calculate and record usage if tokens were used
      if (result.tokenUsage > 0) {
        await this.recordAgentUsage(
          application.id,
          result.tokenUsage,
          agent.id,
        );
      }

      return {
        id: result.id,
        status: result.status,
        output: result.output,
        error: result.error,
        executionPath: result.executionPath,
        startTime: result.startTime.toISOString(),
        endTime: result.endTime ? result.endTime.toISOString() : null,
        tokenUsage: result.tokenUsage,
      };
    } catch (error) {
      this.logger.error(
        `Error executing agent ${agentId} with API key:`,
        error,
      );

      // Return a structured error response
      return {
        id: '',
        status: 'FAILED',
        output: {},
        error: error instanceof Error ? error.message : String(error),
        executionPath: [],
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        tokenUsage: 0,
      };
    }
  }

  /**
   * Record agent usage and calculate cost
   */
  private async recordAgentUsage(
    applicationId: string,
    tokenUsage: number,
    agentId: string,
  ): Promise<void> {
    try {
      // Find appropriate pricing model - use a suitable default model for agents
      const pricingData = await this.prismaService.aIModelPricing.findFirst({
        where: {
          model: 'gemini-1.0-pro', // Adjust to match your preferred model for billing
          active: true,
        },
      });

      if (!pricingData) {
        this.logger.warn('No pricing model found for agent execution');
        return;
      }

      // Calculate cost based on token usage
      const pricePerUnit = pricingData.pricePerUnit;
      const quantity = pricingData.quantity || 1000; // Tokens per unit
      const cost = (tokenUsage / quantity) * pricePerUnit;

      // Record usage and update balance
      await this.prismaService.$transaction([
        this.prismaService.applicationUsage.create({
          data: {
            applicationId,
            aiModelPricingId: pricingData.id,
            tokensUsed: tokenUsage,
            cost,
          },
        }),
        this.prismaService.application.update({
          where: { id: applicationId },
          data: {
            balance: {
              decrement: cost,
            },
          },
        }),
      ]);

      this.logger.log(
        `Recorded agent usage: ${tokenUsage} tokens, cost: ${cost}, application: ${applicationId}`,
      );
    } catch (error) {
      this.logger.error('Error recording agent usage:', error);
    }
  }

  // Execution history
  async getExecutions(agentId: string, userId: string) {
    await this.verifyAgentOwnership(agentId, userId);

    return this.prismaService.agentExecution.findMany({
      where: {
        agentId,
        userId,
      },
      orderBy: {
        startTime: 'desc',
      },
      select: {
        id: true,
        status: true,
        input: true,
        output: true,
        executionPath: true,
        startTime: true,
        endTime: true,
        errorMessage: true,
        tokenUsage: true,
      },
    });
  }

  async getExecution(agentId: string, executionId: string, userId: string) {
    await this.verifyAgentOwnership(agentId, userId);

    const execution = await this.prismaService.agentExecution.findFirst({
      where: {
        id: executionId,
        agentId,
        userId,
      },
      select: {
        id: true,
        status: true,
        input: true,
        output: true,
        executionPath: true,
        startTime: true,
        endTime: true,
        stepResults: true,
        errorMessage: true,
        tokenUsage: true,
      },
    });

    if (!execution) {
      throw new NotFoundException(`Execution with ID ${executionId} not found`);
    }

    return execution;
  }

  // Helper methods
  private async verifyAgentOwnership(agentId: string, userId: string) {
    const agent = await this.prismaService.agent.findFirst({
      where: {
        id: agentId,
        userId,
      },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }
  }

  private async verifyStepExists(stepId: string, agentId: string) {
    const step = await this.prismaService.agentStep.findFirst({
      where: {
        id: stepId,
        agentId,
      },
    });

    if (!step) {
      throw new NotFoundException(`Step with ID ${stepId} not found`);
    }
  }

  private async verifyCredentialExists(credentialId: string, agentId: string) {
    const credential = await this.prismaService.agentCredential.findFirst({
      where: {
        id: credentialId,
        agentId,
      },
    });

    if (!credential) {
      throw new NotFoundException(
        `Credential with ID ${credentialId} not found`,
      );
    }
  }

  private async verifyVariableExists(variableId: string, agentId: string) {
    const variable = await this.prismaService.agentVariable.findFirst({
      where: {
        id: variableId,
        agentId,
      },
    });

    if (!variable) {
      throw new NotFoundException(`Variable with ID ${variableId} not found`);
    }
  }
}
