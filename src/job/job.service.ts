import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobInput, UpdateJobInput, JobFilterInput } from './job.dto';
import { IndustryEnum } from './job.enum';
import { ElasticService, JobDocument } from 'src/elastic/elastic.service';
import { estypes } from '@elastic/elasticsearch';

@Injectable()
export class JobService {
  constructor(
    private prisma: PrismaService,
    private elasticService: ElasticService,
  ) {}

  async listJobs(
    filter?: JobFilterInput,
    page = 1,
    limit = 10,
  ): Promise<{
    data: JobDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { search, industry, sortBySalary } = filter || {};
    const filters: estypes.QueryDslQueryContainer[] = [];

    if (industry) filters.push({ term: { industry } });

    const sort = sortBySalary ? { salary: sortBySalary } : undefined;

    const results = await this.elasticService.searchJobs(
      search,
      filters,
      sort,
      (page - 1) * limit,
      limit,
    );

    return {
      data: results.data,
      total: results.total,
      page,
      limit,
    };
  }

  async getJob(id: number) {
    return this.prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        company: true,
        location: true,
        salary: true,
        industry: true,
        experienceLevel: true,
        skills: {
          select: {
            skill: {
              select: {
                id: true,
                name: true, // make sure name is fetched
              },
            },
          },
        },
      },
    });
  }

  async createJob(input: CreateJobInput) {
    const job = await this.prisma.job.create({
      data: {
        title: input.title,
        company: input.company,
        location: input.location,
        experienceLevel: input.experienceLevel,
        salary: input.salary,
        industry: input.industry as IndustryEnum,
        skills: input.skillIds
          ? { create: input.skillIds.map((skillId) => ({ skillId })) }
          : undefined,
      },
      include: { skills: { include: { skill: true } } },
    });

    // Index job in Elasticsearch
    await this.elasticService.indexJob({
      id: job.id,
      title: job.title ?? 'Unknown',
      company: job.company ?? 'Unknown',
      location: job.location ?? 'Unknown',
      experienceLevel: job.experienceLevel ?? 'Not specified',
      salary: job.salary ?? 0,
      industry: job.industry ?? 'Unknown',
      skills: job.skills.map((s) => ({
        skillId: s.skill.id,
        name: s.skill.name,
      })),
    });

    return job;
  }

  async updateJob(input: UpdateJobInput) {
    const { skillIds, ...rest } = input;

    const job = await this.prisma.job.update({
      where: { id: input.id },
      data: {
        ...rest,
        industry: rest.industry ? (rest.industry as IndustryEnum) : undefined,
        skills: skillIds
          ? {
              deleteMany: {},
              create: skillIds.map((skillId) => ({ skillId })),
            }
          : undefined,
      },
      include: { skills: { include: { skill: true } } },
    });

    // Reindex job in Elasticsearch
    await this.elasticService.indexJob({
      id: job.id,
      title: job.title ?? 'Unknown',
      company: job.company ?? 'Unknown',
      location: job.location ?? 'Unknown',
      experienceLevel: job.experienceLevel ?? 'Not specified',
      salary: job.salary ?? 0,
      industry: job.industry ?? 'Unknown',
      skills: job.skills.map((s) => ({
        skillId: s.skill.id,
        name: s.skill.name,
      })),
    });

    return job;
  }

  async deleteJob(id: number) {
    await this.prisma.job.delete({ where: { id } });

    // Remove from Elasticsearch
    await this.elasticService.deleteJob(id);

    return { success: true };
  }
}
