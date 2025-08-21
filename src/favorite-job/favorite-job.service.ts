import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FavoriteJobInput } from './favorite-job.dto';

@Injectable()
export class FavoriteJobService {
  constructor(private prisma: PrismaService) {}

  async addFavorite(input: FavoriteJobInput) {
    return this.prisma.userFavoriteJob.upsert({
      where: {
        userId_jobId: {
          userId: input.userId,
          jobId: input.jobId,
        },
      },
      update: {}, // no need to change anything if already exists
      create: {
        userId: input.userId,
        jobId: input.jobId,
      },
      include: {
        job: { include: { skills: { include: { skill: true } } } },
      },
    });
  }

  async removeFavorite(input: FavoriteJobInput) {
    return this.prisma.userFavoriteJob.delete({
      where: {
        userId_jobId: { userId: input.userId, jobId: input.jobId },
      },
    });
  }

  async listFavorites(userId: number) {
    return this.prisma.userFavoriteJob.findMany({
      where: { userId },
      include: { job: { include: { skills: { include: { skill: true } } } } },
    });
  }

  async isFavorite(userId: number, jobId: number) {
    const favorite = await this.prisma.userFavoriteJob.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });
    return !!favorite; // true if exists, false otherwise
  }
}
