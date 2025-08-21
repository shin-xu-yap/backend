/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Client } from '@elastic/elasticsearch';

interface Skill {
  skillId: string;
  name: string;
}

interface JobSource {
  title: string;
  company: string;
  location: string;
  skills: Skill[];
  experienceLevel: string;
  salary: string;
  industry: string;
}

interface JobDocument {
  _id: string;
  _source: JobSource;
}

interface SearchHits {
  hits: JobDocument[];
  total: { value: number; relation: string };
}

interface SearchResponse {
  hits: SearchHits;
}

export class ElasticService {
  private client: Client;

  constructor() {
    if (
      !process.env.ES_NODE ||
      !process.env.ES_USERNAME ||
      !process.env.ES_PASSWORD
    ) {
      throw new Error('Elasticsearch environment variables are not set.');
    }

    this.client = new Client({
      node: process.env.ES_NODE,
      auth: {
        username: process.env.ES_USERNAME,
        password: process.env.ES_PASSWORD,
      },
      ssl: {
        rejectUnauthorized: false,
      },
    });
  }

  async searchJobs(index: string, query: object): Promise<JobSource[]> {
    try {
      const response = await this.client.search<SearchResponse>({
        index,
        body: query,
      });

      // access hits via response.body
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return response.body.hits.hits.map((hit) => hit._source);
    } catch (error: unknown) {
      console.error('Elasticsearch search error:', error);
      return [];
    }
  }

  async getAllJobs(): Promise<JobSource[]> {
    return this.searchJobs('jobs', { query: { match_all: {} } });
  }

  async getJobsBySkill(skillName: string): Promise<JobSource[]> {
    return this.searchJobs('jobs', {
      query: {
        nested: {
          path: 'skills',
          query: {
            match: { 'skills.name': skillName },
          },
        },
      },
    });
  }

  async getJobsSortedBySalary(): Promise<JobSource[]> {
    return this.searchJobs('jobs', {
      query: { match_all: {} },
      sort: [{ salary: { order: 'desc' } }],
    });
  }

  async getJobById(jobId: string): Promise<JobSource | null> {
    try {
      const response = await this.client.get<JobDocument>({
        index: 'jobs',
        id: jobId,
      });

      // access _source via response.body
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return response.body._source ?? null;
    } catch (error: unknown) {
      console.error('Elasticsearch getById error:', error);
      return null;
    }
  }
}
