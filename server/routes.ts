import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { fileUploadService } from "./services/fileUpload";
import { jobProcessor } from "./services/jobProcessor";
import { openaiService } from "./services/openai";
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

  // Broadcast to user's connections
  const broadcastToUser = (userId: string, data: any) => {
    const connections = userConnections.get(userId);
    if (connections) {
      const message = JSON.stringify(data);
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  };

  // Job processor event listeners
  jobProcessor.on('jobStarted', ({ jobId, job }) => {
    broadcastToUser(job.userId, {
      type: 'JOB_STARTED',
      payload: { jobId, job }
    });
  });

  jobProcessor.on('rowProcessed', ({ jobId, rowIndex, progress, totalRows }) => {
    storage.getJob(jobId).then(job => {
      if (job) {
        broadcastToUser(job.userId, {
          type: 'JOB_PROGRESS',
          payload: { jobId, rowIndex, progress, totalRows }
        });
      }
    });
  });

  jobProcessor.on('jobCompleted', ({ jobId }) => {
    storage.getJob(jobId).then(job => {
      if (job) {
        broadcastToUser(job.userId, {
          type: 'JOB_COMPLETED',
          payload: { jobId }
        });
      }
    });
  });

  jobProcessor.on('jobPaused', ({ jobId }) => {
    storage.getJob(jobId).then(job => {
      if (job) {
        broadcastToUser(job.userId, {
          type: 'JOB_PAUSED',
          payload: { jobId }
        });
      }
    });
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

  app.post('/api/jobs', isAuthenticated, fileUploadService.getMulterConfig().single('csvFile'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const userId = req.user.id;
      const validation = await fileUploadService.validateCSV(req.file.path);
      if (!validation.isValid) {
        await fileUploadService.deleteFile(req.file.path);
        return res.status(400).json({ message: 'Invalid CSV', errors: validation.errors });
      }

      const jobData = insertJobSchema.parse({
        userId: userId,
        name: req.body.name || req.file.originalname,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        filePath: req.file.path,
        totalRows: validation.rowCount,
        pipelineId: req.body.pipelineId,
        status: 'not_started'
      });

      const job = await storage.createJob(jobData);

      // Parse and store CSV data
      const csvRows = await fileUploadService.parseCSVToArray(req.file.path);
      for (let i = 0; i < csvRows.length; i++) {
        await storage.createCsvData({
          jobId: job.id,
          rowIndex: i,
          originalData: csvRows[i]
        });
      }

      res.json({ job, validation });
    } catch (error) {
      console.error('Job creation failed:', error);
      
      if (req.file) {
        await fileUploadService.deleteFile(req.file.path);
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
      res.json({ message: 'Job started' });
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

  app.post('/api/jobs/:id/resume', isAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job || job.userId !== req.user.id) {
        return res.status(404).json({ message: 'Job not found' });
      }

      await jobProcessor.resumeJob(job.id);
      res.json({ message: 'Job resumed' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to resume job' });
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
      res.json(csvData);
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
      const exportData = csvData.map(row => ({
        ...(row.originalData || {}),
        ...(row.enrichedData || {})
      }));

      const exportPath = await fileUploadService.generateCSVExport(exportData, job.fileName);
      res.download(exportPath);
    } catch (error) {
      res.status(500).json({ message: 'Failed to export CSV' });
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

  return httpServer;
}
