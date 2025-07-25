import { users, jobs, pipelines, jobSteps, csvData, referenceCache, responseCache, type User, type InsertUser, type Job, type InsertJob, type Pipeline, type InsertPipeline, type JobStep, type InsertJobStep, type CsvData, type InsertCsvData, type ReferenceCache, type InsertReferenceCache, type ResponseCache, type InsertResponseCache, type JobStatus } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;


  // Jobs
  getJob(id: string): Promise<Job | undefined>;
  getUserJobs(userId: string): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, updates: Partial<Job>): Promise<Job>;
  deleteJob(id: string): Promise<void>;

  // Pipelines
  getPipeline(id: string): Promise<Pipeline | undefined>;
  getAllPipelines(): Promise<Pipeline[]>;
  getDefaultPipelines(): Promise<Pipeline[]>;
  createPipeline(pipeline: InsertPipeline): Promise<Pipeline>;

  // Job Steps
  getJobSteps(jobId: string): Promise<JobStep[]>;
  getJobStepsByRow(jobId: string, rowIndex: number): Promise<JobStep[]>;
  createJobStep(step: InsertJobStep): Promise<JobStep>;
  updateJobStep(id: string, updates: Partial<JobStep>): Promise<JobStep>;
  clearJobSteps(jobId: string): Promise<void>;

  // CSV Data
  getJobCsvData(jobId: string): Promise<CsvData[]>;
  getCsvData(jobId: string): Promise<CsvData[]>;
  getCsvDataByRow(jobId: string, rowIndex: number): Promise<CsvData | undefined>;
  createCsvData(data: InsertCsvData): Promise<CsvData>;
  updateCsvData(id: string, updates: Partial<CsvData>): Promise<CsvData>;

  // Reference Cache
  getReferenceCache(): Promise<ReferenceCache[]>;
  findSimilarReferences(questionEmbedding: number[], threshold?: number): Promise<ReferenceCache[]>;
  createReferenceCache(cache: InsertReferenceCache): Promise<ReferenceCache>;
  updateReferenceCacheValidation(id: string, validatedAt: Date): Promise<ReferenceCache>;

  // Response Cache
  getResponseCache(): Promise<ResponseCache[]>;
  findSimilarResponses(combinedEmbedding: number[], threshold?: number): Promise<ResponseCache[]>;
  createResponseCache(cache: InsertResponseCache): Promise<ResponseCache>;

  // Statistics
  getUserJobStats(userId: string): Promise<{
    totalJobs: number;
    activeJobs: number;
    completedToday: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }



  // Jobs
  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async getUserJobs(userId: string): Promise<Job[]> {
    return await db.select().from(jobs)
      .where(eq(jobs.userId, userId))
      .orderBy(desc(jobs.updatedAt));
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db.insert(jobs).values(insertJob).returning();
    return job;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    const [job] = await db.update(jobs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return job;
  }

  async deleteJob(id: string): Promise<void> {
    // Delete all related data first (foreign key constraints)
    await db.delete(jobSteps).where(eq(jobSteps.jobId, id));
    await db.delete(csvData).where(eq(csvData.jobId, id));
    await db.delete(jobs).where(eq(jobs.id, id));
  }

  // Pipelines
  async getPipeline(id: string): Promise<Pipeline | undefined> {
    const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.id, id));
    return pipeline || undefined;
  }

  async getAllPipelines(): Promise<Pipeline[]> {
    return await db.select().from(pipelines).orderBy(pipelines.name);
  }

  async getDefaultPipelines(): Promise<Pipeline[]> {
    return await db.select().from(pipelines).where(eq(pipelines.isDefault, true));
  }

  async createPipeline(insertPipeline: InsertPipeline): Promise<Pipeline> {
    const [pipeline] = await db.insert(pipelines).values(insertPipeline).returning();
    return pipeline;
  }

  async updatePipeline(id: string, updates: Partial<InsertPipeline>): Promise<Pipeline> {
    const [pipeline] = await db.update(pipelines)
      .set(updates)
      .where(eq(pipelines.id, id))
      .returning();
    return pipeline;
  }

  // Job Steps
  async getJobSteps(jobId: string): Promise<JobStep[]> {
    return await db.select().from(jobSteps)
      .where(eq(jobSteps.jobId, jobId))
      .orderBy(jobSteps.rowIndex, jobSteps.stepIndex);
  }

  async getJobStepsByRow(jobId: string, rowIndex: number): Promise<JobStep[]> {
    return await db.select().from(jobSteps)
      .where(and(eq(jobSteps.jobId, jobId), eq(jobSteps.rowIndex, rowIndex)))
      .orderBy(jobSteps.stepIndex);
  }

  async createJobStep(insertStep: InsertJobStep): Promise<JobStep> {
    const [step] = await db.insert(jobSteps).values(insertStep).returning();
    return step;
  }

  async updateJobStep(id: string, updates: Partial<JobStep>): Promise<JobStep> {
    const [step] = await db.update(jobSteps)
      .set(updates)
      .where(eq(jobSteps.id, id))
      .returning();
    return step;
  }

  // CSV Data
  async getJobCsvData(jobId: string): Promise<CsvData[]> {
    return await db.select().from(csvData)
      .where(eq(csvData.jobId, jobId))
      .orderBy(csvData.rowIndex);
  }

  async getCsvDataByRow(jobId: string, rowIndex: number): Promise<CsvData | undefined> {
    const [data] = await db.select().from(csvData)
      .where(and(eq(csvData.jobId, jobId), eq(csvData.rowIndex, rowIndex)));
    return data || undefined;
  }

  async createCsvData(insertData: InsertCsvData): Promise<CsvData> {
    const [data] = await db.insert(csvData).values(insertData).returning();
    return data;
  }

  async updateCsvData(id: string, updates: Partial<CsvData>): Promise<CsvData> {
    const [data] = await db.update(csvData)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(csvData.id, id))
      .returning();
    return data;
  }

  // Reference Cache
  async getReferenceCache(): Promise<ReferenceCache[]> {
    return await db.select().from(referenceCache).orderBy(desc(referenceCache.createdAt));
  }

  async findSimilarReferences(questionEmbedding: number[], threshold: number = 0.85): Promise<ReferenceCache[]> {
    // Since we don't have vector search in this setup, we'll fetch all and filter in memory
    // In production, you'd want to use pgvector extension for proper vector similarity search
    const allCache = await this.getReferenceCache();
    
    const embeddingsService = await import('./services/embeddings').then(m => m.embeddingsService);
    const similar: ReferenceCache[] = [];
    
    for (const cache of allCache) {
      const cachedEmbedding = JSON.parse(cache.questionEmbedding);
      const similarity = embeddingsService.cosineSimilarity(questionEmbedding, cachedEmbedding);
      
      if (similarity >= threshold) {
        similar.push(cache);
      }
    }
    
    return similar;
  }

  async createReferenceCache(cache: InsertReferenceCache): Promise<ReferenceCache> {
    const [created] = await db.insert(referenceCache).values(cache).returning();
    return created;
  }

  async updateReferenceCacheValidation(id: string, validatedAt: Date): Promise<ReferenceCache> {
    const [updated] = await db
      .update(referenceCache)
      .set({ validatedAt })
      .where(eq(referenceCache.id, id))
      .returning();
    return updated;
  }

  // Response Cache
  async getResponseCache(): Promise<ResponseCache[]> {
    return await db.select().from(responseCache).orderBy(desc(responseCache.createdAt));
  }

  async findSimilarResponses(combinedEmbedding: number[], threshold: number = 0.88): Promise<ResponseCache[]> {
    // Fetch all cached responses and filter by similarity in memory
    const allCache = await this.getResponseCache();
    
    const embeddingsService = await import('./services/embeddings').then(m => m.embeddingsService);
    const similar: ResponseCache[] = [];
    
    for (const cache of allCache) {
      const cachedEmbedding = JSON.parse(cache.combinedEmbedding);
      const similarity = embeddingsService.cosineSimilarity(combinedEmbedding, cachedEmbedding);
      
      if (similarity >= threshold) {
        similar.push(cache);
      }
    }
    
    return similar;
  }

  async createResponseCache(cache: InsertResponseCache): Promise<ResponseCache> {
    const [created] = await db.insert(responseCache).values(cache).returning();
    return created;
  }

  // Statistics
  async getUserJobStats(userId: string): Promise<{
    totalJobs: number;
    activeJobs: number;
    completedToday: number;
  }> {
    const totalJobs = await db.select({ count: count() })
      .from(jobs)
      .where(eq(jobs.userId, userId));

    const activeJobs = await db.select({ count: count() })
      .from(jobs)
      .where(and(
        eq(jobs.userId, userId),
        eq(jobs.status, "in_progress")
      ));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const completedToday = await db.select({ count: count() })
      .from(jobs)
      .where(and(
        eq(jobs.userId, userId),
        eq(jobs.status, "completed"),
        // @ts-ignore - Drizzle SQL date comparison
        sql`${jobs.updatedAt} >= ${today}`
      ));

    return {
      totalJobs: totalJobs[0]?.count || 0,
      activeJobs: activeJobs[0]?.count || 0,
      completedToday: completedToday[0]?.count || 0,
    };
  }

  async getCsvData(jobId: string): Promise<CsvData[]> {
    return await db.select().from(csvData).where(eq(csvData.jobId, jobId));
  }

  async clearJobSteps(jobId: string): Promise<void> {
    await db.delete(jobSteps).where(eq(jobSteps.jobId, jobId));
  }
}

export const storage = new DatabaseStorage();
