import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ElasticModule } from './elastic/elastic.module';
import { JobResolver } from './job/job.resolver';

@Module({
  imports: [
    ElasticModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: true,
    }),
  ],
  providers: [JobResolver],
})
export class AppModule {}
