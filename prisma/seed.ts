import { Industry, PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { Client as ESClient } from '@elastic/elasticsearch';

const prisma = new PrismaClient();
const es = new ESClient({ node: 'http://localhost:9200' });

type JobRow = {
  'Job Title': string;
  Company: string;
  Location: string;
  'Experience Level': string;
  Salary: string;
  Industry: string;
  'Required Skills': string;
};

function loadCSV(filePath: string): JobRow[] {
  const file = fs.readFileSync(filePath, 'utf8');
  return parse<JobRow>(file, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

async function createJobsIndex() {
  const exists = await es.indices.exists({ index: 'jobs' });
  if (!exists) {
    await es.indices.create({
      index: 'jobs',
      body: {
        mappings: {
          properties: {
            title: { type: 'text' },
            company: { type: 'text' },
            location: { type: 'text' },
            experienceLevel: { type: 'keyword' },
            salary: { type: 'float' },
            industry: { type: 'keyword' },
            skills: {
              type: 'nested',
              properties: {
                skillId: { type: 'integer' },
                name: { type: 'keyword' },
              },
            },
          },
        },
      },
    });
    console.log('Elasticsearch index "jobs" created.');
  }
}

async function seedDemoUser() {
  const demoEmail = 'demo@example.com';

  // Check if the user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: demoEmail },
  });

  if (existingUser) {
    console.log('Demo user already exists:', existingUser.email);
    return existingUser;
  }

  const newUser = await prisma.user.create({
    data: {
      email: demoEmail,
      name: 'Demo User',
      password: 'password123',
    },
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
  const rows = loadCSV(filePath);

  // --- Deduplicate and insert skills ---
  const skillNames = Array.from(
    new Set(
      rows.flatMap((r) =>
        r['Required Skills']
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ),
  );

  await prisma.skill.createMany({
    data: skillNames.map((name) => ({ name })),
    skipDuplicates: true,
  });

  const skills = await prisma.skill.findMany();

  // --- Deduplicate and insert jobs ---
  const uniqueJobs = Array.from(
    new Map(rows.map((r) => [`${r['Job Title']}-${r.Company}`, r])).values(),
  );

  await prisma.job.createMany({
    data: uniqueJobs.map((j) => ({
      title: j['Job Title'],
      company: j.Company,
      location: j.Location,
      experienceLevel: j['Experience Level'],
      salary: Number(j.Salary) || 0,
      industry: j.Industry as Industry,
    })),
    skipDuplicates: true,
  });

  // --- Create job-skill links ---
  const jobs = await prisma.job.findMany();
  const jobSkillLinks = Array.from(
    new Set(
      rows.flatMap((row) => {
        const job = jobs.find(
          (j) => j.title === row['Job Title'] && j.company === row.Company,
        );
        if (!job) return [];
        return row['Required Skills']
          .split(',')
          .map((skillName) => {
            const skill = skills.find((s) => s.name === skillName.trim());
            if (!skill) return null;
            return `${job.id}-${skill.id}`;
          })
          .filter(Boolean) as string[];
      }),
    ),
  ).map((linkStr) => {
    const [jobId, skillId] = linkStr.split('-').map(Number);
    return { jobId, skillId };
  });

  await prisma.jobSkill.createMany({
    data: jobSkillLinks,
    skipDuplicates: true,
  });

  // --- Reload jobs with skills after linking ---
  const jobsWithSkills = await prisma.job.findMany({
    include: {
      skills: {
        include: {
          skill: true,
        },
      },
    },
  });

  // --- Elasticsearch indexing ---
  await createJobsIndex();

  const esBody = jobsWithSkills.flatMap((job) => {
    const jobSkills = (job.skills || [])
      .filter((js) => js.skill?.name) // only keep valid skills
      .map((js) => ({
        skillId: js.skill.id,
        name: js.skill.name,
      }));

    return [
      { index: { _index: 'jobs', _id: job.id } },
      {
        title: job.title,
        company: job.company,
        location: job.location,
        experienceLevel: job.experienceLevel,
        salary: job.salary,
        industry: job.industry,
        skills: jobSkills,
      },
    ];
  });

  if (esBody.length > 0) {
    await es.bulk({ refresh: true, body: esBody });
    console.log(`Indexed ${jobsWithSkills.length} jobs into Elasticsearch.`);
  }
}

void main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
