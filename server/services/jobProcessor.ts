import { EventEmitter } from 'events';
import { storage } from '../storage';
import { openaiService, type AgentConfig } from './openai';
import { type Job, type JobStatus, type Pipeline } from '@shared/schema';

export interface JobProcessor extends EventEmitter {
  startJob(jobId: string): Promise<void>;
  pauseJob(jobId: string): Promise<void>;
  resumeJob(jobId: string): Promise<void>;
  cancelJob(jobId: string): Promise<void>;
}

class JobProcessorService extends EventEmitter implements JobProcessor {
  private activeJobs = new Map<string, boolean>();
  private pausedJobs = new Set<string>();

  async startJob(jobId: string): Promise<void> {
    if (this.activeJobs.has(jobId)) {
      throw new Error('Job is already running');
    }

    const job = await storage.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (!job.pipelineId) {
      throw new Error('Job has no associated pipeline');
    }

    const pipeline = await storage.getPipeline(job.pipelineId);
    if (!pipeline) {
      throw new Error('Pipeline not found');
    }

    this.activeJobs.set(jobId, true);
    await storage.updateJob(jobId, { status: 'in_progress' });
    
    this.emit('jobStarted', { jobId, job });
    
    try {
      await this.processJob(job, pipeline);
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);
      await storage.updateJob(jobId, { 
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      this.emit('jobError', { jobId, error });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  async pauseJob(jobId: string): Promise<void> {
    this.pausedJobs.add(jobId);
    await storage.updateJob(jobId, { status: 'paused' });
    this.emit('jobPaused', { jobId });
  }

  async resumeJob(jobId: string): Promise<void> {
    this.pausedJobs.delete(jobId);
    await this.startJob(jobId);
  }

  async cancelJob(jobId: string): Promise<void> {
    this.activeJobs.delete(jobId);
    this.pausedJobs.delete(jobId);
    await storage.updateJob(jobId, { status: 'cancelled' });
    this.emit('jobCancelled', { jobId });
  }

  private async processJob(job: Job, pipeline: Pipeline): Promise<void> {
    const csvData = await storage.getJobCsvData(job.id);
    const steps = pipeline.steps as AgentConfig[];
    
    for (let rowIndex = job.processedRows; rowIndex < csvData.length; rowIndex++) {
      // Check if job is paused
      if (this.pausedJobs.has(job.id)) {
        await storage.updateJob(job.id, { 
          status: 'paused',
          processedRows: rowIndex,
          progress: Math.round((rowIndex / csvData.length) * 100)
        });
        return;
      }

      // Check if job is cancelled
      if (!this.activeJobs.has(job.id)) {
        return;
      }

      const rowData = csvData[rowIndex];
      await this.processRow(job.id, rowIndex, rowData, steps);
      
      // Update progress
      const progress = Math.round(((rowIndex + 1) / csvData.length) * 100);
      await storage.updateJob(job.id, { 
        processedRows: rowIndex + 1,
        progress
      });

      this.emit('rowProcessed', { 
        jobId: job.id, 
        rowIndex, 
        progress,
        totalRows: csvData.length
      });
    }

    // Job completed
    await storage.updateJob(job.id, { 
      status: 'completed',
      progress: 100,
      processedRows: csvData.length
    });
    
    this.emit('jobCompleted', { jobId: job.id });
  }

  private async processRow(
    jobId: string, 
    rowIndex: number, 
    rowData: any, 
    steps: AgentConfig[]
  ): Promise<void> {
    let currentData = { ...rowData.originalData };
    
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];
      
      // Create job step record
      const jobStep = await storage.createJobStep({
        jobId,
        rowIndex,
        stepIndex,
        stepName: step.name,
        status: 'running',
        inputData: currentData,
        model: step.model,
        prompt: `${step.systemPrompt}\n\n${step.userPrompt}`
      });

      try {
        const result = await openaiService.processWithAgent(step, currentData);
        
        if (result.error) {
          await storage.updateJobStep(jobStep.id, {
            status: 'error',
            errorMessage: result.error,
            latency: result.latency
          });
          throw new Error(`Step ${step.name} failed: ${result.error}`);
        }

        // Update current data with the result
        currentData[`${step.name}_result`] = result.output;
        
        await storage.updateJobStep(jobStep.id, {
          status: 'completed',
          outputData: { result: result.output },
          latency: result.latency,
          completedAt: new Date()
        });

        this.emit('stepCompleted', {
          jobId,
          rowIndex,
          stepIndex,
          stepName: step.name,
          result: result.output,
          latency: result.latency
        });

      } catch (error) {
        await storage.updateJobStep(jobStep.id, {
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    }

    // Update CSV data with enriched results
    await storage.updateCsvData(rowData.id, {
      enrichedData: currentData
    });
  }

  isJobActive(jobId: string): boolean {
    return this.activeJobs.has(jobId);
  }

  isJobPaused(jobId: string): boolean {
    return this.pausedJobs.has(jobId);
  }
}

export const jobProcessor = new JobProcessorService();
