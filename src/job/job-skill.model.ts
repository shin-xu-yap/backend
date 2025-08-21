import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class JobSkillModel {
  @Field(() => Int)
  skillId: number;

  @Field({ nullable: true })
  name: string;
}
