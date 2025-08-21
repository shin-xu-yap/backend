import { InputType, Field, Int, Float } from '@nestjs/graphql';
import { IndustryEnum } from './job.enum';
import { Industry } from '@prisma/client';

@InputType()
export class CreateJobInput {
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
  industry: Industry;

  @Field(() => [Int], { nullable: true })
  skillIds?: number[];
}

@InputType()
export class UpdateJobInput {
  @Field(() => Int)
  id: number;

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  company?: string;

  @Field({ nullable: true })
  location?: string;

  @Field({ nullable: true })
  experienceLevel?: string;

  @Field(() => Float, { nullable: true })
  salary?: number;

  @Field(() => IndustryEnum, { nullable: true })
  industry?: Industry;

  @Field(() => [Int], { nullable: true })
  skillIds?: number[];
}

@InputType()
export class JobFilterInput {
  @Field({ nullable: true })
  search?: string;

  @Field(() => IndustryEnum, { nullable: true })
  industry?: Industry;

  @Field({ nullable: true })
  sortBySalary?: 'asc' | 'desc';
}
