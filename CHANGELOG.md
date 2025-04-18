# 1.0.0 (2025-03-27)


### Bug Fixes

* add await to aIThreadMessage.create calls for proper asynchronous handling ([d9a3f08](https://github.com/ErzenXz/auth-backend/commit/d9a3f0872fc9ec83f6c7750d00a4c161e08cd8b9))
* add required packages ([d535c91](https://github.com/ErzenXz/auth-backend/commit/d535c91f18b7bb3e606f0ffa111b452f0495c9c9))
* package.json & yarn.lock to reduce vulnerabilities ([e09b67c](https://github.com/ErzenXz/auth-backend/commit/e09b67c57b8644618c1c16d90b8f2cea1afeeba4))
* remove duplicate script copy and ensure proper entrypoint setup in Dockerfile ([97fcc71](https://github.com/ErzenXz/auth-backend/commit/97fcc716ad714174ba665a5875ca24322972b3c9))
* update notification sending to use subscription object directly ([0f35bc0](https://github.com/ErzenXz/auth-backend/commit/0f35bc0890991890b30b469027f6e2986286df68))


### Features

* add 'active' column to AIModelPricing and update Gemini model mappings ([34bc874](https://github.com/ErzenXz/auth-backend/commit/34bc874e02a5d82722dd0d81c6ed2b8f25978913))
* add ApiAgentController for executing agents via API key, enhance agent execution service with error handling and usage recording ([248a649](https://github.com/ErzenXz/auth-backend/commit/248a64955bb18a14226074b1faef429019d53512))
* add Application, Product, Plan, Purchase, and Subscription models to support new features ([4220baa](https://github.com/ErzenXz/auth-backend/commit/4220baaf73c4fb1206cb2aba0720c351930b3d01))
* add balance and user association to applications, and introduce AI model pricing and usage tracking ([b7be9ca](https://github.com/ErzenXz/auth-backend/commit/b7be9ca793608c3680f296cb20da58cd747eddad))
* add DeepseekR1Zero and QwQ_32_B models to AIModels enum and provider mapping ([c14d00d](https://github.com/ErzenXz/auth-backend/commit/c14d00d99e29c7cf2d6e9a6fb05dab948afe87b9))
* add DTOs for user memory and instructions, including validation rules ([ef8684b](https://github.com/ErzenXz/auth-backend/commit/ef8684b33c3fd821c384099e5e861fd5aeedf9f3))
* add endpoints for retrieving articles and sources, and implement advanced search DTO ([3bde9fa](https://github.com/ErzenXz/auth-backend/commit/3bde9fac639f624b0563ece3b7c95e573bfd18ce))
* add external documentation link and enhance user info retrieval with additional user details ([319fb0c](https://github.com/ErzenXz/auth-backend/commit/319fb0c913953aae0a932df5b5a85d33d0813a6e))
* add Infisical configuration and CLI setup; create entrypoint script for production environment ([0926e86](https://github.com/ErzenXz/auth-backend/commit/0926e866d9f168c309e182c0e167cb52bc1e87d8))
* add Infisical run script and enhance token retrieval in script.sh ([ac5ec69](https://github.com/ErzenXz/auth-backend/commit/ac5ec69cff29900d7cffbd167db4794dea425827))
* add Infisical run script and enhance token retrieval in script.sh ([#27](https://github.com/ErzenXz/auth-backend/issues/27)) ([b0f7901](https://github.com/ErzenXz/auth-backend/commit/b0f79013e22ae63052d5aca90b856e30f140bdda))
* add isDeleted flag to AIProjectFile and AIProjectFileVersion models, update controller for agent instruction processing, and introduce AgentResponse interface ([8eb82b9](https://github.com/ErzenXz/auth-backend/commit/8eb82b97c2c70a61e3f48811de83a25f30ab6fed))
* add MFA authentication endpoints and improve SonarLint configuration ([cc53059](https://github.com/ErzenXz/auth-backend/commit/cc530592282f4e630b4eba93957d8c0a8a8cf477))
* add new AI models to provider mapping and update model references ([f58b186](https://github.com/ErzenXz/auth-backend/commit/f58b1860f74ff00c0647ca5f3109b5fd90322968))
* add news module with DTOs for article management and command control integration ([a99bc87](https://github.com/ErzenXz/auth-backend/commit/a99bc879208738cd444fbc272a3f42cc092bfb0a))
* add pagination support for chat threads and messages retrieval ([b6a98f3](https://github.com/ErzenXz/auth-backend/commit/b6a98f3a2a187b85e5d0ff98cc7d58483a9fbcbc))
* add project and file management DTOs, including creation, update, and collaboration models ([f6e84ac](https://github.com/ErzenXz/auth-backend/commit/f6e84ac4ff279574a5e71d5f7fca1fc20808ae5b))
* add reasoning option to CreateChatDto and implement SSE endpoint for reasoning stream ([e603c1a](https://github.com/ErzenXz/auth-backend/commit/e603c1a61ffbe0897af223e6e01fe5aab7ce1b19))
* add RenameChatThreadDto for chat thread renaming and update controller to use DTO ([2807f38](https://github.com/ErzenXz/auth-backend/commit/2807f3833fe1211c45fb29182efc0f1ab4e36db4))
* add schema field to Instruction model and implement Text-to-Speech and Browser modules with corresponding controllers and services ([83c2868](https://github.com/ErzenXz/auth-backend/commit/83c28689b20ddffb57614aba27e55d4e26f9423e))
* add support for Anthropic models, enhance browser service with new endpoints, and update messaging service for online status ([7cc2393](https://github.com/ErzenXz/auth-backend/commit/7cc239311cdac3790f47f5826cd5efa54e1b6e66))
* add support for new AI models including Llama and Mixtral; implement content generation history methods in providers ([baf2829](https://github.com/ErzenXz/auth-backend/commit/baf28290647412ded88433e6ff082e253feee241))
* add WebSocket gateway for AI chat streaming and update server URL ([31f2ee4](https://github.com/ErzenXz/auth-backend/commit/31f2ee43b2a5dfd8c6ca15d7d8a63e77f4c19906))
* change default environment from dev to prod in Infisical configuration ([4959243](https://github.com/ErzenXz/auth-backend/commit/4959243ccff06eb4a30da6e18e30c4fe9bf419c9))
* enhance agent execution service by processing template variables in prompts and improving nested object handling in template processing ([2e728a8](https://github.com/ErzenXz/auth-backend/commit/2e728a859a0cce0b2f2c31e7d335e8c0aa6f7703))
* enhance AI response structure with thinking content and update model defaults ([4dd6f59](https://github.com/ErzenXz/auth-backend/commit/4dd6f59311603746dd76da07becac13e078cd0bd))
* enhance chat processing by implementing parallel data fetching and response handling ([b2d3998](https://github.com/ErzenXz/auth-backend/commit/b2d3998130f3eaf54b773b088e9c73c0ccd577fa))
* enhance error handling and validation in messaging and OAuth services ([d4fe2c7](https://github.com/ErzenXz/auth-backend/commit/d4fe2c7d0dd0c15ccf748ffb6ec284531394ac9c))
* enhance Infisical run script to support watch mode and specify domain ([2822896](https://github.com/ErzenXz/auth-backend/commit/2822896cdebaba704583f35db7fbd94344582d9a))
* enhance SSE chunk flushing mechanism and add completion event ([25fd6b6](https://github.com/ErzenXz/auth-backend/commit/25fd6b652988b3bbdc434f7cfd4a04cd26e7045d))
* enhance Swagger documentation with RenameChatThreadDto schema and update external content integration for improved clarity ([8bc8464](https://github.com/ErzenXz/auth-backend/commit/8bc846425e378b8957b282f862e235fbcb81ad9a))
* enhance TypeScript configuration and refactor imports for better compatibility; improve error logging and add throttling support with Redis ([430db8e](https://github.com/ErzenXz/auth-backend/commit/430db8eeb6165c357773271e242589d66abe97e5))
* enhance user memory handling and refine message role assignment in AI providers ([3d14fbf](https://github.com/ErzenXz/auth-backend/commit/3d14fbf96484aa5bbc164e415ad9d78d6ddd714a))
* enhance Winston logging configuration with node ID and improved error handling ([e15aa19](https://github.com/ErzenXz/auth-backend/commit/e15aa19300025090a31dd295b362e6c37fbb77f3))
* implement dynamic retrieval configuration for Google generative model ([68f63fe](https://github.com/ErzenXz/auth-backend/commit/68f63feb94bb4dabfc5c17299a4597883aa45b10))
* implement GraphQL API with sample resolver and PostHog integration ([52fe78a](https://github.com/ErzenXz/auth-backend/commit/52fe78a74a7a179d47a17bc7199e18f072174a72))
* implement immediate chunk flushing in AI providers and enhance response handling ([1c334a3](https://github.com/ErzenXz/auth-backend/commit/1c334a34539bd2f99cef3630bd450644086f99a0))
* implement OAuth strategies for Google, GitHub, LinkedIn, Facebook, and Discord ([b20c731](https://github.com/ErzenXz/auth-backend/commit/b20c731f6fda7a80f173596fe0251ed7208fbc60))
* improve HTTPS setup and add file validation in storage controller ([fc40716](https://github.com/ErzenXz/auth-backend/commit/fc407166dc56a9dc9cd3d7ebcaaac645062371f1))
* integrate BullMQ for email processing and queue management ([9236987](https://github.com/ErzenXz/auth-backend/commit/92369871d8d8d57ffc09d7b83d3b7a9ce7e8da1c))
* introduce Agent module with CRUD operations, execution management, and step handling for agents, including API integration and credential management ([66854a1](https://github.com/ErzenXz/auth-backend/commit/66854a11aff90fcc0366267f97c3204d2163a487))
* redefine conversation processing framework with enhanced emotional intelligence and adaptive communication guidelines ([58835b9](https://github.com/ErzenXz/auth-backend/commit/58835b94396c3028a40d9e586cecb91d34bf9d70))
* refactor AI model integration to use OpenRouter and update related services ([f655dcd](https://github.com/ErzenXz/auth-backend/commit/f655dcd8f22d42020a7ece1e5cf1b5fa051214f7))
* refactor chat thread creation and message handling in intelligence service ([b084a69](https://github.com/ErzenXz/auth-backend/commit/b084a69175af4a56bf8ac89617ce2d35ea2b6fb3))
* refactor email service to use Prisma for event logging and update SMTP configuration to use environment variables ([53c0b47](https://github.com/ErzenXz/auth-backend/commit/53c0b47f2bf4808551cad9c6d44a079ed7da419d))
* refine conversation processing framework with enhanced emotional intelligence, adaptive communication, and improved response guidelines ([2e70c2c](https://github.com/ErzenXz/auth-backend/commit/2e70c2c611dd1772a98b843ddcfd41d8e955bacc))
* refine thought prompt generation for enhanced reasoning clarity and structure ([6dcc1ca](https://github.com/ErzenXz/auth-backend/commit/6dcc1cab4f399ee2217b238dcc78508a2d10bda3))
* remove unused @sentry/wizard dependency from package.json ([483b3ff](https://github.com/ErzenXz/auth-backend/commit/483b3ff3e6fc0ba21ff7c7e233b3446ecdf9ceb7))
* update .env.example with new API keys and OAuth configurations ([40e5a68](https://github.com/ErzenXz/auth-backend/commit/40e5a6819dbff50c9ff8593a9e30db90787ee04f))
* update .gitignore, Dockerfile, tsconfig.json, and package.json for improved configuration and Sentry integration ([deb1421](https://github.com/ErzenXz/auth-backend/commit/deb14215c418aedfed028bc59aacb893fac09eb1))
* update @nestjs/devtools-integration to version 0.2.0 and enhance GraphQL middleware authentication logic ([2865a21](https://github.com/ErzenXz/auth-backend/commit/2865a213aa5dea186825524045ca83542dd2780a))
* update AI model mappings and enhance project architect instructions for improved clarity and detail ([83d2330](https://github.com/ErzenXz/auth-backend/commit/83d23302ca3647c11f129bc7625848e46d37fcb4))
* update AI model references and increase throttler limit in application ([82e6b47](https://github.com/ErzenXz/auth-backend/commit/82e6b4722635e7da89b891169373368f27d62420))
* update auth service to use await for user password reset operations ([627d6ed](https://github.com/ErzenXz/auth-backend/commit/627d6edca127fa92d4d1a5c9958993715fa9ab0d))
* update authentication URLs to use new domain ([36d30bb](https://github.com/ErzenXz/auth-backend/commit/36d30bb7ff9a974029b23143a8eac68d63206e73))
* update callback URLs for OAuth strategies and add EmailModule to AppModule ([e0f62ac](https://github.com/ErzenXz/auth-backend/commit/e0f62ac4ba1d111ee2562e58886ff6d653242007))
* update chat stream response headers to use application/octet-stream ([3a04704](https://github.com/ErzenXz/auth-backend/commit/3a04704e494dc6382c970e22e3ed09836ad6f155))
* update conversation processing framework with structured system prompt and enhanced guidelines for user interactions ([3c32fbc](https://github.com/ErzenXz/auth-backend/commit/3c32fbc72607da4f528167dce8fcb7770da0fdc0))
* update data types for various DTOs and models to use strings instead of numbers; modify default environment in configuration ([95139ae](https://github.com/ErzenXz/auth-backend/commit/95139ae55a2809cc7d50026b79786f079b3d52c7))
* update default AI model to Qwen2Coder, add GroqProvider, and implement reasoning draft endpoint ([2f4ac06](https://github.com/ErzenXz/auth-backend/commit/2f4ac06bb547658c89067051e1643bae6ce6c4e3))
* update default model in LlamaProvider to Mistral_Small_3_Instruct for improved performance ([5e606bf](https://github.com/ErzenXz/auth-backend/commit/5e606bfbe48f1d60c307dae7d645c505c0c6d1d7))
* update Docker CI workflow to include image testing ([569f851](https://github.com/ErzenXz/auth-backend/commit/569f8513c43b93d3914f2d768d1ddba2af81775e))
* update Google AI packages and add new Gemini model ([0104fa8](https://github.com/ErzenXz/auth-backend/commit/0104fa8129f0734473fda641fd59b467a9538d2a))
* update Infisical run script to support watch mode and adjust link extraction limits in browser service ([9cf55b2](https://github.com/ErzenXz/auth-backend/commit/9cf55b2aaf18ea628a8184c945ab9f063b221d58))
* update Llama provider configuration and model mappings for new API ([9030686](https://github.com/ErzenXz/auth-backend/commit/9030686cc6c4790a625f07d4148cfd9905afc959))
* update NestJS and Sentry dependencies to latest versions ([a8e7964](https://github.com/ErzenXz/auth-backend/commit/a8e796432864447e7be7c10abd8625b452e96725))
* update response headers for Server-Sent Events and improve chunk flushing ([5817b36](https://github.com/ErzenXz/auth-backend/commit/5817b3628af9d0d4dd1ac13aad883472cabc3a53))
* update Swagger configuration to reflect new API domain URLs ([48ff1e1](https://github.com/ErzenXz/auth-backend/commit/48ff1e1e0f2954b2e9dd0e17c48813b8b7d0b9a3))
* update thought prompt generation for improved clarity and structure, and change default AI model to Llama_3_3_70B_speed ([4b718cf](https://github.com/ErzenXz/auth-backend/commit/4b718cf36f6b213d855e9c8177ee1abc66c4c464))
* update UserMemory model with new unique and index constraints; enhance BrowserService for improved URL fetching and content extraction ([f9e2f81](https://github.com/ErzenXz/auth-backend/commit/f9e2f817e3161e6a2edb938d3c3e07ab1d21fe04))



