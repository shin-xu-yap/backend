import { registerEnumType } from '@nestjs/graphql';

export enum IndustryEnum {
  Software = 'Software',
  Manufacturing = 'Manufacturing',
  Marketing = 'Marketing',
  Education = 'Education',
  Retail = 'Retail',
  Healthcare = 'Healthcare',
  Finance = 'Finance',
}

registerEnumType(IndustryEnum, {
  name: 'Industry', // GraphQL schema name
});
