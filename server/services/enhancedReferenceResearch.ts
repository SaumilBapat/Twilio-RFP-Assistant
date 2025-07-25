import { enhancedEmbeddingsService } from './enhancedEmbeddings';

/**
 * Normalize URL by removing fragment identifier (everything after #)
 */
function normalizeUrl(url: string): string {
  const hashIndex = url.indexOf('#');
  return hashIndex !== -1 ? url.substring(0, hashIndex) : url;
}

export interface EnhancedReferenceResult {
  processedUrls: string[];
  relevantChunks: Array<{
    chunkText: string;
    url: string;
    similarity: number;
    metadata: any;
  }>;
}

/**
 * Enhanced reference research using semantic search and full content processing
 */
export async function performEnhancedReferenceResearch(
  contextualQuestion: string,
  jobId?: string
): Promise<{ urls: string[] }> {
  console.log(`🚀 Starting enhanced reference research for: ${contextualQuestion.substring(0, 100)}...`);
  
  // Use global broadcast function
  const broadcastJobUpdate = (global as any).broadcastJobUpdate;
  
  if (jobId && broadcastJobUpdate) {
    broadcastJobUpdate(jobId, {
      event: 'processing_log',
      data: {
        step: 'Reference Research',
        log: `🚀 Starting enhanced reference research for: "${contextualQuestion.substring(0, 100)}..."`
      }
    });
  }
  
  try {
    // Step 1: Search for relevant URLs
    const urls = await enhancedEmbeddingsService.searchRelevantUrls(contextualQuestion);
    
    if (urls.length === 0) {
      if (jobId && broadcastJobUpdate) {
        broadcastJobUpdate(jobId, {
          event: 'processing_log',
          data: {
            step: 'Reference Research',
            log: `⚠️  No URLs found for this question`
          }
        });
      }
      return { urls: [] };
    }
    
    // Normalize URLs to remove fragments and deduplicate
    const normalizedUrls = Array.from(new Set(urls.map(url => normalizeUrl(url))));
    
    if (jobId && broadcastJobUpdate) {
      broadcastJobUpdate(jobId, {
        event: 'processing_log',
        data: {
          step: 'Reference Research',
          log: `📋 Found ${urls.length} URLs, normalized to ${normalizedUrls.length} unique URLs (${urls.length - normalizedUrls.length} duplicates removed)`
        }
      });
    }
    
    console.log(`📋 Found ${urls.length} URLs, normalized to ${normalizedUrls.length} unique URLs for processing`);
    
    // Step 2: Process URLs (scrape, chunk, embed, store)
    const processedUrls = await enhancedEmbeddingsService.processUrls(normalizedUrls, jobId);
    
    const result = { processedUrls, relevantChunks: [] };
    
    console.log(`✅ Enhanced reference research completed: ${result.processedUrls.length} URLs processed`);
    
    if (jobId && broadcastJobUpdate) {
      broadcastJobUpdate(jobId, {
        event: 'processing_log',
        data: {
          step: 'Reference Research',
          log: `✅ Enhanced reference research completed: ${result.processedUrls.length} URLs processed`
        }
      });
    }
    
    // Return just the processed URLs for now - the semantic chunks are stored in the database
    // and will be retrieved during the Generic Draft Generation step
    return {
      urls: result.processedUrls
    };
    
  } catch (error) {
    console.error('❌ Enhanced reference research failed:', error);
    
    if (jobId && broadcastJobUpdate) {
      broadcastJobUpdate(jobId, {
        event: 'processing_log',
        data: {
          step: 'Reference Research',
          log: `❌ Enhanced reference research failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      });
    }
    
    // Fallback to empty result
    return {
      urls: []
    };
  }
}

/**
 * Get relevant content chunks for a question (used by subsequent pipeline steps)
 */
export async function getRelevantContentChunks(
  contextualQuestion: string,
  maxResults: number = 15
): Promise<Array<{
  text: string;
  url: string;
  similarity: number;
  source: string;
}>> {
  try {
    const results = await enhancedEmbeddingsService.semanticSearch(contextualQuestion, maxResults);
    
    return results.map(result => ({
      text: result.chunkText,
      url: result.url,
      similarity: result.similarity,
      source: result.metadata?.title || new URL(result.url).hostname
    }));
    
  } catch (error) {
    console.error('Failed to get relevant content chunks:', error);
    return [];
  }
}