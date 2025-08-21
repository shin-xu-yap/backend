import { GraphQLModule } from '@nestjs/graphql';
import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { PrismaModule } from './prisma/prisma.module';
import { JobModule } from './job/job.module';
import { FavoriteJobModule } from './favorite-job/favorite-job.module';
import { ElasticModule } from './elastic/elastic.module';

@Module({
  imports: [
    ElasticModule,
    PrismaModule,
    JobModule,
    FavoriteJobModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: true,
    }),
  ],
})
export class AppModule {}
