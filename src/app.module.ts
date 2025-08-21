import { GraphQLModule } from '@nestjs/graphql';
import { Module } from '@nestjs/common';
// import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { PrismaModule } from './prisma/prisma.module';
import { JobModule } from './job/job.module';
import { FavoriteJobModule } from './favorite-job/favorite-job.module';

@Module({
  imports: [
    PrismaModule,
    JobModule,
    FavoriteJobModule,
    GraphQLModule.forRoot({
      autoSchemaFile: true,
      playground: true,
      cors: {
        origin: [
          'https://frontend-lilac-one-21.vercel.app',
          'http://localhost:3000',
        ],
        credentials: true,
      },
    }),
  ],
})
export class AppModule {}
