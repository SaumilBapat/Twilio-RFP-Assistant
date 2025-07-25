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

  async reprocessJob(jobId: string): Promise<void> {
    // Stop job if it's currently running
    this.activeJobs.delete(jobId);
    this.pausedJobs.delete(jobId);

    // Reset job status and clear processed data
    await storage.updateJob(jobId, {
      status: 'not_started',
      processedRows: 0,
      progress: 0,
      errorMessage: null,
      updatedAt: new Date()
    });

    // Clear enriched data from all CSV rows (keep only original data)
    const csvData = await storage.getCsvData(jobId);
    for (const row of csvData) {
      await storage.updateCsvData(row.id, {
        enrichedData: null
      });
    }

    // Clear all job steps
    await storage.clearJobSteps(jobId);
    
    this.emit('jobReset', { jobId });
  }

  async resetJob(jobId: string): Promise<void> {
    const job = await storage.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }
    
    // Stop current processing if running
    this.activeJobs.delete(jobId);
    this.pausedJobs.delete(jobId);
    
    // Reset job status and clear processed data
    await storage.updateJob(jobId, {
      status: 'not_started',
      processedRows: 0,
      progress: 0,
      errorMessage: null,
      updatedAt: new Date()
    });

    // Clear enriched data from all CSV rows (keep only original data)
    const csvData = await storage.getCsvData(jobId);
    for (const row of csvData) {
      await storage.updateCsvData(row.id, {
        enrichedData: null
      });
    }

    // Clear all job steps
    await storage.clearJobSteps(jobId);
    
    console.log(`🔄 Job ${jobId} has been reset to start from scratch`);
    this.emit('jobReset', { jobId });
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
        progress,
        updatedAt: new Date()
      });

      console.log(`📊 Job ${job.id} progress: ${progress}% (${rowIndex + 1}/${csvData.length} rows)`);

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
    console.log(`🚀 Starting row ${rowIndex} processing with ${steps.length} steps`);
    
    // Get job info for RFP-specific data
    const job = await storage.getJob(jobId);
    let currentData = { ...rowData.originalData };
    
    // Add cross-question context if this question references previous ones
    const previousContext = await this.getPreviousQuestionContext(jobId, rowIndex, currentData);
    if (previousContext) {
      currentData['PREVIOUS_CONTEXT'] = previousContext;
      console.log(`🔗 Added context from ${previousContext.referencedQuestions.length} previous questions`);
    }
    
    // Add RFP-specific context for Step 3 processing
    if (job?.rfpInstructions) {
      currentData['RFP_INSTRUCTIONS'] = job.rfpInstructions;
    }
    
    if (job?.additionalDocuments && Array.isArray(job.additionalDocuments)) {
      currentData['ADDITIONAL_DOCUMENTS'] = await this.loadAdditionalDocuments(job.additionalDocuments);
    }
    
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];
      
      // Check if job was cancelled during processing
      if (!this.activeJobs.has(jobId)) {
        console.log(`🛑 Job ${jobId} was cancelled during row ${rowIndex} processing`);
        return;
      }
      
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
        console.log(`🔄 Processing step "${step.name}" for row ${rowIndex} - Starting...`);
        const startTime = Date.now();
        
        const result = await openaiService.processWithAgent(step, currentData);
        
        const duration = Date.now() - startTime;
        console.log(`✅ Completed step "${step.name}" for row ${rowIndex} in ${duration}ms - Result: ${result.output?.length || 0} chars`);
        
        if (result.error) {
          console.error(`❌ Step "${step.name}" failed for row ${rowIndex}:`, result.error);
          await storage.updateJobStep(jobStep.id, {
            status: 'error',
            errorMessage: result.error,
            latency: result.latency
          });
          throw new Error(`Step ${step.name} failed: ${result.error}`);
        }

        // Create a new column for this step's output
        currentData[step.name] = result.output;
        
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
    
    console.log(`🎯 Completed row ${rowIndex} processing - All ${steps.length} steps finished`);
  }

  isJobActive(jobId: string): boolean {
    return this.activeJobs.has(jobId);
  }

  isJobPaused(jobId: string): boolean {
    return this.pausedJobs.has(jobId);
  }

  private async getPreviousQuestionContext(jobId: string, currentRowIndex: number, currentData: any): Promise<any> {
    // Get the current question text to analyze for references
    const questionText = this.extractQuestionText(currentData);
    if (!questionText) return null;

    // Check if question contains references to previous questions
    const references = this.detectQuestionReferences(questionText, currentRowIndex);
    if (references.length === 0) return null;

    // Get previous processed rows with their answers
    const allCsvData = await storage.getJobCsvData(jobId);
    const referencedQuestions = [];

    for (const ref of references) {
      if (ref.rowIndex < currentRowIndex && ref.rowIndex < allCsvData.length) {
        const previousRow = allCsvData[ref.rowIndex];
        if (previousRow.enrichedData) {
          const enrichedData = typeof previousRow.enrichedData === 'string' 
            ? JSON.parse(previousRow.enrichedData) 
            : previousRow.enrichedData;
          
          referencedQuestions.push({
            questionNumber: ref.rowIndex + 1,
            question: this.extractQuestionText(previousRow.originalData),
            referenceResearch: enrichedData['Reference Research'] || '',
            genericDraft: enrichedData['Generic Draft Generation'] || '',
            tailoredResponse: enrichedData['Tailored RFP Response'] || '',
            referencedAs: ref.referenceText
          });
        }
      }
    }

    if (referencedQuestions.length === 0) return null;

    return {
      referencedQuestions,
      contextNote: `This question references previous questions: ${references.map(r => r.referenceText).join(', ')}`
    };
  }

  private extractQuestionText(data: any): string {
    // Try different possible field names for questions
    const possibleFields = [
      'QUESTION TITLE', 'Question', 'question', 'QUESTION', 
      'Question Title', 'RFP Question', 'Query'
    ];
    
    for (const field of possibleFields) {
      if (data[field] && typeof data[field] === 'string') {
        return data[field];
      }
    }
    
    // If no specific field found, return first text value
    const firstTextValue = Object.values(data).find(v => typeof v === 'string' && v.length > 10);
    return firstTextValue as string || '';
  }

  private detectQuestionReferences(questionText: string, currentRowIndex: number): Array<{rowIndex: number, referenceText: string}> {
    const references = [];
    const text = questionText.toLowerCase();

    // Pattern 1: Explicit question numbers (Q1, Q2, Question 1, etc.)
    const questionNumPattern = /(?:q|question)\s*(\d+)/gi;
    let match;
    while ((match = questionNumPattern.exec(text)) !== null) {
      const questionNum = parseInt(match[1]) - 1; // Convert to 0-based index
      if (questionNum >= 0 && questionNum < currentRowIndex) {
        references.push({
          rowIndex: questionNum,
          referenceText: match[0]
        });
      }
    }

    // Pattern 2: References to "previous", "above", "earlier"
    const implicitPatterns = [
      /(?:the\s+)?(?:previous|above|earlier|prior)\s+(?:question|response|answer|solution|implementation)/gi,
      /(?:as\s+)?(?:mentioned|described|outlined)\s+(?:above|previously|earlier)/gi,
      /(?:from\s+)?(?:the\s+)?(?:above|previous)\s+(?:question|response)/gi
    ];

    for (const pattern of implicitPatterns) {
      const matches = text.match(pattern);
      if (matches && currentRowIndex > 0) {
        // For implicit references, assume they refer to the immediately previous question
        references.push({
          rowIndex: currentRowIndex - 1,
          referenceText: matches[0]
        });
      }
    }

    // Pattern 3: Specific implementation/solution references (like "CCaaS implementation")
    const implementationPattern = /(\w+(?:\s+\w+)*)\s+(?:implementation|solution|approach|method)\s+(?:from\s+)?(?:q|question)\s*(\d+)/gi;
    while ((match = implementationPattern.exec(text)) !== null) {
      const questionNum = parseInt(match[2]) - 1;
      if (questionNum >= 0 && questionNum < currentRowIndex) {
        references.push({
          rowIndex: questionNum,
          referenceText: `${match[1]} implementation from Q${match[2]}`
        });
      }
    }

    // Remove duplicates
    const unique = references.filter((ref, index, self) => 
      index === self.findIndex(r => r.rowIndex === ref.rowIndex)
    );

    return unique;
  }

  private async loadAdditionalDocuments(additionalDocuments: any[]): Promise<Array<{fileName: string, content: string}>> {
    const fs = await import('fs/promises');
    const loadedDocs = [];
    
    for (const doc of additionalDocuments) {
      try {
        // For now, we'll read text files only. In a production system,
        // you'd want to add proper document parsing (PDF, DOC, etc.)
        let content = '';
        
        if (doc.fileName.endsWith('.txt') || doc.fileName.endsWith('.md')) {
          content = await fs.readFile(doc.filePath, 'utf-8');
        } else {
          content = `[Document: ${doc.fileName} - Content parsing not implemented for this file type]`;
        }
        
        loadedDocs.push({
          fileName: doc.fileName,
          content: content.substring(0, 5000) // Limit content size
        });
      } catch (error) {
        console.error(`Failed to load document ${doc.fileName}:`, error);
        loadedDocs.push({
          fileName: doc.fileName,
          content: `[Error loading document: ${doc.fileName}]`
        });
      }
    }
    
    return loadedDocs;
  }
}

export const jobProcessor = new JobProcessorService();
