import { Module } from '@nestjs/common';
import { FavoriteJobService } from './favorite-job.service';
import { FavoriteJobResolver } from './favorite-job.resolver';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [FavoriteJobService, FavoriteJobResolver, PrismaService],
  exports: [FavoriteJobService],
})
export class FavoriteJobModule {}
