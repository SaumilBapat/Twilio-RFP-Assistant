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
  // New RFP-specific fields
  rfpInstructions: text("rfp_instructions"), // Rich text instructions for this RFP
  additionalDocuments: jsonb("additional_documents"), // Array of {fileName, filePath, uploadedAt}
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
  fullContextualQuestion: text("full_contextual_question"), // LLM-generated contextual question
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Table for storing reference documents metadata
export const referenceDocuments = pgTable("reference_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // pdf, docx, doc, csv, txt
  fileSize: integer("file_size").notNull(), // in bytes
  fileHash: text("file_hash").notNull(), // SHA256 hash of file content
  cachingStatus: varchar("caching_status", { length: 20 }).notNull().default("pending"), // pending, processing, completed, error
  totalChunks: integer("total_chunks").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_reference_documents_user").on(table.userId),
  index("idx_reference_documents_hash").on(table.fileHash),
  index("idx_reference_documents_status").on(table.cachingStatus)
]);

// Cache table for chunk-based reference storage with embeddings for semantic search
export const referenceCache = pgTable("reference_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url"), // Nullable to support documents
  documentId: varchar("document_id").references(() => referenceDocuments.id), // Reference to document
  contentHash: text("content_hash").notNull(), // Hash of the full page content
  chunkIndex: integer("chunk_index").notNull(), // Index of this chunk in the page
  chunkText: text("chunk_text").notNull(), // The actual chunk content
  chunkEmbedding: text("chunk_embedding").notNull(), // JSON stringified embedding vector
  metadata: jsonb("metadata"), // Additional metadata like title, section, timestamp, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_reference_cache_url").on(table.url),
  index("idx_reference_cache_document").on(table.documentId),
  index("idx_reference_cache_hash").on(table.contentHash),
  index("idx_reference_cache_created").on(table.createdAt)
]);

// Cache table for final response generation with question + reference embeddings
export const responseCache = pgTable("response_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  referenceSummary: text("reference_summary").notNull(), // Summary of references used
  combinedEmbedding: text("combined_embedding").notNull(), // Embedding of question + reference summary
  response: text("response").notNull(), // The generated response
  metadata: jsonb("metadata"), // Model, tokens, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_response_cache_question").on(table.question),
  index("idx_response_cache_created").on(table.createdAt)
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  jobs: many(jobs),
  referenceDocuments: many(referenceDocuments),
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

export const referenceDocumentsRelations = relations(referenceDocuments, ({ one, many }) => ({
  user: one(users, {
    fields: [referenceDocuments.userId],
    references: [users.id],
  }),
  referenceChunks: many(referenceCache),
}));

export const referenceCacheRelations = relations(referenceCache, ({ one }) => ({
  document: one(referenceDocuments, {
    fields: [referenceCache.documentId],
    references: [referenceDocuments.id],
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

export const insertResponseCacheSchema = createInsertSchema(responseCache).omit({
  id: true,
  createdAt: true,
});

export const insertReferenceDocumentsSchema = createInsertSchema(referenceDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type ResponseCache = typeof responseCache.$inferSelect;
export type InsertResponseCache = z.infer<typeof insertResponseCacheSchema>;
export type ReferenceDocument = typeof referenceDocuments.$inferSelect;
export type InsertReferenceDocument = z.infer<typeof insertReferenceDocumentsSchema>;
export type JobStatus = "not_started" | "in_progress" | "paused" | "completed" | "error" | "cancelled";
export type StepStatus = "pending" | "running" | "completed" | "error";
export type CachingStatus = "pending" | "processing" | "completed" | "error";
