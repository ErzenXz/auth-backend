import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext) {
    if ((context.getType() as string) === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context).getContext();
      return { req: gqlCtx.req, res: gqlCtx.res };
    }
    return super.getRequestResponse(context);
  }

  protected async handleRequest(request: any): Promise<boolean> {
    // If there's no standard request, just skip throttling
    if (!request.req || typeof request.req.header !== 'function') {
      return true;
    }
    return super.handleRequest(request);
  }
}
