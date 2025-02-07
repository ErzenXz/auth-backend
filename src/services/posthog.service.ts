import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PostHog } from 'posthog-node';

/**
 * Service for interacting with PostHog.
 * This service provides methods for capturing events in PostHog.
 */
@Injectable()
export class PostHogService implements OnModuleInit, OnModuleDestroy {
  private client: PostHog;

  /**
   * Initializes the PostHog client.
   * This method is called when the module is initialized.
   */
  onModuleInit(): void {
    this.client = new PostHog(process.env.POSTHOG_API_KEY, {
      host: process.env.POSTHOG_API_HOST || 'https://eu.i.posthog.com',
    });
  }

  /**
   * Captures an event in PostHog.
   * Sends an event with specified properties to PostHog.
   * @param distinctId - The unique identifier of the user.
   * @param event - The name of the event.
   * @param properties - Optional properties associated with the event.
   */
  async captureEvent(
    distinctId: string,
    event: string,
    properties?: Record<string, any>,
  ): Promise<void> {
    this.client.capture({ distinctId, event, properties });
  }

  /**
   * Shuts down the PostHog client.
   * Ensures graceful shutdown of the client when the module is destroyed.
   */
  async onModuleDestroy() {
    await this.client.shutdown();
  }
}
