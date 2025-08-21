/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { Injectable } from '@nestjs/common';
import { Client, estypes } from '@elastic/elasticsearch';

export interface JobSkill {
  skillId: number;
  name: string;
}

export interface JobDocument {
  id: number;
  title: string;
  company: string;
  location: string;
  experienceLevel: string;
  salary: number;
  industry: string;
  skills: JobSkill[];
}

@Injectable()
export class ElasticService {
  private client: Client;

  constructor() {
    if (
      !process.env.ELASTICSEARCH_CLOUD_ID ||
      !process.env.ELASTICSEARCH_USERNAME ||
      !process.env.ELASTICSEARCH_PASSWORD
    ) {
      throw new Error(
        'Elasticsearch credentials are missing in environment variables',
      );
    }

    this.client = new Client({
      cloud: process.env.ELASTICSEARCH_CLOUD_ID
        ? { id: process.env.ELASTICSEARCH_CLOUD_ID }
        : undefined,
      node: process.env.ELASTICSEARCH_URL,
      auth: {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD,
      },
    });
  }

  /** Ensure the 'jobs' index exists with proper mapping */
  async createIndexIfNotExists(): Promise<void> {
    const exists = await this.client.indices.exists({ index: 'jobs' });
    if (!exists) {
      await this.client.indices.create({
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
    }
  }

  /** Search jobs with optional query, filters, sorting, pagination */
  async searchJobs(
    query?: string,
    filters: estypes.QueryDslQueryContainer[] = [],
    sort?: { [field: string]: 'asc' | 'desc' },
    from = 0,
    size = 10,
  ): Promise<{ data: JobDocument[]; total: number }> {
    const boolQuery: estypes.QueryDslQueryContainer = {
      bool: {
        must: query
          ? [
              {
                multi_match: {
                  query,
                  fields: ['title^2', 'company', 'location', 'industry'],
                },
              },
            ]
          : [{ match_all: {} }],
        filter: filters,
      },
    };

    const searchRequest: estypes.SearchRequest = {
      index: 'jobs',
      from,
      size,
      query: boolQuery,
      ...(sort ? { sort: [sort] } : {}),
    };

    // Explicitly type the result to fix TypeScript errors
    const result = (await this.client.search<JobDocument>(
      searchRequest,
    )) as estypes.SearchResponse<JobDocument>;

    const jobs: JobDocument[] = result.hits.hits.map((hit) => {
      const source = hit._source!;
      const mappedSkills: JobSkill[] = (source.skills || [])
        .filter((skill) => skill?.name)
        .map((skill) => ({
          skillId: Number.isInteger(skill.skillId) ? skill.skillId : 0,
          name: skill.name!,
        }));

      return {
        id: Number.isInteger(source.id) ? source.id : Number(hit._id) || 0,
        title: source.title,
        company: source.company,
        location: source.location,
        experienceLevel: source.experienceLevel,
        salary: source.salary,
        industry: source.industry,
        skills: mappedSkills,
      };
    });

    return {
      data: jobs,
      total:
        typeof result.hits.total === 'number'
          ? result.hits.total
          : (result.hits.total as estypes.SearchTotalHits).value,
    };
  }

  /** Index a single job document */
  async indexJob(job: JobDocument): Promise<void> {
    const { id, ...body } = job;
    await this.client.index({
      index: 'jobs',
      id: id.toString(),
      body,
    });
    await this.client.indices.refresh({ index: 'jobs' });
  }

  /** Delete a job by ID */
  async deleteJob(id: number): Promise<void> {
    await this.client.delete({
      index: 'jobs',
      id: id.toString(),
    });
  }
}
