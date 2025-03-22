import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { ApiAgentController } from './api-agent.controller'; // New controller
import { AgentExecutionService } from './services/agent-execution.service';
import { CredentialManagerService } from './services/credential-manager.service';
import { ApiIntegrationService } from './services/api-integration.service';
import { SchemaValidationService } from './services/schema-validation.service';
import { AnthropicProvider } from '../providers/Anthropic.provider';
import { GoogleProvider } from '../providers/Gemini.provider';
import { GroqProvider } from '../providers/Groq.provider';
import { LlamaProvider } from '../providers/Llama.provider';
import { OpenAiProvider } from '../providers/OpenAI.provider';
import { OpenRouterProvider } from '../providers/OpenRouter.provider';
import { AiWrapperService } from '../providers/ai-wrapper.service';

const AIProviders = [
  GoogleProvider,
  OpenAiProvider,
  OpenRouterProvider,
  LlamaProvider,
  GroqProvider,
  AnthropicProvider,
];

const Services = [AiWrapperService];

@Module({
  providers: [
    AgentService,
    AgentExecutionService,
    CredentialManagerService,
    ApiIntegrationService,
    SchemaValidationService,
    ...Services,
    ...AIProviders,
  ],
  controllers: [AgentController, ApiAgentController], // Added the new controller
  exports: [AgentService, AgentExecutionService],
})
export class AgentModule {}
