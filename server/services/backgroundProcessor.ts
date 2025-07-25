import { storage } from '../storage';
import { enhancedEmbeddingsService } from './enhancedEmbeddings';
import { documentProcessor } from './documentProcessor';
import { webScraperService } from './webScraper';
import { contentChunkerService } from './contentChunker';

export interface ProcessingQueueItem {
  id: string;
  type: 'url' | 'document';
  url?: string;
  documentId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  payloadSize?: number;
  estimatedChunks?: number;
  actualChunks?: number;
  errorMessage?: string;
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export class BackgroundProcessor {
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.startProcessing();
  }

  /**
   * Start the background processing loop
   */
  startProcessing() {
    if (this.processingInterval) return;
    
    console.log('🚀 Background processor started');
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop the background processing loop  
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('⏹️ Background processor stopped');
    }
  }

  /**
   * Add URL to processing queue with payload size estimation
   */
  async queueUrl(url: string): Promise<ProcessingQueueItem> {
    // Estimate payload size by fetching headers
    let payloadSize = 0;
    let estimatedChunks = 1;
    
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          payloadSize = parseInt(contentLength);
          // Rough estimation: 1 chunk per 3KB of content
          estimatedChunks = Math.max(1, Math.ceil(payloadSize / 3000));
        }
      }
    } catch (error) {
      console.warn(`Failed to estimate payload size for ${url}:`, error);
    }

    const queueItem = await storage.addToProcessingQueue({
      type: 'url',
      url,
      status: 'pending',
      payloadSize,
      estimatedChunks,
      priority: 1
    });

    console.log(`📋 Queued URL: ${url} (${payloadSize} bytes, ~${estimatedChunks} chunks)`);
    return queueItem;
  }

  /**
   * Add document to processing queue with payload size from file
   */
  async queueDocument(documentId: string, fileSize: number): Promise<ProcessingQueueItem> {
    // Estimate chunks based on file size
    const estimatedChunks = Math.max(1, Math.ceil(fileSize / 3000));

    const queueItem = await storage.addToProcessingQueue({
      type: 'document',
      documentId,
      status: 'pending', 
      payloadSize: fileSize,
      estimatedChunks,
      priority: 1
    });

    console.log(`📋 Queued document: ${documentId} (${fileSize} bytes, ~${estimatedChunks} chunks)`);
    return queueItem;
  }

  /**
   * Main processing loop - processes one item at a time
   */
  private async processQueue() {
    if (this.isProcessing) return;

    try {
      this.isProcessing = true;
      
      // Get next pending item
      const nextItem = await storage.getNextProcessingQueueItem();
      if (!nextItem) return;

      console.log(`🔄 Processing ${nextItem.type}: ${nextItem.url || nextItem.documentId}`);
      
      // Mark as processing
      await storage.updateProcessingQueueStatus(nextItem.id, 'processing', {
        startedAt: new Date()
      });

      // Broadcast processing start
      this.broadcastUpdate(nextItem, 'processing');

      let actualChunks = 0;
      let errorMessage: string | undefined;

      try {
        if (nextItem.type === 'url' && nextItem.url) {
          actualChunks = await this.processUrl(nextItem.url);
        } else if (nextItem.type === 'document' && nextItem.documentId) {
          actualChunks = await this.processDocument(nextItem.documentId);
        }

        // Mark as completed
        await storage.updateProcessingQueueStatus(nextItem.id, 'completed', {
          actualChunks,
          completedAt: new Date()
        });

        console.log(`✅ Completed ${nextItem.type}: ${actualChunks} chunks created`);
        this.broadcastUpdate({ ...nextItem, actualChunks }, 'completed');

      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Processing failed';
        console.error(`❌ Failed to process ${nextItem.type}:`, error);
        
        // Mark as failed
        await storage.updateProcessingQueueStatus(nextItem.id, 'failed', {
          errorMessage,
          completedAt: new Date()
        });

        this.broadcastUpdate({ ...nextItem, errorMessage }, 'failed');
      }

    } catch (error) {
      console.error('Processing queue error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single URL
   */
  private async processUrl(url: string): Promise<number> {
    // Check if already processed (not placeholder)
    const existingChunks = await storage.getReferenceChunksByUrl(url);
    const hasRealContent = existingChunks.some(chunk => 
      chunk.chunkText !== 'URL queued for processing' && 
      chunk.contentHash !== 'pending'
    );
    
    if (hasRealContent) {
      return existingChunks.length;
    }

    // Remove any placeholder entries
    if (existingChunks.length > 0) {
      await storage.deleteUrlFromCache(url);
    }

    // Process the URL
    const processedUrls = await enhancedEmbeddingsService.processUrls([url]);
    if (processedUrls.length === 0) {
      throw new Error('Failed to process URL - no content retrieved');
    }

    // Get final chunk count
    const finalChunks = await storage.getReferenceChunksByUrl(url);
    return finalChunks.length;
  }

  /**
   * Process a single document
   */
  private async processDocument(documentId: string): Promise<number> {
    // Check if already processed
    const existingChunks = await storage.getReferenceChunksByDocumentId(documentId);
    if (existingChunks.length > 0) {
      return existingChunks.length;
    }

    // Mark document as processing
    await storage.updateReferenceDocument(documentId, { 
      cachingStatus: 'processing' 
    });
    
    // For now, mark as completed (document processing logic to be implemented)
    await storage.updateReferenceDocument(documentId, { 
      cachingStatus: 'completed',
      totalChunks: 1
    });
    
    return 1; // Placeholder chunk count
  }

  /**
   * Broadcast processing updates via WebSocket
   */
  private broadcastUpdate(item: Partial<ProcessingQueueItem>, status: string) {
    const broadcastJobUpdate = (global as any).broadcastJobUpdate;
    if (broadcastJobUpdate) {
      broadcastJobUpdate('processing_queue', {
        event: 'processing_status',
        data: {
          ...item,
          status,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Get processing queue status
   */
  async getQueueStatus(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    return await storage.getProcessingQueueStats();
  }
}

export const backgroundProcessor = new BackgroundProcessor();