import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AiWrapperService } from '../../providers/ai-wrapper.service';
import { ApiIntegrationService } from './api-integration.service';
import { SchemaValidationService } from './schema-validation.service';
import { CredentialManagerService } from './credential-manager.service';
import { AIModels } from '../../enums/models.enum';
import {
  IAgentContext,
  IAgentExecutionResult,
  IStepResult,
  StepConfig,
  IPromptStepConfig,
  IApiCallStepConfig,
  IValidationStepConfig,
  ITransformationStepConfig,
  IConditionStepConfig,
  ILoopStepConfig,
  IWaitStepConfig,
  ISetVariableStepConfig,
  IErrorHandlerStepConfig,
} from '../models';

@Injectable()
export class AgentExecutionService {
  private readonly logger = new Logger(AgentExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiWrapper: AiWrapperService,
    private readonly apiIntegration: ApiIntegrationService,
    private readonly schemaValidation: SchemaValidationService,
    private readonly credentialManager: CredentialManagerService,
  ) {}

  /**
   * Execute an agent with the given input
   */
  async executeAgent(
    agentId: string,
    input: any,
    userId: string,
  ): Promise<IAgentExecutionResult> {
    // Create execution record
    const execution = await this.prisma.$transaction(async (tx) => {
      return await tx.agentExecution.create({
        data: {
          agentId,
          status: 'RUNNING',
          input,
          executionPath: [],
          userId,
        },
      });
    });

    try {
      // Get agent and its steps
      const agent = await this.prisma.$transaction(async (tx) => {
        return await tx.agent.findUnique({
          where: { id: agentId },
          include: {
            steps: {
              orderBy: { order: 'asc' },
            },
            variables: true,
          },
        });
      });

      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Initialize context
      const context: IAgentContext = {
        variables: this.initializeVariables(agent.variables),
        input,
        stepResults: {},
        executionPath: [],
        errors: [],
        startTime: new Date(),
        userId,
        agentId,
      };

      // Execute steps
      let currentStep = agent.steps[0];
      while (currentStep) {
        const stepResult = await this.executeStep(currentStep, context);
        context.stepResults[currentStep.id] = stepResult;
        context.executionPath.push(currentStep.id);

        // Update execution record
        await this.prisma.$transaction(async (tx) => {
          await tx.agentExecution.update({
            where: { id: execution.id },
            data: {
              executionPath: context.executionPath,
              stepResults: this.serializeStepResults(context.stepResults),
            },
          });
        });

        // Determine next step based on result
        if (stepResult.status === 'SUCCESS') {
          currentStep = this.getNextStep(agent.steps, currentStep, true);
        } else {
          currentStep = this.getNextStep(agent.steps, currentStep, false);
        }
      }

      // Complete execution
      // Process templates in the final output
      const processedOutput = JSON.parse(JSON.stringify(context.variables));
      this.processObjectTemplates(processedOutput, context);

      const result: IAgentExecutionResult = {
        id: execution.id,
        status: 'COMPLETED',
        output: processedOutput,
        executionPath: context.executionPath,
        startTime: context.startTime,
        endTime: new Date(),
        stepResults: context.stepResults,
        tokenUsage: this.calculateTotalTokenUsage(context.stepResults),
      };

      await this.prisma.$transaction(async (tx) => {
        await tx.agentExecution.update({
          where: { id: execution.id },
          data: {
            status: 'COMPLETED',
            output: result.output,
            endTime: result.endTime,
            tokenUsage: result.tokenUsage,
          },
        });
      });

      return result;
    } catch (error) {
      // Handle execution failure
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.prisma.$transaction(async (tx) => {
        await tx.agentExecution.update({
          where: { id: execution.id },
          data: {
            status: 'FAILED',
            errorMessage,
            endTime: new Date(),
          },
        });
      });

      throw error;
    }
  }

  /**
   * Serialize step results to a format suitable for database storage
   */
  private serializeStepResults(stepResults: Record<string, IStepResult>): any {
    return Object.fromEntries(
      Object.entries(stepResults).map(([key, result]) => {
        // Convert Error objects to string representations
        if (result.error instanceof Error) {
          return [
            key,
            {
              ...result,
              error: {
                message: result.error.message,
                stack: result.error.stack,
              },
            },
          ];
        }
        return [key, result];
      }),
    );
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: any,
    context: IAgentContext,
  ): Promise<IStepResult> {
    const startTime = Date.now();
    try {
      const config = step.config as StepConfig;
      let output: any;

      switch (step.type) {
        case 'PROMPT':
          output = await this.executePromptStep(
            config as IPromptStepConfig,
            context,
          );
          break;
        case 'API_CALL':
          output = await this.executeApiCallStep(
            config as IApiCallStepConfig,
            context,
          );
          break;
        case 'VALIDATION':
          output = await this.executeValidationStep(
            config as IValidationStepConfig,
            context,
          );
          break;
        case 'TRANSFORMATION':
          output = await this.executeTransformationStep(
            config as ITransformationStepConfig,
            context,
          );
          break;
        case 'CONDITION':
          output = await this.executeConditionStep(
            config as IConditionStepConfig,
            context,
          );
          break;
        case 'LOOP':
          output = await this.executeLoopStep(
            config as ILoopStepConfig,
            context,
          );
          break;
        case 'WAIT':
          output = await this.executeWaitStep(
            config as IWaitStepConfig,
            context,
          );
          break;
        case 'SET_VARIABLE':
          output = await this.executeSetVariableStep(
            config as ISetVariableStepConfig,
            context,
          );
          break;
        case 'ERROR_HANDLER':
          output = await this.executeErrorHandlerStep(
            config as IErrorHandlerStepConfig,
            context,
          );
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      return {
        status: 'SUCCESS',
        output,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'FAILURE',
        output: null,
        error: error instanceof Error ? error : new Error(String(error)),
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a prompt step
   */
  private async executePromptStep(
    config: IPromptStepConfig,
    context: IAgentContext,
  ): Promise<any> {
    const response = await this.aiWrapper.generateContent(
      config.model as AIModels,
      config.prompt,
    );

    if (config.outputSchema) {
      const validation = this.schemaValidation.validateData(
        response.content,
        config.outputSchema,
      );
      if (!validation.valid) {
        throw new Error(
          `Output validation failed: ${this.schemaValidation
            .formatErrors(validation.errors)
            .join(', ')}`,
        );
      }
    }

    context.variables[config.outputVariable] = response.content;
    return response.content;
  }

  /**
   * Execute an API call step
   */
  private async executeApiCallStep(
    config: IApiCallStepConfig,
    context: IAgentContext,
  ): Promise<any> {
    const result = await this.apiIntegration.makeApiCall(
      config.endpoint,
      config.method,
      config.headers,
      config.body,
      config.retryConfig,
    );

    context.variables[config.outputVariable] = result.data;
    return result.data;
  }

  /**
   * Execute a validation step
   */
  private async executeValidationStep(
    config: IValidationStepConfig,
    context: IAgentContext,
  ): Promise<any> {
    const input = context.variables[config.inputVariable];
    const validation = this.schemaValidation.validateData(input, config.schema);

    if (!validation.valid) {
      const errors = this.schemaValidation.formatErrors(validation.errors);
      if (config.onValidationFailure === 'STOP') {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      // Handle other failure modes (RETRY, CONTINUE) as needed
    }

    return input;
  }

  /**
   * Execute a transformation step
   */
  private async executeTransformationStep(
    config: ITransformationStepConfig,
    context: IAgentContext,
  ): Promise<any> {
    const input = context.variables[config.inputVariable];
    let output = input;

    if (config.transformation && typeof config.transformation === 'string') {
      // Handle string transformation as a template
      output = this.evaluateExpression(config.transformation, context);
    } else if (
      config.transformation &&
      typeof config.transformation === 'object'
    ) {
      // Handle object transformation by replacing template variables in each property
      output = JSON.parse(JSON.stringify(config.transformation));
      this.processObjectTemplates(output, context);
    }

    context.variables[config.outputVariable] = output;
    return output;
  }

  /**
   * Process object templates recursively
   */
  private processObjectTemplates(obj: any, context: IAgentContext): void {
    if (!obj || typeof obj !== 'object') return;

    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] === 'string') {
        obj[key] = this.evaluateExpression(obj[key], context);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.processObjectTemplates(obj[key], context);
      }
    });
  }

  /**
   * Execute a condition step
   */
  private async executeConditionStep(
    config: IConditionStepConfig,
    context: IAgentContext,
  ): Promise<any> {
    // Implement condition evaluation logic
    const conditionMet = false; // Placeholder - implement actual condition evaluation

    return conditionMet;
  }

  /**
   * Execute a loop step
   */
  private async executeLoopStep(
    config: ILoopStepConfig,
    context: IAgentContext,
  ): Promise<any> {
    // Implement loop execution logic
    const results = []; // Placeholder - implement actual loop logic

    return results;
  }

  /**
   * Execute a wait step
   */
  private async executeWaitStep(
    config: IWaitStepConfig,
    context: IAgentContext,
  ): Promise<void> {
    const duration =
      config.duration || context.variables[config.variableDuration];
    await new Promise((resolve) => setTimeout(resolve, duration));
  }

  /**
   * Execute a set variable step
   */
  private async executeSetVariableStep(
    config: ISetVariableStepConfig,
    context: IAgentContext,
  ): Promise<any> {
    const value =
      config.value || this.evaluateExpression(config.expression, context);
    context.variables[config.variable] = value;
    return value;
  }

  /**
   * Execute an error handler step
   */
  private async executeErrorHandlerStep(
    config: IErrorHandlerStepConfig,
    context: IAgentContext,
  ): Promise<any> {
    // Implement error handling logic
    return null; // Placeholder - implement actual error handling
  }

  /**
   * Initialize variables with default values
   */
  private initializeVariables(variables: any[]): Record<string, any> {
    return variables.reduce((acc, variable) => {
      acc[variable.name] = variable.defaultValue || null;
      return acc;
    }, {});
  }

  /**
   * Get the next step based on execution result
   */
  private getNextStep(
    steps: any[],
    currentStep: any,
    success: boolean,
  ): any | null {
    const nextStepId = success
      ? currentStep.nextOnSuccess
      : currentStep.nextOnFailure;

    if (nextStepId) {
      return steps.find((step) => step.id === nextStepId) || null;
    }

    // If no specific next step is defined, continue to the next step in order
    const currentIndex = steps.findIndex((step) => step.id === currentStep.id);
    return steps[currentIndex + 1] || null;
  }

  /**
   * Calculate total token usage across all steps
   */
  private calculateTotalTokenUsage(
    stepResults: Record<string, IStepResult>,
  ): number {
    return Object.values(stepResults).reduce(
      (total, result) => total + (result.tokenUsage || 0),
      0,
    );
  }

  /**
   * Evaluate an expression in the context of variables
   */
  private evaluateExpression(expression: string, context: IAgentContext): any {
    if (!expression) return null;

    try {
      // Replace variable references in the format {{variables.name}} and {{input.field}}
      return expression.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const parts = path.trim().split('.');

        if (parts.length < 2) return match;

        if (parts[0] === 'variables' && parts.length >= 2) {
          const varName = parts[1];
          return context.variables[varName] !== undefined
            ? JSON.stringify(context.variables[varName]).replace(/^"|"$/g, '')
            : match;
        }

        if (parts[0] === 'input' && parts.length >= 2) {
          const inputField = parts[1];
          return context.input && context.input[inputField] !== undefined
            ? JSON.stringify(context.input[inputField]).replace(/^"|"$/g, '')
            : match;
        }

        return match;
      });
    } catch (error) {
      this.logger.error(`Error evaluating expression: ${expression}`, error);
      return expression;
    }
  }
}
