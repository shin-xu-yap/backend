import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class FavoriteJobInput {
  @Field(() => Int)
  userId: number;

  @Field(() => Int)
  jobId: number;
}
