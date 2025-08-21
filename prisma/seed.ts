import { PrismaClient, Industry } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { Client as ESClient } from '@elastic/elasticsearch';

const prisma = new PrismaClient();
const es = new ESClient({
  cloud: { id: process.env.ELASTICSEARCH_CLOUD_ID! },
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME!,
    password: process.env.ELASTICSEARCH_PASSWORD!,
  },
});

type JobRow = {
  'Job Title': string;
  Company: string;
  Location: string;
  'Experience Level': string;
  Salary: string;
  Industry: string;
  'Required Skills': string;
};

// --- Utility: batch processing ---
async function batchCreate<T>(
  data: T[],
  fn: (batch: T[]) => Promise<any>,
  batchSize = 500,
) {
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await fn(batch);
  }
}

// --- Load CSV as a stream ---
function streamCSV(filePath: string) {
  return fs
    .createReadStream(filePath)
    .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }));
}

// --- Create Elasticsearch index if missing ---
async function createJobsIndex() {
  const exists = await es.indices.exists({ index: 'jobs' });
  if (!exists) {
    await es.indices.create({
      index: 'jobs',
      mappings: {
        properties: {
          id: { type: 'integer' },
          title: { type: 'text' },
          company: { type: 'text' },
          location: { type: 'text' },
          experienceLevel: { type: 'keyword' },
          salary: { type: 'integer' },
          industry: { type: 'text' },
          skills: {
            type: 'nested',
            properties: {
              skillId: { type: 'integer' },
              name: { type: 'text' },
            },
          },
        },
      },
    });
    console.log('Elasticsearch index "jobs" created.');
  }
}

// --- Seed demo user ---
async function seedDemoUser() {
  const demoEmail = 'demo@example.com';
  const existingUser = await prisma.user.findUnique({
    where: { email: demoEmail },
  });
  if (existingUser) return existingUser;

  const newUser = await prisma.user.create({
    data: { email: demoEmail, name: 'Demo User', password: 'password123' },
  });
  console.log('Demo user created:', newUser.email);
  return newUser;
}

async function main() {
  const demoUser = await seedDemoUser();
  console.log('Seeding demo user:', demoUser.email);

  const filePath = path.join(
    __dirname,
    'data',
    'job_recommendation_dataset.csv',
  );
  const skillSet = new Set<string>();

  const parser = streamCSV(filePath);

  // --- Step 1: Collect skills only ---
  for await (const row of parser as AsyncIterable<JobRow>) {
    row['Required Skills']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((skill) => skillSet.add(skill));
  }

  // --- Step 2: Insert skills ---
  const skillNames = Array.from(skillSet);
  await batchCreate(
    skillNames.map((name) => ({ name })),
    (batch) => prisma.skill.createMany({ data: batch, skipDuplicates: true }),
  );

  const skills = await prisma.skill.findMany();
  const skillMap = new Map(skills.map((s) => [s.name, s.id]));

  // --- Step 3: Re-stream CSV for jobs & job-skill links ---
  const parser2 = streamCSV(filePath);
  const jobBatch: any[] = [];
  const jobSkillBatch: {
    jobTitle: string;
    company: string;
    skillId: number;
  }[] = [];
  const BATCH_SIZE = 200;

  for await (const row of parser2 as AsyncIterable<JobRow>) {
    jobBatch.push({
      title: row['Job Title'],
      company: row.Company,
      location: row.Location,
      experienceLevel: row['Experience Level'],
      salary: Number(row.Salary) || 0,
      industry: row.Industry as Industry,
    });

    const jobKey = { title: row['Job Title'], company: row.Company };
    row['Required Skills']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((skillName) => {
        const skillId = skillMap.get(skillName);
        if (skillId)
          jobSkillBatch.push({
            ...jobKey,
            skillId,
            jobTitle: '',
          });
      });

    if (jobBatch.length >= BATCH_SIZE) {
      await prisma.job.createMany({ data: jobBatch, skipDuplicates: true });
      jobBatch.length = 0;
    }

    if (jobSkillBatch.length >= BATCH_SIZE) {
      // Resolve job IDs from DB
      const jobs = await prisma.job.findMany({
        where: {
          OR: jobSkillBatch.map((js) => ({
            title: js.jobTitle,
            company: js.company,
          })),
        },
      });
      const jobIdMap = new Map(
        jobs.map((j) => [`${j.title}-${j.company}`, j.id]),
      );

      const links = jobSkillBatch
        .map((js) => {
          const jobId = jobIdMap.get(`${js.jobTitle}-${js.company}`);
          return jobId ? { jobId, skillId: js.skillId } : null;
        })
        .filter(Boolean) as { jobId: number; skillId: number }[];

      await prisma.jobSkill.createMany({ data: links, skipDuplicates: true });
      jobSkillBatch.length = 0;
    }
  }

  // Insert remaining jobs
  if (jobBatch.length)
    await prisma.job.createMany({ data: jobBatch, skipDuplicates: true });

  // Insert remaining job-skill links
  if (jobSkillBatch.length) {
    const jobs = await prisma.job.findMany({
      where: {
        OR: jobSkillBatch.map((js) => ({
          title: js.jobTitle,
          company: js.company,
        })),
      },
    });
    const jobIdMap = new Map(
      jobs.map((j) => [`${j.title}-${j.company}`, j.id]),
    );

    const links = jobSkillBatch
      .map((js) => {
        const jobId = jobIdMap.get(`${js.jobTitle}-${js.company}`);
        return jobId ? { jobId, skillId: js.skillId } : null;
      })
      .filter(Boolean) as { jobId: number; skillId: number }[];

    await prisma.jobSkill.createMany({ data: links, skipDuplicates: true });
  }

  // --- Step 4: Elasticsearch indexing ---
  await createJobsIndex();
  let skip = 0;
  while (true) {
    const jobsChunk = await prisma.job.findMany({
      skip,
      take: BATCH_SIZE,
      include: { skills: { include: { skill: true } } },
    });
    if (!jobsChunk.length) break;

    const esBody = jobsChunk.flatMap((job) => [
      { index: { _index: 'jobs', _id: job.id } },
      {
        title: job.title,
        company: job.company,
        location: job.location,
        experienceLevel: job.experienceLevel,
        salary: job.salary,
        industry: job.industry,
        skills: (job.skills || []).map((js) => ({
          skillId: js.skill.id,
          name: js.skill.name,
        })),
      },
    ]);

    await es.bulk({ refresh: true, body: esBody });
    skip += BATCH_SIZE;
  }

  console.log('Seeding complete!');
}

void main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
