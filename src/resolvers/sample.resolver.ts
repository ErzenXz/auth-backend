import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { SampleType } from './models/sample.model';

@Resolver(() => SampleType)
export class SampleResolver {
  @Query(() => String)
  hello() {
    return 'Hello GraphQL!';
  }

  @Mutation(() => String)
  createSample(@Args('message') message: string): string {
    // Add business logic here...
    return `Created sample with message: ${message}`;
  }
}
