import { StepType } from '@prisma/client';

export interface IAgentContext {
  variables: Record<string, any>;
  input: any;
  stepResults: Record<string, IStepResult>;
  executionPath: string[];
  errors: Error[];
  startTime: Date;
  userId: string;
  agentId: string;
}

export interface IStepResult {
  status: 'SUCCESS' | 'FAILURE' | 'SKIPPED';
  output: any;
  error?: Error;
  tokenUsage?: number;
  executionTime: number;
}

export interface IAgentExecutionResult {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  output?: any;
  error?: string;
  executionPath: string[];
  startTime: Date;
  endTime?: Date;
  stepResults: Record<string, IStepResult>;
  tokenUsage?: number;
}

// Step Configurations

export interface IBaseStepConfig {
  description?: string;
}

export interface IPromptStepConfig extends IBaseStepConfig {
  prompt: string;
  model: string;
  outputVariable: string;
  outputSchema?: object;
  temperature?: number;
}

export interface IApiCallStepConfig extends IBaseStepConfig {
  endpoint: string;
  method: string;
  headers?: Record<string, string>;
  body?: any;
  outputVariable: string;
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;
  };
}

export interface IValidationStepConfig extends IBaseStepConfig {
  schema: object;
  inputVariable: string;
  onValidationFailure: 'RETRY' | 'STOP' | 'CONTINUE';
  maxRetries?: number;
}

export interface ITransformationStepConfig extends IBaseStepConfig {
  inputVariable: string;
  transformation: string;
  outputVariable: string;
}

export interface IConditionStepConfig extends IBaseStepConfig {
  condition: string;
  trueStepId: string;
  falseStepId: string;
}

export interface ILoopStepConfig extends IBaseStepConfig {
  type: 'array' | 'count';
  arrayVariable?: string;
  itemVariable?: string;
  count?: number;
  maxIterations: number;
  loopBody: string;
}

export interface IWaitStepConfig extends IBaseStepConfig {
  duration?: number;
  variableDuration?: string;
}

export interface ISetVariableStepConfig extends IBaseStepConfig {
  variable: string;
  value?: string;
  expression?: string;
}

export interface IErrorHandlerStepConfig extends IBaseStepConfig {
  catchErrors: string[];
  handlerAction: 'RETRY' | 'CONTINUE' | 'STOP' | 'JUMP';
  targetStepId?: string;
  maxRetries?: number;
}

export type StepConfig =
  | IPromptStepConfig
  | IApiCallStepConfig
  | IValidationStepConfig
  | ITransformationStepConfig
  | IConditionStepConfig
  | ILoopStepConfig
  | IWaitStepConfig
  | ISetVariableStepConfig
  | IErrorHandlerStepConfig;

export interface IRetryConfig {
  maxRetries: number;
  retryDelay: number;
}

export interface IApiCallResult {
  status: number;
  headers: Record<string, string>;
  data: any;
}

export interface IValidationResult {
  valid: boolean;
  errors: any[];
}
