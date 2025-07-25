import { users, jobs, pipelines, jobSteps, csvData, type User, type UpsertUser, type InsertUser, type Job, type InsertJob, type Pipeline, type InsertPipeline, type JobStep, type InsertJobStep, type CsvData, type InsertCsvData, type JobStatus } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;

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

  // CSV Data
  getJobCsvData(jobId: string): Promise<CsvData[]>;
  getCsvDataByRow(jobId: string, rowIndex: number): Promise<CsvData | undefined>;
  createCsvData(data: InsertCsvData): Promise<CsvData>;
  updateCsvData(id: string, updates: Partial<CsvData>): Promise<CsvData>;

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
    // For Replit Auth, we don't use googleId anymore
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
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
}

export const storage = new DatabaseStorage();
