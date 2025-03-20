import { Injectable, Logger } from '@nestjs/common';
import { IApiCallResult, IRetryConfig } from '../models';
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

@Injectable()
export class ApiIntegrationService {
  private readonly logger = new Logger(ApiIntegrationService.name);

  /**
   * Make an API call with retry logic
   */
  async makeApiCall(
    endpoint: string,
    method: string,
    headers: Record<string, string> = {},
    body: any = null,
    retryConfig?: IRetryConfig,
  ): Promise<IApiCallResult> {
    const config: AxiosRequestConfig = {
      url: endpoint,
      method: method.toLowerCase(),
      headers,
      timeout: 30000, // 30 seconds default timeout
    };

    if (['post', 'put', 'patch'].includes(method.toLowerCase()) && body) {
      config.data = body;
    }

    return this.executeWithRetry(async () => {
      try {
        const response: AxiosResponse = await axios(config);

        return {
          status: response.status,
          headers: response.headers as Record<string, string>,
          data: response.data,
        };
      } catch (error) {
        const axiosError = error as AxiosError;

        // Create a more structured error object
        const apiError = new Error(
          `API call failed: ${axiosError.message}. ${
            axiosError.response?.data
              ? JSON.stringify(axiosError.response.data)
              : ''
          }`,
        );

        // Add request details to the error for better debugging
        (apiError as any).status = axiosError.response?.status;
        (apiError as any).data = axiosError.response?.data;
        (apiError as any).endpoint = endpoint;
        (apiError as any).method = method;

        throw apiError;
      }
    }, retryConfig);
  }

  /**
   * Execute a function with retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    retryConfig?: IRetryConfig,
  ): Promise<T> {
    const maxRetries = retryConfig?.maxRetries || 0;
    const retryDelay = retryConfig?.retryDelay || 1000;

    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          this.logger.warn(
            `API call failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}`,
          );

          // Wait before retrying
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay * Math.pow(2, attempt)),
          );
        }
      }
    }

    // If we've exhausted all retries, throw the last error
    throw lastError;
  }
}
