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
      console.log(`⚠️  Job ${jobId} is already running, skipping start`);
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

    console.log(`🚀 Starting job ${jobId} with status: ${job.status}`);
    this.activeJobs.set(jobId, true);
    await storage.updateJob(jobId, { status: 'in_progress' });
    
    const updatedJob = await storage.getJob(jobId);
    this.emit('jobStarted', { jobId, job: updatedJob });
    
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
    const job = await storage.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    // If job is already running, just emit jobStarted to sync UI
    if (this.activeJobs.has(jobId)) {
      console.log(`🔄 Job ${jobId} is already running, syncing UI state`);
      await storage.updateJob(jobId, { status: 'in_progress' });
      this.emit('jobStarted', { jobId, job });
      return;
    }

    // Remove from paused jobs and active jobs to ensure clean state
    this.pausedJobs.delete(jobId);
    this.activeJobs.delete(jobId);
    
    // Now start the job fresh
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
    
    // Resolve question context using LLM to create full contextual question
    const fullContextualQuestion = await this.resolveQuestionContext(jobId, rowIndex, currentData);
    
    // Store the full contextual question in the database
    await storage.updateCsvData(rowData.id, {
      fullContextualQuestion
    });
    
    // Add it to the processing data - this will be used instead of the original question
    currentData['FULL_CONTEXTUAL_QUESTION'] = fullContextualQuestion;
    console.log(`🧠 Full contextual question: ${fullContextualQuestion.substring(0, 100)}...`);
    
    // Add jobId for detailed logging
    currentData['jobId'] = jobId;
    
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

  private async resolveQuestionContext(jobId: string, currentRowIndex: number, currentData: any): Promise<string> {
    // Import the context resolution service
    const { contextResolutionService } = await import('./contextResolution');
    
    // Get all CSV data for this job to build context
    const allCsvData = await storage.getJobCsvData(jobId);
    
    // Build array of all questions with their numbers
    const allQuestions = allCsvData.map((row, index) => ({
      questionNumber: index + 1,
      question: this.extractQuestionText(row.originalData)
    })).filter(q => q.question); // Filter out empty questions
    
    const currentQuestionNumber = currentRowIndex + 1;
    
    try {
      console.log(`🧠 Resolving context for question ${currentQuestionNumber} using LLM analysis`);
      
      // Get RFP instructions and additional documents
      const job = await storage.getJob(jobId);
      let additionalDocuments: Array<{fileName: string, content: string}> | undefined;
      
      if (job?.additionalDocuments && Array.isArray(job.additionalDocuments)) {
        additionalDocuments = await this.loadAdditionalDocuments(job.additionalDocuments);
      }

      const result = await contextResolutionService.resolveQuestionContext(
        allQuestions,
        currentQuestionNumber,
        job?.rfpInstructions || undefined,
        additionalDocuments
      );
      
      console.log(`🎯 Context resolution: ${result.hasReferences ? 'References detected' : 'No references'}`);
      if (result.hasReferences) {
        console.log(`📋 Referenced questions: ${result.referencedQuestions.join(', ')}`);
        console.log(`💭 Reasoning: ${result.reasoning}`);
      }
      
      console.log(`📋 RFP Context: Instructions=${job?.rfpInstructions ? 'Included' : 'None'}, Docs=${additionalDocuments?.length || 0}`);
      
      return result.fullContextualQuestion;
      
    } catch (error) {
      console.error(`❌ Context resolution failed for question ${currentQuestionNumber}:`, error);
      // Fallback to original question
      return this.extractQuestionText(currentData);
    }
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

  async startFeedbackReprocessing(jobId: string, rowsToReprocess: any[]): Promise<void> {
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

    console.log(`🔄 Starting feedback reprocessing for job ${jobId} with ${rowsToReprocess.length} rows`);
    this.activeJobs.set(jobId, true);
    await storage.updateJob(jobId, { status: 'in_progress' });
    
    const updatedJob = await storage.getJob(jobId);
    this.emit('jobStarted', { jobId, job: updatedJob });
    
    try {
      await this.processFeedbackRows(job, pipeline, rowsToReprocess);
    } catch (error) {
      console.error(`Feedback reprocessing ${jobId} failed:`, error);
      await storage.updateJob(jobId, { 
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      this.emit('jobError', { jobId, error });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  private async processFeedbackRows(job: any, pipeline: any, rowsToReprocess: any[]): Promise<void> {
    console.log(`🎯 Simplified feedback processing for ${rowsToReprocess.length} rows using o3 model`);
    
    for (const rowData of rowsToReprocess) {
      if (!this.activeJobs.has(job.id)) {
        console.log(`Job ${job.id} is no longer active, stopping feedback reprocessing`);
        return;
      }

      if (this.isPaused(job.id)) {
        console.log(`Job ${job.id} is paused, stopping feedback reprocessing`);
        return;
      }

      try {
        await this.processFeedbackRow(job, pipeline, rowData);
        
        // Mark row as no longer needing reprocessing
        await storage.updateCsvData(rowData.id, {
          needsReprocessing: false,
          reprocessedAt: new Date(),
          updatedAt: new Date()
        });

        console.log(`✅ Completed feedback reprocessing for row ${rowData.rowIndex}`);
      } catch (error) {
        console.error(`❌ Failed to reprocess row ${rowData.rowIndex}:`, error);
      }
    }

    // Update job status to completed
    await storage.updateJob(job.id, { 
      status: 'completed',
      updatedAt: new Date()
    });
    
    // Fetch updated job to emit with correct status
    const updatedJob = await storage.getJob(job.id);
    this.emit('jobCompleted', { jobId: job.id, job: updatedJob });
    console.log(`🎉 Feedback reprocessing completed for job ${job.id}`);
  }

  private async processFeedbackRow(job: any, pipeline: any, rowData: any): Promise<void> {
    const contextualQuestion = rowData.fullContextualQuestion;
    
    console.log(`🔄 Simplified feedback reprocessing for row ${rowData.rowIndex} using o3 model`);
    
    try {
      // Step 1: Find additional references based on feedback
      console.log(`🔍 Searching for additional references based on feedback: "${rowData.feedback}"`);
      const feedbackReferences = await this.findAdditionalReferences(contextualQuestion, rowData.feedback);
      
      // Step 2: Combine existing references with new ones
      const existingReferences = rowData.enrichedData?.['Reference Research'] || '';
      const combinedReferences = this.combineReferences(existingReferences, feedbackReferences);
      
      // Step 3: Reprocess only the final response with o3 model
      const finalResponseStep = pipeline.steps.find((s: any) => s.name === 'Tailored RFP Response');
      if (!finalResponseStep) {
        console.warn(`⚠️ Final response step not found in pipeline`);
        return;
      }

      const existingResponse = rowData.enrichedData?.['Tailored RFP Response'] || '';
      const genericDraft = rowData.enrichedData?.['Generic Draft Generation'] || '';
      
      // Use Generic Draft as fallback if final response is missing
      const baseResponse = existingResponse || genericDraft;
      
      // Enhanced prompt for o3 model with feedback context
      const enhancedPrompt = `${finalResponseStep.prompt}

CONTEXT FOR IMPROVEMENT:
- Original Question: ${contextualQuestion}
- User Feedback: ${rowData.feedback}
- Generic Draft: ${genericDraft}
- Current Final Response: ${existingResponse || 'Not yet generated'}
- Base Response to Improve: ${baseResponse}
- Updated References: ${combinedReferences}

Please improve the response based on the user feedback. Use the Generic Draft as foundation and incorporate any new relevant information from the updated reference list. Focus on addressing the specific feedback provided by the user.`;

      const feedbackStep = {
        ...finalResponseStep,
        model: 'o3-mini',
        prompt: enhancedPrompt
      };

      const improvedResponse = await this.processFeedbackStep(feedbackStep, contextualQuestion);
      
      // Update only the final response and reference list if processing succeeded
      if (improvedResponse && typeof improvedResponse === 'string' && improvedResponse.length > 0) {
        const currentEnrichedData = rowData.enrichedData || {};
        const updatedEnrichedData = {
          ...currentEnrichedData,
          'Reference Research': combinedReferences,
          'Tailored RFP Response': improvedResponse
        };
        
        console.log(`📝 Feedback processing result for row ${rowData.rowIndex}:`);
        console.log(`   - Additional references found: ${feedbackReferences ? 'Yes' : 'No'}`);
        console.log(`   - Base response used: ${baseResponse ? (existingResponse ? 'Existing final response' : 'Generic draft') : 'None available'}`);
        console.log(`   - Improved response length: ${typeof improvedResponse === 'string' ? improvedResponse.length : 0} characters`);

        await storage.updateCsvData(rowData.id, {
          enrichedData: updatedEnrichedData,
          needsReprocessing: false,
          updatedAt: new Date()
        });
        
        console.log(`✅ Simplified feedback reprocessing completed for row ${rowData.rowIndex}`);
      } else {
        console.warn(`⚠️ Failed to generate improved response for row ${rowData.rowIndex}, keeping existing response`);
        // Still mark as no longer needing reprocessing even if improvement failed
        await storage.updateCsvData(rowData.id, {
          needsReprocessing: false,
          updatedAt: new Date()
        });
      }
    } catch (error) {
      console.error(`❌ Error in feedback reprocessing for row ${rowData.rowIndex}:`, error);
      console.log(`🔒 Preserving existing response due to processing error`);
      // Mark as no longer needing reprocessing even if there was an error
      await storage.updateCsvData(rowData.id, {
        needsReprocessing: false,
        updatedAt: new Date()
      });
    }
  }

  private async findAdditionalReferences(question: string, feedback: string): Promise<string> {
    console.log(`🔍 Finding additional references for feedback: "${feedback}"`);
    
    try {
      // Use enhanced embeddings service to find relevant content based on feedback
      const { enhancedEmbeddingsService } = await import('./enhancedEmbeddings');
      
      // Create a search query combining the original question with feedback
      const searchQuery = `${question} ${feedback}`;
      const relevantChunks = await enhancedEmbeddingsService.semanticSearch(searchQuery, 5);
      
      if (relevantChunks.length === 0) {
        console.log(`📝 No additional references found for feedback`);
        return '';
      }

      // Extract unique URLs from relevant chunks
      const additionalUrls = Array.from(new Set(relevantChunks.map((chunk: any) => chunk.url)));
      console.log(`📚 Found ${additionalUrls.length} additional references based on feedback`);
      
      return JSON.stringify(additionalUrls);
    } catch (error) {
      console.error('Error finding additional references:', error);
      return '';
    }
  }

  private combineReferences(existingRefs: string, additionalRefs: string): string {
    if (!additionalRefs) return existingRefs;
    
    try {
      // Parse existing references
      let existingUrls: string[] = [];
      if (existingRefs) {
        try {
          existingUrls = JSON.parse(existingRefs);
        } catch {
          // If existing refs aren't JSON, try to extract URLs
          const urlMatches = existingRefs.match(/https?:\/\/[^\s",\]]+/g);
          existingUrls = urlMatches || [];
        }
      }

      // Parse additional references
      let additionalUrls: string[] = [];
      try {
        additionalUrls = JSON.parse(additionalRefs);
      } catch {
        const urlMatches = additionalRefs.match(/https?:\/\/[^\s",\]]+/g);
        additionalUrls = urlMatches || [];
      }

      // Combine and deduplicate
      const combinedUrls = Array.from(new Set([...existingUrls, ...additionalUrls]));
      console.log(`🔗 Combined references: ${existingUrls.length} existing + ${additionalUrls.length} new = ${combinedUrls.length} total`);
      
      return JSON.stringify(combinedUrls);
    } catch (error) {
      console.error('Error combining references:', error);
      return existingRefs;
    }
  }

  private isPaused(jobId: string): boolean {
    return this.pausedJobs.has(jobId);
  }

  /**
   * Process a single feedback step using OpenAI directly (simpler than full pipeline)
   */
  private async processFeedbackStep(step: any, contextualQuestion: string): Promise<string> {
    try {
      console.log(`🤖 Processing feedback step: ${step.name} with ${step.model}`);
      
      const openai = new (await import('openai')).default({ 
        apiKey: process.env.OPENAI_API_KEY 
      });

      const params: any = {
        model: step.model,
        messages: [
          {
            role: "system",
            content: step.prompt
          },
          {
            role: "user", 
            content: contextualQuestion
          }
        ]
      };

      // o3 models use max_completion_tokens instead of max_tokens and don't support temperature
      if (step.model.includes('o3')) {
        params.max_completion_tokens = step.maxTokens || 2000;
      } else {
        params.max_tokens = step.maxTokens || 2000;
        params.temperature = step.temperature || 0.7;
      }

      const response = await openai.chat.completions.create(params);

      const result = response.choices[0]?.message?.content || '';
      console.log(`✅ Feedback step completed: ${result.length} characters generated`);
      return result;
      
    } catch (error) {
      console.error(`❌ Error processing feedback step:`, error);
      return '';
    }
  }
}

export const jobProcessor = new JobProcessorService();
