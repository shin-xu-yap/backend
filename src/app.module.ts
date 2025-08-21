import { GraphQLModule } from '@nestjs/graphql';
import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { PrismaModule } from './prisma/prisma.module';
import { JobModule } from './job/job.module';
import { FavoriteJobModule } from './favorite-job/favorite-job.module';

@Module({
  imports: [
    PrismaModule,
    JobModule,
    FavoriteJobModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: true,
      path: '/graphql',
    }),
  ],
})
export class AppModule {}
