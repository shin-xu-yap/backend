import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { JobService } from './job.service';
import { JobModel, PaginatedJobs } from './job.model';
import { CreateJobInput, UpdateJobInput, JobFilterInput } from './job.dto';

@Resolver(() => JobModel)
export class JobResolver {
  constructor(private jobService: JobService) {}

  @Query(() => PaginatedJobs)
  jobs(
    @Args('filter', { nullable: true }) filter?: JobFilterInput,
    @Args('page', { type: () => Int, nullable: true }) page = 1,
    @Args('limit', { type: () => Int, nullable: true }) limit = 10,
  ) {
    return this.jobService.listJobs(filter, page, limit);
  }

  @Query(() => JobModel)
  async job(@Args('id', { type: () => Int }) id: number) {
    const job = await this.jobService.getJob(id);

    return {
      ...job,
      skills: job?.skills.map((js) => ({
        skillId: js.skill.id,
        name: js.skill.name,
      })),
    };
  }

  @Mutation(() => JobModel)
  createJob(@Args('input') input: CreateJobInput) {
    return this.jobService.createJob(input);
  }

  @Mutation(() => JobModel)
  updateJob(@Args('input') input: UpdateJobInput) {
    return this.jobService.updateJob(input);
  }

  @Mutation(() => JobModel)
  deleteJob(@Args('id', { type: () => Int }) id: number) {
    return this.jobService.deleteJob(id);
  }
}
