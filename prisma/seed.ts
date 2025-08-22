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

// --- Load CSV ---
function loadCSV(filePath: string): Promise<JobRow[]> {
  return new Promise((resolve, reject) => {
    const rows: JobRow[] = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', (row: JobRow) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

// --- Elasticsearch index ---
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

  return prisma.user.create({
    data: { email: demoEmail, name: 'Demo User', password: 'password123' },
  });
}

async function main() {
  const demoUser = await seedDemoUser();
  console.log('Seeding demo user:', demoUser.email);

  const filePath = path.join(
    __dirname,
    'data',
    'job_recommendation_dataset.csv',
  );
  const rows = await loadCSV(filePath);

  // --- Collect skills ---
  const skillSet = new Set<string>();
  rows.forEach((row) =>
    row['Required Skills']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((skill) => skillSet.add(skill)),
  );

  // --- Insert skills ---
  const skillNames = Array.from(skillSet);
  await prisma.skill.createMany({
    data: skillNames.map((name) => ({ name })),
    skipDuplicates: true,
  });
  const skills = await prisma.skill.findMany();
  const skillMap = new Map(skills.map((s) => [s.name, s.id]));

  // --- Insert jobs ---
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const jobs = await prisma.job.createMany({
    data: rows.map((row) => ({
      title: row['Job Title'],
      company: row.Company,
      location: row.Location,
      experienceLevel: row['Experience Level'],
      salary: Number(row.Salary) || 0,
      industry: row.Industry as Industry,
    })),
    skipDuplicates: true,
  });

  // --- Insert job-skill links ---
  for (const row of rows) {
    const job = await prisma.job.findFirst({
      where: { title: row['Job Title'], company: row.Company },
    });
    if (!job) continue;

    const skillLinks = row['Required Skills']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((skillName) => ({
        jobId: job.id,
        skillId: skillMap.get(skillName)!,
      }));

    await prisma.jobSkill.createMany({
      data: skillLinks,
      skipDuplicates: true,
    });
  }

  // --- Elasticsearch indexing ---
  await createJobsIndex();
  const allJobs = await prisma.job.findMany({
    include: { skills: { include: { skill: true } } },
  });

  const esBody = allJobs.flatMap((job) => [
    { index: { _index: 'jobs', _id: job.id } },
    {
      title: job.title,
      company: job.company,
      location: job.location,
      experienceLevel: job.experienceLevel,
      salary: job.salary,
      industry: job.industry,
      skills: job.skills.map((js) => ({
        skillId: js.skill.id,
        name: js.skill.name,
      })),
    },
  ]);
  await es.bulk({ refresh: true, body: esBody });

  console.log('Seeding complete!');
}

void main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
