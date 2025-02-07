import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class SampleType {
  @Field()
  message: string;
}
