import { enhancedEmbeddingsService } from './enhancedEmbeddings';

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
  contextualQuestion: string
): Promise<{ urls: string[] }> {
  console.log(`🚀 Starting enhanced reference research for: ${contextualQuestion.substring(0, 100)}...`);
  
  try {
    // Use the enhanced embeddings service to perform the research
    const result = await enhancedEmbeddingsService.enhancedReferenceResearch(contextualQuestion);
    
    console.log(`✅ Enhanced reference research completed:
    - Processed URLs: ${result.processedUrls.length}
    - Relevant chunks found: ${result.relevantChunks.length}
    - Average similarity: ${result.relevantChunks.length > 0 ? 
      (result.relevantChunks.reduce((sum, chunk) => sum + chunk.similarity, 0) / result.relevantChunks.length).toFixed(3) : 'N/A'}`);
    
    // Return just the processed URLs for now - the semantic chunks are stored in the database
    // and will be retrieved during the Generic Draft Generation step
    return {
      urls: result.processedUrls
    };
    
  } catch (error) {
    console.error('❌ Enhanced reference research failed:', error);
    
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