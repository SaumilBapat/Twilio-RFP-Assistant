import { users, jobs, pipelines, jobSteps, csvData, referenceCache, responseCache, referenceDocuments, processingQueue, type User, type InsertUser, type Job, type InsertJob, type Pipeline, type InsertPipeline, type JobStep, type InsertJobStep, type CsvData, type InsertCsvData, type ReferenceCache, type InsertReferenceCache, type ResponseCache, type InsertResponseCache, type ReferenceDocument, type InsertReferenceDocument, type JobStatus } from "@shared/schema";
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
  updateCsvRowFeedback(jobId: string, rowIndex: number, feedback: string): Promise<void>;
  getRowsWithFeedback(jobId: string): Promise<CsvData[]>;

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

  // Reference URLs
  getCachedUrls(): Promise<{url: string; chunkCount: number; lastCached: Date}[]>;
  deleteUrlFromCache(url: string): Promise<void>;
  addUrlToCache(url: string): Promise<void>;

  // Statistics
  getUserJobStats(userId: string): Promise<{
    totalJobs: number;
    activeJobs: number;
    completedToday: number;
  }>;

  // Processing Queue
  addToProcessingQueue(item: {
    type: 'url' | 'document';
    url?: string;
    documentId?: string;
    status: string;
    payloadSize?: number;
    estimatedChunks?: number;
    priority: number;
  }): Promise<any>;
  getNextProcessingQueueItem(): Promise<any>;
  updateProcessingQueueStatus(id: string, status: string, updates: any): Promise<void>;
  getProcessingQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
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

  async updateCsvRowFeedback(jobId: string, rowIndex: number, feedback: string): Promise<void> {
    await db
      .update(csvData)
      .set({ 
        feedback, 
        needsReprocessing: true,
        updatedAt: new Date() 
      })
      .where(and(eq(csvData.jobId, jobId), eq(csvData.rowIndex, rowIndex)));
  }

  async getRowsWithFeedback(jobId: string): Promise<CsvData[]> {
    return db
      .select()
      .from(csvData)
      .where(and(eq(csvData.jobId, jobId), eq(csvData.needsReprocessing, true)));
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

  // Reference URLs implementation
  async getCachedUrls(): Promise<{url: string; chunkCount: number; lastCached: Date}[]> {
    const result = await db
      .select({
        url: referenceCache.url,
        chunkCount: count(referenceCache.id),
        lastCached: sql<Date>`MAX(${referenceCache.createdAt})`.as('last_cached')
      })
      .from(referenceCache)
      .where(sql`${referenceCache.url} IS NOT NULL`)
      .groupBy(referenceCache.url)
      .orderBy(desc(sql`MAX(${referenceCache.createdAt})`));
    
    return result.map(row => ({
      url: row.url!,
      chunkCount: row.chunkCount,
      lastCached: row.lastCached
    }));
  }

  async deleteUrlFromCache(url: string): Promise<void> {
    await db.delete(referenceCache).where(eq(referenceCache.url, url));
  }

  async addUrlToCache(url: string): Promise<void> {
    // Check if URL already has actual content (not just placeholder)
    const existingChunks = await this.getReferenceChunksByUrl(url);
    const hasRealContent = existingChunks.some(chunk => 
      chunk.chunkText !== 'URL queued for processing' && 
      chunk.contentHash !== 'pending'
    );
    
    if (!hasRealContent) {
      // Delete any existing placeholder entries first
      await db.delete(referenceCache).where(eq(referenceCache.url, url));
      
      // Create a placeholder entry to mark this URL for processing
      await db.insert(referenceCache).values({
        url,
        contentHash: 'pending',
        chunkIndex: 0,
        chunkText: 'URL queued for processing',
        chunkEmbedding: '[]',
        metadata: { status: 'pending' }
      });
    }
  }

  // Processing Queue Methods
  async addToProcessingQueue(item: {
    type: 'url' | 'document';
    url?: string;
    documentId?: string;
    status: string;
    payloadSize?: number;
    estimatedChunks?: number;
    priority: number;
  }): Promise<any> {
    const [queueItem] = await db
      .insert(processingQueue)
      .values(item)
      .returning();
    return queueItem;
  }

  async getNextProcessingQueueItem(): Promise<any> {
    const [item] = await db
      .select()
      .from(processingQueue)
      .where(eq(processingQueue.status, 'pending'))
      .orderBy(processingQueue.priority, processingQueue.createdAt)
      .limit(1);
    return item;
  }

  async updateProcessingQueueStatus(id: string, status: string, updates: any): Promise<void> {
    await db
      .update(processingQueue)
      .set({ status, ...updates })
      .where(eq(processingQueue.id, id));
  }

  async getProcessingQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const stats = await db
      .select({
        status: processingQueue.status,
        count: count()
      })
      .from(processingQueue)
      .groupBy(processingQueue.status);

    const result = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };

    stats.forEach(stat => {
      result[stat.status as keyof typeof result] = stat.count;
    });

    return result;
  }
}

export const storage = new DatabaseStorage();
