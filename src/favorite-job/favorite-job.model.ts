import { ObjectType, Field, Int } from '@nestjs/graphql';
import { JobModel } from '../job/job.model';

@ObjectType()
export class FavoriteJobModel {
  @Field(() => Int)
  userId: number;

  @Field(() => Int)
  jobId: number;

  @Field(() => JobModel)
  job: JobModel;
}
