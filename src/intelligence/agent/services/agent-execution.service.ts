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

    // Initialize context outside the try block so it's accessible in catch
    let context: IAgentContext | undefined;

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
      context = {
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
      this.logger.error(`Agent execution failed: ${errorMessage}`, error);

      // Create a result object that includes any context we have
      const result: IAgentExecutionResult = {
        id: execution.id,
        status: 'FAILED',
        output: context?.variables || {},
        error: errorMessage,
        executionPath: context?.executionPath || [],
        startTime: context?.startTime || new Date(),
        endTime: new Date(),
        stepResults: context?.stepResults || {},
        tokenUsage: this.calculateTotalTokenUsage(context?.stepResults || {}),
      };

      await this.prisma.$transaction(async (tx) => {
        await tx.agentExecution.update({
          where: { id: execution.id },
          data: {
            status: 'FAILED',
            errorMessage,
            output: context?.variables || {},
            endTime: new Date(),
            tokenUsage: result.tokenUsage,
          },
        });
      });

      return result;
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
      let tokenUsage = 0;

      switch (step.type) {
        case 'PROMPT':
          const promptResult = await this.executePromptStep(
            config as IPromptStepConfig,
            context,
          );
          output =
            typeof promptResult === 'object' && promptResult.content
              ? promptResult.content
              : promptResult;
          tokenUsage =
            typeof promptResult === 'object' ? promptResult.tokenUsage || 0 : 0;
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
        tokenUsage,
      };
    } catch (error) {
      return {
        status: 'FAILURE',
        output: null,
        error: error instanceof Error ? error : new Error(String(error)),
        executionTime: Date.now() - startTime,
        tokenUsage: 0,
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
    // Process template variables in the prompt
    const processedPrompt = this.evaluateExpression(config.prompt, context);

    const response = await this.aiWrapper.generateContent(
      config.model as AIModels,
      processedPrompt,
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

    // Store token usage information
    const tokenUsage =
      response.usage.totalTokens ||
      (response.usage ? response.usage.totalTokens : 0);

    context.variables[config.outputVariable] = response.content;

    // Return both content and token usage
    return {
      content: response.content,
      tokenUsage: tokenUsage,
    };
  }

  /**
   * Execute an API call step
   */
  private async executeApiCallStep(
    config: IApiCallStepConfig,
    context: IAgentContext,
  ): Promise<any> {
    // Process template variables before making the API call
    const endpoint = this.evaluateExpression(config.endpoint, context);
    const method = this.evaluateExpression(config.method, context);

    // Process headers
    const headers = { ...config.headers };
    for (const key in headers) {
      if (typeof headers[key] === 'string') {
        headers[key] = this.evaluateExpression(headers[key], context);
      }
    }

    // Process body
    let body = config.body;
    if (body) {
      if (typeof body === 'string') {
        body = this.evaluateExpression(body, context);
      } else if (typeof body === 'object') {
        body = JSON.parse(JSON.stringify(body));
        this.processObjectTemplates(body, context);
      }
    }

    // Make the API call with processed values
    const result = await this.apiIntegration.makeApiCall(
      endpoint,
      method,
      headers,
      body,
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

    // Check if input variable exists
    const inputExists = config.inputVariable in context.variables;
    if (!inputExists) {
      this.logger.warn(
        `Transformation step using non-existent input variable: ${config.inputVariable}`,
      );
    }

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

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') {
          obj[i] = this.evaluateExpression(obj[i], context);
        } else if (obj[i] !== null && typeof obj[i] === 'object') {
          this.processObjectTemplates(obj[i], context);
        }
      }
      return;
    }

    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        obj[key] = this.evaluateExpression(obj[key], context);
      } else if (obj[key] !== null && typeof obj[key] === 'object') {
        this.processObjectTemplates(obj[key], context);
      }
    }
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
      // Handle complex objects by converting to string first
      if (typeof expression !== 'string') {
        return expression;
      }

      // Replace variable references in the format {{variables.name}} and {{input.field}}
      let result = expression;
      let lastResult = '';
      let iterations = 0;
      const maxIterations = 10;

      // Continue replacing until we reach a stable result or max iterations
      while (result !== lastResult && iterations < maxIterations) {
        lastResult = result;
        iterations++;

        // Handle {{variables.name}} format
        result = result.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
          try {
            const parts = path.trim().split('.');

            // Navigate through the nested properties
            if (parts.length >= 2) {
              let value = undefined;

              if (parts[0] === 'variables') {
                // Remove 'variables.' prefix
                const nestedPath = parts.slice(1);
                value = this.getNestedProperty(context.variables, nestedPath);
              } else if (parts[0] === 'input') {
                // Remove 'input.' prefix
                const nestedPath = parts.slice(1);
                value = this.getNestedProperty(context.input, nestedPath);
              } else if (parts[0] === 'stepResults') {
                // Handle stepResults access
                const nestedPath = parts.slice(1);
                value = this.getNestedProperty(context.stepResults, nestedPath);
              }

              // Convert value based on its type
              if (value !== undefined) {
                if (typeof value === 'string') return value;
                if (typeof value === 'number') return String(value);
                if (value === null) return '';
                return JSON.stringify(value);
              }
            }

            // If we couldn't resolve the variable, log it for debugging
            this.logger.debug(`Could not resolve template variable: ${path}`);
            return '(not available)';
          } catch (err) {
            this.logger.error(`Error processing template ${match}:`, err);
            return '(error)';
          }
        });

        // Handle ${variable} format
        result = result.replace(/\$\{([^}]+)\}/g, (match, path) => {
          try {
            const parts = path.trim().split('.');

            // Handle direct variable access
            if (
              parts.length === 1 &&
              context.variables[parts[0]] !== undefined
            ) {
              const value = context.variables[parts[0]];
              if (typeof value === 'string') return value;
              if (typeof value === 'number') return String(value);
              if (value === null) return '';
              return JSON.stringify(value);
            }

            // Navigate through nested properties
            if (parts.length >= 2) {
              let value = undefined;

              if (parts[0] === 'variables') {
                const nestedPath = parts.slice(1);
                value = this.getNestedProperty(context.variables, nestedPath);
              } else if (parts[0] === 'input') {
                const nestedPath = parts.slice(1);
                value = this.getNestedProperty(context.input, nestedPath);
              } else if (parts[0] === 'stepResults') {
                // Handle stepResults access
                const nestedPath = parts.slice(1);
                value = this.getNestedProperty(context.stepResults, nestedPath);
              }

              if (value !== undefined) {
                if (typeof value === 'string') return value;
                if (typeof value === 'number') return String(value);
                if (value === null) return '';
                return JSON.stringify(value);
              }
            }

            // If we couldn't resolve the variable, log it for debugging
            this.logger.debug(`Could not resolve template variable: ${path}`);
            return '(not available)';
          } catch (err) {
            this.logger.error(`Error processing template ${match}:`, err);
            return '(error)';
          }
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Error evaluating expression: ${expression}`, error);
      return expression;
    }
  }

  /**
   * Get a nested property from an object using array of property names
   */
  private getNestedProperty(obj: any, path: string[]): any {
    if (!obj || !path.length) return undefined;

    let current = obj;

    // Handle array index notation like "weather[0]"
    for (let i = 0; i < path.length; i++) {
      const key = path[i];

      // Handle array indexing like "weather[0]"
      const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        const arrayName = arrayMatch[1];
        const index = parseInt(arrayMatch[2], 10);

        if (!current[arrayName] || !Array.isArray(current[arrayName])) {
          return undefined;
        }

        current = current[arrayName][index];
        continue;
      }

      // Regular property access
      if (current[key] === undefined) {
        return undefined;
      }

      current = current[key];
    }

    return current;
  }
}
