import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const jobStatusEnum = pgEnum("job_status", ["not_started", "in_progress", "paused", "completed", "error", "cancelled"]);
export const stepStatusEnum = pgEnum("step_status", ["pending", "running", "completed", "error"]);

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Google OAuth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  googleId: text("google_id").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  filePath: text("file_path").notNull(),
  status: jobStatusEnum("status").notNull().default("not_started"),
  totalRows: integer("total_rows").notNull(),
  processedRows: integer("processed_rows").notNull().default(0),
  pipelineId: varchar("pipeline_id").references(() => pipelines.id),
  progress: integer("progress").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pipelines = pgTable("pipelines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  steps: jsonb("steps").notNull(), // Array of step configurations
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobSteps = pgTable("job_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id),
  rowIndex: integer("row_index").notNull(),
  stepIndex: integer("step_index").notNull(),
  stepName: text("step_name").notNull(),
  status: stepStatusEnum("status").notNull().default("pending"),
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  prompt: text("prompt"),
  model: text("model"),
  latency: integer("latency"), // in milliseconds
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const csvData = pgTable("csv_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id),
  rowIndex: integer("row_index").notNull(),
  originalData: jsonb("original_data").notNull(),
  enrichedData: jsonb("enriched_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Cache table for reference research with embeddings for cosine similarity
export const referenceCache = pgTable("reference_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  questionEmbedding: text("question_embedding").notNull(), // Store as JSON string for now
  references: jsonb("references").notNull(), // Array of {url, title, description, status}
  validatedAt: timestamp("validated_at").notNull(), // Last link validation time
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_reference_cache_question").on(table.question)
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  user: one(users, {
    fields: [jobs.userId],
    references: [users.id],
  }),
  pipeline: one(pipelines, {
    fields: [jobs.pipelineId],
    references: [pipelines.id],
  }),
  steps: many(jobSteps),
  csvData: many(csvData),
}));

export const pipelinesRelations = relations(pipelines, ({ many }) => ({
  jobs: many(jobs),
}));

export const jobStepsRelations = relations(jobSteps, ({ one }) => ({
  job: one(jobs, {
    fields: [jobSteps.jobId],
    references: [jobs.id],
  }),
}));

export const csvDataRelations = relations(csvData, ({ one }) => ({
  job: one(jobs, {
    fields: [csvData.jobId],
    references: [jobs.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPipelineSchema = createInsertSchema(pipelines).omit({
  id: true,
  createdAt: true,
});

export const insertJobStepSchema = createInsertSchema(jobSteps).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertCsvDataSchema = createInsertSchema(csvData).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReferenceCacheSchema = createInsertSchema(referenceCache).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Pipeline = typeof pipelines.$inferSelect;
export type InsertPipeline = z.infer<typeof insertPipelineSchema>;
export type JobStep = typeof jobSteps.$inferSelect;
export type InsertJobStep = z.infer<typeof insertJobStepSchema>;
export type CsvData = typeof csvData.$inferSelect;
export type InsertCsvData = z.infer<typeof insertCsvDataSchema>;
export type ReferenceCache = typeof referenceCache.$inferSelect;
export type InsertReferenceCache = z.infer<typeof insertReferenceCacheSchema>;
export type JobStatus = "not_started" | "in_progress" | "paused" | "completed" | "error" | "cancelled";
export type StepStatus = "pending" | "running" | "completed" | "error";
