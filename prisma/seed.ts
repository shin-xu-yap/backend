import { Industry, PrismaClient } from '@prisma/client';
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
  const jobMap = new Map<string, Omit<JobRow, 'Required Skills'>>();
  const jobSkillLinks: { jobKey: string; skillName: string }[] = [];

  const parser = streamCSV(filePath);

  for await (const row of parser as AsyncIterable<JobRow>) {
    // Collect unique skills
    row['Required Skills']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((skill) => skillSet.add(skill));

    // Deduplicate jobs
    const jobKey = `${row['Job Title']}-${row.Company}`;
    if (!jobMap.has(jobKey)) jobMap.set(jobKey, row);

    // Prepare job-skill links
    row['Required Skills']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((skillName) => {
        jobSkillLinks.push({ jobKey, skillName });
      });
  }

  // --- Insert skills ---
  const skillNames = Array.from(skillSet);
  await batchCreate(
    skillNames.map((name) => ({ name })),
    (batch) => prisma.skill.createMany({ data: batch, skipDuplicates: true }),
  );

  const skills = await prisma.skill.findMany();
  const skillMap = new Map(skills.map((s) => [s.name, s.id]));

  // --- Insert jobs ---
  const uniqueJobs = Array.from(jobMap.values());
  await batchCreate(
    uniqueJobs.map((j) => ({
      title: j['Job Title'],
      company: j.Company,
      location: j.Location,
      experienceLevel: j['Experience Level'],
      salary: Number(j.Salary) || 0,
      industry: j.Industry as Industry,
    })),
    (batch) => prisma.job.createMany({ data: batch, skipDuplicates: true }),
  );

  const jobs = await prisma.job.findMany();
  const jobIdMap = new Map(jobs.map((j) => [`${j.title}-${j.company}`, j.id]));

  // --- Link job-skills ---
  const jobSkillData = jobSkillLinks
    .map((link) => {
      const jobId = jobIdMap.get(link.jobKey);
      const skillId = skillMap.get(link.skillName);
      return jobId && skillId ? { jobId, skillId } : null;
    })
    .filter(Boolean) as { jobId: number; skillId: number }[];

  await batchCreate(jobSkillData, (batch) =>
    prisma.jobSkill.createMany({ data: batch, skipDuplicates: true }),
  );

  // --- Elasticsearch indexing in batches ---
  await createJobsIndex();

  const jobsWithSkills = await prisma.job.findMany({
    include: { skills: { include: { skill: true } } },
  });

  await batchCreate(jobsWithSkills, (batch) => {
    const esBody = batch.flatMap((job) => [
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
    return es.bulk({ refresh: true, body: esBody });
  });

  console.log('Seeding complete!');
}

void main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
