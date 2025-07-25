import { users, jobs, pipelines, jobSteps, csvData, referenceCache, responseCache, referenceDocuments, type User, type InsertUser, type Job, type InsertJob, type Pipeline, type InsertPipeline, type JobStep, type InsertJobStep, type CsvData, type InsertCsvData, type ReferenceCache, type InsertReferenceCache, type ResponseCache, type InsertResponseCache, type ReferenceDocument, type InsertReferenceDocument, type JobStatus } from "@shared/schema";
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

  // Reference Cache - Chunk-based storage
  getAllReferenceChunks(): Promise<ReferenceCache[]>;
  getReferenceChunksByUrl(url: string): Promise<ReferenceCache[]>;
  getReferenceChunksByHash(contentHash: string): Promise<ReferenceCache[]>;
  createReferenceCache(cache: InsertReferenceCache): Promise<ReferenceCache>;
  clearReferenceCache(): Promise<void>;

  // Response Cache
  getResponseCache(): Promise<ResponseCache[]>;
  findSimilarResponses(combinedEmbedding: number[], threshold?: number): Promise<ResponseCache[]>;
  createResponseCache(cache: InsertResponseCache): Promise<ResponseCache>;

  // Cache Management
  clearAllCache(): Promise<{deletedReferences: number; deletedResponses: number}>;

  // Reference Documents
  getReferenceDocument(id: string): Promise<ReferenceDocument | undefined>;
  getUserReferenceDocuments(userId: string): Promise<ReferenceDocument[]>;
  createReferenceDocument(document: InsertReferenceDocument): Promise<ReferenceDocument>;
  updateReferenceDocument(id: string, updates: Partial<ReferenceDocument>): Promise<ReferenceDocument>;
  deleteReferenceDocument(id: string): Promise<void>;
  getReferenceChunksByDocumentId(documentId: string): Promise<ReferenceCache[]>;

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

  // Reference Cache - Chunk-based storage
  async getAllReferenceChunks(): Promise<ReferenceCache[]> {
    return await db.select().from(referenceCache).orderBy(desc(referenceCache.createdAt));
  }

  async getReferenceChunksByUrl(url: string): Promise<ReferenceCache[]> {
    return await db.select().from(referenceCache)
      .where(eq(referenceCache.url, url))
      .orderBy(referenceCache.chunkIndex);
  }

  async getReferenceChunksByHash(contentHash: string): Promise<ReferenceCache[]> {
    return await db.select().from(referenceCache)
      .where(eq(referenceCache.contentHash, contentHash))
      .orderBy(referenceCache.chunkIndex);
  }

  async createReferenceCache(cache: InsertReferenceCache): Promise<ReferenceCache> {
    const [created] = await db.insert(referenceCache).values(cache).returning();
    return created;
  }

  async clearReferenceCache(): Promise<void> {
    await db.delete(referenceCache);
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

  // Cache Management
  async clearAllCache(): Promise<{deletedReferences: number; deletedResponses: number}> {
    // Count items before deletion
    const [refCount] = await db.select({ count: count() }).from(referenceCache);
    const [respCount] = await db.select({ count: count() }).from(responseCache);
    
    // Delete all cache entries
    await db.delete(referenceCache);
    await db.delete(responseCache);
    
    return {
      deletedReferences: refCount?.count || 0,
      deletedResponses: respCount?.count || 0
    };
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

  async getActiveJobs(): Promise<Job[]> {
    return await db.select().from(jobs).where(eq(jobs.status, 'in_progress'));
  }

  async getJobs(userId: string): Promise<Job[]> {
    return await db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.createdAt));
  }

  // Reference Documents implementation
  async getReferenceDocument(id: string): Promise<ReferenceDocument | undefined> {
    const [document] = await db.select().from(referenceDocuments).where(eq(referenceDocuments.id, id));
    return document;
  }

  async getUserReferenceDocuments(userId: string): Promise<ReferenceDocument[]> {
    return await db.select().from(referenceDocuments)
      .where(eq(referenceDocuments.userId, userId))
      .orderBy(desc(referenceDocuments.createdAt));
  }

  async createReferenceDocument(document: InsertReferenceDocument): Promise<ReferenceDocument> {
    const [created] = await db.insert(referenceDocuments).values(document).returning();
    return created;
  }

  async updateReferenceDocument(id: string, updates: Partial<ReferenceDocument>): Promise<ReferenceDocument> {
    const [updated] = await db.update(referenceDocuments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(referenceDocuments.id, id))
      .returning();
    return updated;
  }

  async deleteReferenceDocument(id: string): Promise<void> {
    await db.delete(referenceDocuments).where(eq(referenceDocuments.id, id));
  }

  async getReferenceChunksByDocumentId(documentId: string): Promise<ReferenceCache[]> {
    return await db.select().from(referenceCache)
      .where(eq(referenceCache.documentId, documentId));
  }

  async getReferenceDocumentByHash(fileHash: string): Promise<ReferenceDocument | undefined> {
    const [document] = await db.select().from(referenceDocuments)
      .where(eq(referenceDocuments.fileHash, fileHash));
    return document;
  }

  async deleteReferenceChunk(id: string): Promise<void> {
    await db.delete(referenceCache).where(eq(referenceCache.id, id));
  }
}

export const storage = new DatabaseStorage();
