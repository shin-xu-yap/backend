import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { IndustryEnum } from './job.enum';
import { JobSkillModel } from './job-skill.model';

@ObjectType()
export class JobModel {
  @Field(() => Int)
  id: number;

  @Field()
  title: string;

  @Field({ nullable: true })
  company?: string;

  @Field({ nullable: true })
  location?: string;

  @Field({ nullable: true })
  experienceLevel?: string;

  @Field(() => Float, { nullable: true })
  salary?: number;

  @Field(() => IndustryEnum)
  industry: IndustryEnum;

  @Field(() => [JobSkillModel], { nullable: true })
  skills?: JobSkillModel[];
}

@ObjectType()
export class PaginatedJobs {
  @Field(() => [JobModel])
  data: JobModel[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  limit: number;
}
