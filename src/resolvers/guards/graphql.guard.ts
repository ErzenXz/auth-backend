import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GqlExecutionContext } from '@nestjs/graphql';

/**
 * GraphQL Throttler Guard.
 * Extends the ThrottlerGuard to handle GraphQL requests.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  /**
   * Determines if the request is allowed to proceed.
   * Always allows GraphQL requests to bypass throttling.
   * @param context - The execution context.
   * @returns A promise resolving to true if allowed, false otherwise.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if ((context.getType() as string) === 'graphql') {
      return true;
    }
    return super.canActivate(context);
  }

  /**
   * Retrieves the request and response objects from the context.
   * Handles GraphQL contexts specifically.
   * @param context - The execution context.
   * @returns An object containing the request and response objects.
   */
  protected getRequestResponse(context: ExecutionContext) {
    if ((context.getType() as string) === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context).getContext();
      return { req: gqlCtx.req, res: gqlCtx.res };
    }
    return super.getRequestResponse(context);
  }
}
