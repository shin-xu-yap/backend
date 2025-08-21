import { Module } from '@nestjs/common';
import { JobService } from './job.service';
import { JobResolver } from './job.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { ElasticModule } from 'src/elastic/elastic.module';

@Module({
  imports: [PrismaModule, ElasticModule],
  providers: [JobService, JobResolver],
  exports: [JobService],
})
export class JobModule {}
