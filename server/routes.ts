import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { fileUploadService } from "./services/fileUpload";
import { jobProcessor } from "./services/jobProcessor";
import { openaiService } from "./services/openai";
import { documentProcessor } from "./services/documentProcessor";
import { urlNormalizer } from "./services/urlNormalizer";
import { enhancedEmbeddingsService } from "./services/enhancedEmbeddings";
import { backgroundProcessor } from "./services/backgroundProcessor";
import multer from "multer";
import { insertJobSchema, insertPipelineSchema } from "@shared/schema";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  const httpServer = createServer(app);
  
  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Store active WebSocket connections by user
  const userConnections = new Map<string, Set<WebSocket>>();

  wss.on('connection', (ws, req) => {
    const userId = req.url?.split('userId=')[1];
    if (!userId) {
      ws.close();
      return;
    }

    if (!userConnections.has(userId)) {
      userConnections.set(userId, new Set());
    }
    userConnections.get(userId)!.add(ws);

    ws.on('close', () => {
      userConnections.get(userId)?.delete(ws);
      if (userConnections.get(userId)?.size === 0) {
        userConnections.delete(userId);
      }
    });
  });

  // Connect job processor events to WebSocket broadcasts
  const broadcastToUser = (userId: string, event: string, data: any) => {
    const connections = userConnections.get(userId);
    if (connections) {
      const message = JSON.stringify({ event, data });
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  };

  // Export function for broadcasting job processing logs
  (global as any).broadcastJobUpdate = async (jobId: string, message: { event: string; data: any }) => {
    const job = await storage.getJob(jobId);
    if (job) {
      broadcastToUser(job.userId, message.event, message.data);
    }
  };

  // Job processor event listeners
  jobProcessor.on('jobStarted', async ({ jobId, job }) => {
    broadcastToUser(job.userId, 'jobStarted', { jobId, job });
  });

  jobProcessor.on('rowProcessed', async ({ jobId, rowIndex, progress, totalRows }) => {
    const job = await storage.getJob(jobId);
    if (job) {
      broadcastToUser(job.userId, 'rowProcessed', { 
        jobId, 
        rowIndex, 
        progress, 
        totalRows,
        processedRows: job.processedRows 
      });
    }
  });

  jobProcessor.on('jobCompleted', async ({ jobId }) => {
    const job = await storage.getJob(jobId);
    if (job) {
      broadcastToUser(job.userId, 'jobCompleted', { jobId, job });
    }
  });

  jobProcessor.on('jobPaused', async ({ jobId }) => {
    const job = await storage.getJob(jobId);
    if (job) {
      broadcastToUser(job.userId, 'jobPaused', { jobId, job });
    }
  });

  jobProcessor.on('jobError', async ({ jobId, error }) => {
    const job = await storage.getJob(jobId);
    if (job) {
      broadcastToUser(job.userId, 'jobError', { jobId, job, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });



  // Health check route for deployment monitoring
  app.get('/api/health', (req, res) => {
    res.status(200).json({ 
      status: 'healthy', 
      message: 'RFP Assistant API is running',
      timestamp: new Date().toISOString()
    });
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      res.json(req.user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // User routes
  app.get('/api/user/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const stats = await storage.getUserJobStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get user stats' });
    }
  });

  // Job routes
  app.get('/api/jobs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const jobs = await storage.getUserJobs(userId);
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get jobs' });
    }
  });

  app.get('/api/jobs/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const job = await storage.getJob(req.params.id);
      if (!job || job.userId !== userId) {
        return res.status(404).json({ message: 'Job not found' });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get job' });
    }
  });

  app.post('/api/jobs', isAuthenticated, fileUploadService.getMulterConfig().fields([
    { name: 'csvFile', maxCount: 1 },
    { name: 'additionalDoc_0', maxCount: 1 },
    { name: 'additionalDoc_1', maxCount: 1 },
    { name: 'additionalDoc_2', maxCount: 1 },
    { name: 'additionalDoc_3', maxCount: 1 },
    { name: 'additionalDoc_4', maxCount: 1 }
  ]), async (req: any, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (!files.csvFile || !files.csvFile[0]) {
        return res.status(400).json({ message: 'No CSV file uploaded' });
      }

      const csvFile = files.csvFile[0];
      const userId = req.user.id;
      
      const validation = await fileUploadService.validateCSV(csvFile.path);
      if (!validation.isValid) {
        await fileUploadService.deleteFile(csvFile.path);
        return res.status(400).json({ message: 'Invalid CSV', errors: validation.errors });
      }

      // Process additional documents
      const additionalDocuments = [];
      for (let i = 0; i < 5; i++) {
        const fieldName = `additionalDoc_${i}`;
        if (files[fieldName] && files[fieldName][0]) {
          const file = files[fieldName][0];
          additionalDocuments.push({
            fileName: file.originalname,
            filePath: file.path,
            fileSize: file.size,
            uploadedAt: new Date().toISOString()
          });
        }
      }

      // Use default pipeline if none specified
      let pipelineId = req.body.pipelineId;
      if (!pipelineId) {
        const defaultPipelines = await storage.getDefaultPipelines();
        if (defaultPipelines.length === 0) {
          return res.status(400).json({ message: 'No default pipeline available' });
        }
        pipelineId = defaultPipelines[0].id;
      }

      const jobData = insertJobSchema.parse({
        userId: userId,
        name: req.body.name || csvFile.originalname,
        fileName: csvFile.originalname,
        fileSize: csvFile.size,
        filePath: csvFile.path,
        totalRows: validation.rowCount,
        pipelineId: pipelineId,
        status: 'not_started',
        // New RFP-specific fields
        rfpInstructions: req.body.rfpInstructions || null,
        additionalDocuments: additionalDocuments.length > 0 ? additionalDocuments : null
      });

      const job = await storage.createJob(jobData);

      // Parse and store CSV data
      const csvRows = await fileUploadService.parseCSVToArray(csvFile.path);
      for (let i = 0; i < csvRows.length; i++) {
        await storage.createCsvData({
          jobId: job.id,
          rowIndex: i,
          originalData: csvRows[i]
        });
      }

      console.log(`📄 Job created with ${additionalDocuments.length} additional documents and ${req.body.rfpInstructions ? 'custom' : 'no'} RFP instructions`);

      res.json({ job, validation, additionalDocuments: additionalDocuments.length });
    } catch (error) {
      console.error('Job creation failed:', error);
      
      // Clean up any uploaded files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files) {
        for (const fileArray of Object.values(files)) {
          for (const file of fileArray) {
            await fileUploadService.deleteFile(file.path);
          }
        }
      }
      
      res.status(500).json({ 
        message: 'Failed to create job',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/jobs/:id/start', isAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job || job.userId !== req.user.id) {
        return res.status(404).json({ message: 'Job not found' });
      }

      await jobProcessor.startJob(job.id);
      
      // Check final job status to determine appropriate message
      const updatedJob = await storage.getJob(job.id);
      if (!updatedJob) {
        return res.status(404).json({ message: 'Job not found after processing' });
      }
      
      const message = updatedJob.status === 'completed' 
        ? 'Job completed successfully' 
        : updatedJob.status === 'error'
        ? 'Job failed'
        : updatedJob.status === 'paused'
        ? 'Job paused'
        : 'Job started successfully';
        
      res.json({ message, status: updatedJob.status });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to start job' });
    }
  });

  app.post('/api/jobs/:id/pause', isAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job || job.userId !== req.user.id) {
        return res.status(404).json({ message: 'Job not found' });
      }

      await jobProcessor.pauseJob(job.id);
      res.json({ message: 'Job paused' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to pause job' });
    }
  });



  app.post('/api/jobs/:id/reprocess', isAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job || job.userId !== req.user.id) {
        return res.status(404).json({ message: 'Job not found' });
      }

      await jobProcessor.reprocessJob(job.id);
      res.json({ message: 'Job reset for reprocessing' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to reprocess job' });
    }
  });

  app.post('/api/jobs/:id/cancel', isAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job || job.userId !== req.user.id) {
        return res.status(404).json({ message: 'Job not found' });
      }

      await jobProcessor.cancelJob(job.id);
      res.json({ message: 'Job cancelled' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to cancel job' });
    }
  });

  app.delete('/api/jobs/:id', isAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job || job.userId !== req.user.id) {
        return res.status(404).json({ message: 'Job not found' });
      }

      // Delete the uploaded file
      if (job.filePath) {
        await fileUploadService.deleteFile(job.filePath);
      }

      // Delete job and all related data from database
      await storage.deleteJob(job.id);
      
      res.json({ message: 'Job deleted successfully' });
    } catch (error) {
      console.error('Failed to delete job:', error);
      res.status(500).json({ message: 'Failed to delete job' });
    }
  });

  app.get('/api/jobs/:id/csv-data', isAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job || job.userId !== req.user.id) {
        return res.status(404).json({ message: 'Job not found' });
      }

      const csvData = await storage.getJobCsvData(job.id);
      
      // Add FULL_CONTEXTUAL_QUESTION to originalData for proper column ordering
      const processedCsvData = csvData.map(row => ({
        ...row,
        originalData: {
          ...(row.originalData || {}),
          ...(row.fullContextualQuestion ? { FULL_CONTEXTUAL_QUESTION: row.fullContextualQuestion } : {})
        }
      }));
      
      res.json(processedCsvData);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get CSV data' });
    }
  });

  app.get('/api/jobs/:id/steps/:rowIndex', isAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job || job.userId !== req.user.id) {
        return res.status(404).json({ message: 'Job not found' });
      }

      const steps = await storage.getJobStepsByRow(job.id, parseInt(req.params.rowIndex));
      res.json(steps);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get job steps' });
    }
  });

  app.get('/api/jobs/:id/export', isAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job || job.userId !== req.user.id) {
        return res.status(404).json({ message: 'Job not found' });
      }

      const csvData = await storage.getJobCsvData(job.id);
      
      // Debug logging
      console.log('CSV Data structure:', {
        rowCount: csvData.length,
        firstRowOriginal: csvData[0]?.originalData ? Object.keys(csvData[0].originalData) : [],
        firstRowEnriched: csvData[0]?.enrichedData ? Object.keys(csvData[0].enrichedData) : []
      });
      
      // Filter columns to match grid view (keep FULL_CONTEXTUAL_QUESTION visible)
      const excludedColumns = ["RFP_INSTRUCTIONS", "ADDITIONAL_DOCUMENTS", "jobId"];
      
      const exportData = csvData.map(row => {
        const combinedData = {
          ...(row.originalData || {}),
          // Add the full contextual question from the database
          ...(row.fullContextualQuestion ? { FULL_CONTEXTUAL_QUESTION: row.fullContextualQuestion } : {}),
          ...(row.enrichedData || {})
        };
        
        // Filter out excluded columns
        const filteredData: Record<string, any> = {};
        Object.keys(combinedData).forEach(key => {
          if (!excludedColumns.includes(key)) {
            filteredData[key] = (combinedData as Record<string, any>)[key];
          }
        });
        
        return filteredData;
      });

      // Ensure proper column ordering: Question → Full Contextual Question → Other Original → Pipeline steps
      if (exportData.length > 0 && csvData.length > 0) {
        const firstRow = csvData[0];
        const originalColumns = Object.keys(firstRow.originalData || {}).filter(
          key => !excludedColumns.includes(key)
        );
        const enrichedColumns = Object.keys(firstRow.enrichedData || {}).filter(
          key => !excludedColumns.includes(key)
        );
        
        // Debug logging
        console.log('Column extraction:', { originalColumns, enrichedColumns });
        
        // Extract the original question column and FULL_CONTEXTUAL_QUESTION
        const questionColumn = originalColumns.find(col => col !== 'FULL_CONTEXTUAL_QUESTION');
        const contextualQuestionColumn = originalColumns.includes('FULL_CONTEXTUAL_QUESTION') ? 'FULL_CONTEXTUAL_QUESTION' : null;
        const otherOriginalColumns = originalColumns.filter(col => col !== questionColumn && col !== 'FULL_CONTEXTUAL_QUESTION');
        
        // Check if FULL_CONTEXTUAL_QUESTION might be in enrichedData
        const contextualQuestionInEnriched = enrichedColumns.includes('FULL_CONTEXTUAL_QUESTION') ? 'FULL_CONTEXTUAL_QUESTION' : null;
        
        // Pipeline order
        const pipelineOrder = ["Reference Research", "Generic Draft Generation", "Tailored RFP Response"];
        const orderedEnrichedColumns = pipelineOrder.filter(col => enrichedColumns.includes(col));
        const otherEnrichedColumns = enrichedColumns.filter(col => !pipelineOrder.includes(col) && col !== 'FULL_CONTEXTUAL_QUESTION');
        
        // Build final column order: Question → Full Contextual Question → Other Original → Pipeline Steps → Other Enriched
        const allColumns: string[] = [];
        if (questionColumn) allColumns.push(questionColumn);
        
        // Add Full Contextual Question as second column (from wherever it is)
        if (contextualQuestionColumn) {
          allColumns.push(contextualQuestionColumn);
        } else if (contextualQuestionInEnriched) {
          allColumns.push(contextualQuestionInEnriched);
        }
        
        allColumns.push(...otherOriginalColumns, ...orderedEnrichedColumns, ...otherEnrichedColumns);
        
        console.log('Final column order:', allColumns);
        
        // Reorder export data to match column order
        const reorderedExportData = exportData.map(row => {
          const orderedRow: Record<string, any> = {};
          allColumns.forEach(col => {
            if (row.hasOwnProperty(col)) {
              orderedRow[col] = row[col];
            }
          });
          return orderedRow;
        });
        
        const exportPath = await fileUploadService.generateCSVExport(reorderedExportData, job.fileName);
        res.download(exportPath);
      } else {
        const exportPath = await fileUploadService.generateCSVExport(exportData, job.fileName);
        res.download(exportPath);
      }
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ message: 'Failed to export CSV' });
    }
  });

  // Job action routes (start/pause/resume)
  app.post('/api/jobs/:id/start', isAuthenticated, async (req: any, res) => {
    try {
      await jobProcessor.startJob(req.params.id);
      res.json({ message: 'Job started successfully' });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to start job' });
    }
  });

  app.post('/api/jobs/:id/pause', isAuthenticated, async (req: any, res) => {
    try {
      await jobProcessor.pauseJob(req.params.id);
      res.json({ message: 'Job paused successfully' });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to pause job' });
    }
  });

  app.post('/api/jobs/:id/resume', isAuthenticated, async (req: any, res) => {
    try {
      await jobProcessor.resumeJob(req.params.id);
      res.json({ message: 'Job resumed successfully' });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to resume job' });
    }
  });

  app.post('/api/jobs/:id/reset', isAuthenticated, async (req: any, res) => {
    try {
      await jobProcessor.resetJob(req.params.id);
      res.json({ message: 'Job reset successfully' });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to reset job' });
    }
  });
  
  // Job status sync endpoint - forces UI to sync with actual job state
  app.post('/api/jobs/:id/sync', isAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job || job.userId !== req.user.id) {
        return res.status(404).json({ message: 'Job not found' });
      }

      // Check if job is actually running and sync status
      const isActuallyRunning = (jobProcessor as any).activeJobs.has(job.id);
      
      if (isActuallyRunning && job.status !== 'in_progress') {
        console.log(`🔄 Syncing job ${job.id} status: DB shows '${job.status}' but job is running`);
        await storage.updateJob(job.id, { status: 'in_progress' });
        const updatedJob = await storage.getJob(job.id);
        broadcastToUser(job.userId, 'jobStarted', { jobId: job.id, job: updatedJob });
        res.json({ message: 'Job status synced - now showing as in_progress', synced: true });
      } else if (!isActuallyRunning && job.status === 'in_progress') {
        await storage.updateJob(job.id, { status: 'paused' });
        broadcastToUser(job.userId, 'jobPaused', { jobId: job.id });
        res.json({ message: 'Job status synced - now showing as paused', synced: true });
      } else {
        res.json({ message: 'Job status already in sync', synced: false });
      }
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to sync job status' });
    }
  });

  // Pipeline routes
  app.get('/api/pipelines', async (req, res) => {
    try {
      const pipelines = await storage.getAllPipelines();
      res.json(pipelines);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get pipelines' });
    }
  });

  // Get default pipeline
  app.get('/api/pipelines/default', async (req, res) => {
    try {
      const pipelines = await storage.getAllPipelines();
      const defaultPipeline = pipelines.find(p => p.isDefault);
      
      if (!defaultPipeline) {
        return res.status(404).json({ error: 'Default pipeline not found' });
      }
      
      res.json(defaultPipeline);
    } catch (error) {
      console.error('Failed to fetch default pipeline:', error);
      res.status(500).json({ error: 'Failed to fetch default pipeline' });
    }
  });

  // Update pipeline
  app.put('/api/pipelines/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { name, steps } = req.body;
      
      const updatedPipeline = await storage.updatePipeline(id, {
        name,
        steps
      });
      
      res.json(updatedPipeline);
    } catch (error) {
      console.error('Failed to update pipeline:', error);
      res.status(500).json({ error: 'Failed to update pipeline' });
    }
  });

  app.post('/api/pipelines', isAuthenticated, async (req: any, res) => {
    try {
      const pipelineData = insertPipelineSchema.parse(req.body);
      const pipeline = await storage.createPipeline(pipelineData);
      res.json(pipeline);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid pipeline data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create pipeline' });
    }
  });

  // OpenAI routes
  app.get('/api/openai/models', async (req, res) => {
    try {
      const models = await openaiService.getAvailableModels();
      res.json(models);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get OpenAI models' });
    }
  });

  // Cache management routes
  app.delete('/api/cache/clear', isAuthenticated, async (req: any, res) => {
    try {
      const result = await storage.clearAllCache();
      res.json({ 
        message: 'Cache cleared successfully',
        deletedReferences: result.deletedReferences,
        deletedResponses: result.deletedResponses
      });
    } catch (error) {
      console.error('Failed to clear cache:', error);
      res.status(500).json({ message: 'Failed to clear cache' });
    }
  });

  // Reference document management routes
  const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel.sheet.macroEnabled.12', // .xlsm
        'text/csv',
        'text/plain'
      ];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only PDF, Word documents, Excel files (.xlsx, .xlsm), CSV, and text files are allowed.'));
      }
    }
  });

  // Upload reference document
  app.post('/api/reference-documents', isAuthenticated, documentUpload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || 'admin-user';
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file provided' });
      }

      // Create document record and start processing
      const document = await documentProcessor.uploadDocument({
        userId,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        fileBuffer: req.file.buffer
      });

      res.json(document);
    } catch (error) {
      console.error('Failed to upload document:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Failed to upload document'
      });
    }
  });

  // Get all reference documents for user
  app.get('/api/reference-documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || 'admin-user';
      const documents = await storage.getUserReferenceDocuments(userId);
      res.json(documents);
    } catch (error) {
      console.error('Failed to get reference documents:', error);
      res.status(500).json({ message: 'Failed to get reference documents' });
    }
  });

  // Delete reference document
  app.delete('/api/reference-documents/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || 'admin-user';
      const { id } = req.params;
      
      // Verify document belongs to user
      const document = await storage.getReferenceDocument(id);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: 'Document not found' });
      }

      // Delete document and its embeddings
      await documentProcessor.deleteDocument(id);
      
      res.json({ message: 'Document deleted successfully' });
    } catch (error) {
      console.error('Failed to delete document:', error);
      res.status(500).json({ message: 'Failed to delete document' });
    }
  });

  // System Health endpoint  
  app.get('/api/system/health', async (req, res) => {
    try {
      const activeJobs = await storage.getActiveJobs();
      
      // Calculate worker utilization based on active jobs (assume 4 max workers)
      const workerUtilization = Math.min(activeJobs.length * 25, 100);
      
      // Simulate storage metrics (in a real system, this would check actual disk usage)
      const storageData = { used: 2.1, total: 100 };
      
      const healthData = {
        apiStatus: 'healthy' as const,
        workerUtilization,
        storageUsed: storageData.used,
        storageTotal: storageData.total,
        activeJobs: activeJobs.length,
        lastUpdated: new Date().toISOString()
      };
      
      res.json(healthData);
    } catch (error) {
      console.error('Failed to get system health:', error);
      res.status(500).json({ 
        apiStatus: 'down',
        workerUtilization: 0,
        storageUsed: 0,
        storageTotal: 100,
        activeJobs: 0,
        lastUpdated: new Date().toISOString()
      });
    }
  });

  // Reference URLs management routes
  app.get('/api/reference-urls', isAuthenticated, async (req: any, res) => {
    try {
      const cachedUrls = await storage.getCachedUrls();
      res.json(cachedUrls);
    } catch (error) {
      console.error('Failed to get cached URLs:', error);
      res.status(500).json({ message: 'Failed to get cached URLs' });
    }
  });

  app.post('/api/reference-urls', isAuthenticated, async (req: any, res) => {
    try {
      const { url } = req.body;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: 'URL is required' });
      }
      
      // Validate and normalize the URL
      if (!urlNormalizer.isValid(url)) {
        return res.status(400).json({ message: 'Invalid URL format' });
      }
      
      const normalizedUrl = urlNormalizer.normalize(url);
      
      // Check if URL is from Twilio ecosystem
      if (!urlNormalizer.isTwilioEcosystem(normalizedUrl)) {
        return res.status(400).json({ 
          message: 'Only Twilio ecosystem URLs (twilio.com, sendgrid.com, segment.com) are allowed' 
        });
      }
      
      // Check if URL already has real content
      const existingChunks = await storage.getReferenceChunksByUrl(normalizedUrl);
      const hasRealContent = existingChunks.some(chunk => 
        chunk.chunkText !== 'URL queued for processing' && 
        chunk.contentHash !== 'pending'
      );
      
      if (hasRealContent) {
        return res.json({ 
          message: 'URL already cached',
          url: normalizedUrl 
        });
      }
      
      // Queue URL for background processing (async)
      console.log(`📋 Queuing URL for background processing: ${normalizedUrl}`);
      const queueItem = await backgroundProcessor.queueUrl(normalizedUrl);
      
      res.json({ 
        message: 'URL queued for processing',
        url: normalizedUrl,
        queueId: queueItem.id,
        status: 'pending'
      });
    } catch (error) {
      console.error('Failed to add URL:', error);
      res.status(500).json({ message: 'Failed to add URL' });
    }
  });

  // Bulk URL upload endpoint
  app.post('/api/reference-urls/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const { urls } = req.body;
      
      if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ message: 'URLs array is required' });
      }
      
      const results = [];
      let queued = 0;
      let skipped = 0;
      let invalid = 0;
      
      for (const url of urls) {
        if (!url || typeof url !== 'string' || !url.trim()) {
          invalid++;
          continue;
        }
        
        const trimmedUrl = url.trim();
        
        // Validate and normalize the URL
        if (!urlNormalizer.isValid(trimmedUrl)) {
          results.push({ url: trimmedUrl, status: 'invalid', message: 'Invalid URL format' });
          invalid++;
          continue;
        }
        
        const normalizedUrl = urlNormalizer.normalize(trimmedUrl);
        
        // Check if URL is from Twilio ecosystem
        if (!urlNormalizer.isTwilioEcosystem(normalizedUrl)) {
          results.push({ 
            url: normalizedUrl, 
            status: 'invalid', 
            message: 'Only Twilio ecosystem URLs allowed' 
          });
          invalid++;
          continue;
        }
        
        // Check if URL already has real content
        const existingChunks = await storage.getReferenceChunksByUrl(normalizedUrl);
        const hasRealContent = existingChunks.some(chunk => 
          chunk.chunkText !== 'URL queued for processing' && 
          chunk.contentHash !== 'pending'
        );
        
        if (hasRealContent) {
          results.push({ 
            url: normalizedUrl, 
            status: 'skipped', 
            message: 'Already cached' 
          });
          skipped++;
          continue;
        }
        
        // Queue URL for background processing
        try {
          const queueItem = await backgroundProcessor.queueUrl(normalizedUrl);
          results.push({ 
            url: normalizedUrl, 
            status: 'queued', 
            queueId: queueItem.id 
          });
          queued++;
        } catch (error) {
          results.push({ 
            url: normalizedUrl, 
            status: 'error', 
            message: 'Failed to queue' 
          });
          invalid++;
        }
      }
      
      console.log(`📦 Bulk upload results: ${queued} queued, ${skipped} skipped, ${invalid} invalid`);
      
      res.json({ 
        message: `Bulk upload completed: ${queued} URLs queued for processing`,
        summary: { queued, skipped, invalid, total: urls.length },
        results
      });
    } catch (error) {
      console.error('Failed to process bulk URLs:', error);
      res.status(500).json({ message: 'Failed to process bulk URLs' });
    }
  });

  app.delete('/api/reference-urls/:encodedUrl', isAuthenticated, async (req: any, res) => {
    try {
      const url = decodeURIComponent(req.params.encodedUrl);
      
      if (!url) {
        return res.status(400).json({ message: 'URL is required' });
      }
      
      // Delete all chunks associated with this URL
      await storage.deleteUrlFromCache(url);
      
      res.json({ message: 'URL deleted successfully' });
    } catch (error) {
      console.error('Failed to delete URL:', error);
      res.status(500).json({ message: 'Failed to delete URL' });
    }
  });

  // Processing queue endpoints for background processing with payload preview
  app.get('/api/processing-queue/status', isAuthenticated, async (req, res) => {
    try {
      const stats = await backgroundProcessor.getQueueStatus();
      res.json(stats);
    } catch (error) {
      console.error('Error getting queue status:', error);
      res.status(500).json({ message: 'Failed to get queue status' });
    }
  });

  app.post('/api/processing-queue/url', isAuthenticated, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ message: 'URL is required' });
      }

      // Validate and normalize URL
      const validationResult = urlNormalizer.validateTwilioUrl(url);
      if (!validationResult.isValid) {
        return res.status(400).json({ message: validationResult.error });
      }

      const normalizedUrl = urlNormalizer.normalize(url);
      
      // Queue URL for background processing with payload size estimation
      const queueItem = await backgroundProcessor.queueUrl(normalizedUrl);
      
      res.json({ 
        message: 'URL queued for background processing', 
        url: normalizedUrl,
        payloadSize: queueItem.payloadSize || 0,
        estimatedChunks: queueItem.estimatedChunks || 1,
        queueId: queueItem.id,
        status: queueItem.status
      });
    } catch (error) {
      console.error('Error queuing URL:', error);
      res.status(500).json({ message: 'Failed to queue URL for processing' });
    }
  });

  return httpServer;
}
