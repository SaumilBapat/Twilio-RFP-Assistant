import OpenAI from 'openai';
import { storage } from '../storage';
import { webScraperService } from './webScraper';
import { contentChunkerService } from './contentChunker';
import { urlNormalizer } from './urlNormalizer';
import type { InsertReferenceCache } from '@shared/schema';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface SemanticSearchResult {
  chunkText: string;
  url: string;
  similarity: number;
  metadata: any;
}

export class EnhancedEmbeddingsService {
  private readonly embeddingModel = 'text-embedding-3-small';
  private readonly similarityThreshold = 0.4; // Lowered to 0.4 to capture max similarity of 0.453

  /**
   * Generate embeddings for text content
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Truncate text if it's too long for OpenAI's token limit
      const estimatedTokens = Math.ceil(text.length / 4);
      let processedText = text;
      
      if (estimatedTokens > 8000) {
        // Truncate to approximately 8000 tokens (32000 characters)
        processedText = text.substring(0, 32000);
        console.log(`⚠️ Truncated text from ${estimatedTokens} to ~8000 tokens for embedding`);
      }
      
      const response = await openai.embeddings.create({
        model: this.embeddingModel,
        input: processedText,
        encoding_format: 'float'
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Search for URLs related to the contextual question using GPT-4o
   */
  async searchRelevantUrls(contextualQuestion: string): Promise<string[]> {
    console.log(`🔍 Searching for URLs related to: ${contextualQuestion.substring(0, 100)}...`);
    
    const systemPrompt = `You are a Twilio ecosystem URL discovery specialist. Find specific, working URLs from the Twilio ecosystem (twilio.com, sendgrid.com, segment.com) that would contain relevant information to answer this question.

CRITICAL: Return ONLY the URLs, one per line. No summaries, quotes, descriptions, or explanations - just URLs.`;

    const userPrompt = `Find relevant URLs from the Twilio ecosystem for this question:

"${contextualQuestion}"

Search across all three domains for specific, relevant URLs:
- twilio.com (docs, products, solutions, guides)
- sendgrid.com (docs, solutions, features)
- segment.com (docs, product, guides)

Return ONLY the URLs, one per line. No additional text or formatting.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      });

      const content = response.choices[0].message.content || '';
      const urls = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('http'))
        .filter(url => {
          const domain = new URL(url).hostname.replace('www.', '');
          return ['twilio.com', 'sendgrid.com', 'segment.com'].some(d => domain.includes(d));
        });

      console.log(`🎯 Found ${urls.length} potential URLs for processing`);
      return urls;
    } catch (error) {
      console.error('Failed to search for URLs:', error);
      return [];
    }
  }

  /**
   * Normalize URL using consistent formatting
   */
  private normalizeUrl(url: string): string {
    return urlNormalizer.normalize(url);
  }

  /**
   * Process URLs: scrape, chunk, embed, and store in cache
   */
  async processUrls(urls: string[], jobId?: string): Promise<string[]> {
    const processedUrls: string[] = [];
    
    // Use global broadcast function
    const broadcastJobUpdate = (global as any).broadcastJobUpdate;
    
    // Normalize URLs to remove fragments and remove duplicates
    const normalizedUrls = Array.from(new Set(urls.map(url => this.normalizeUrl(url))));
    
    for (const url of normalizedUrls) {
      try {
        if (jobId) {
          broadcastJobUpdate(jobId, {
            event: 'processing_log',
            data: {
              step: 'Reference Research',
              log: `🌐 Processing URL: ${url.length > 80 ? url.substring(0, 77) + '...' : url}`
            }
          });
        }
        
        console.log(`🌐 Processing URL: ${url}`);
        
        // Check if URL is valid and live
        const isValid = await webScraperService.isValidUrl(url);
        if (!isValid) {
          if (jobId) {
            broadcastJobUpdate(jobId, {
              event: 'processing_log',
              data: {
                step: 'Reference Research',
                log: `❌ URL not accessible: ${url.length > 60 ? url.substring(0, 57) + '...' : url}`
              }
            });
          }
          console.log(`❌ URL not valid or not accessible: ${url}`);
          continue;
        }

        // Check if we already have real content in cache (not just placeholders)
        const existingChunks = await storage.getReferenceChunksByUrl(url);
        const hasRealContent = existingChunks.some(chunk => 
          chunk.chunkText !== 'URL queued for processing' && 
          chunk.contentHash !== 'pending'
        );
        
        if (hasRealContent) {
          if (jobId) {
            broadcastJobUpdate(jobId, {
              event: 'processing_log',
              data: {
                step: 'Reference Research',
                log: `♻️ Using cached chunks: ${url.length > 50 ? url.substring(0, 47) + '...' : url} (${existingChunks.length} chunks)`
              }
            });
          }
          console.log(`♻️ URL already processed: ${url} (${existingChunks.length} chunks)`);
          processedUrls.push(url);
          continue;
        }

        // If we only have placeholder entries, remove them before processing
        if (existingChunks.length > 0) {
          if (jobId) {
            broadcastJobUpdate(jobId, {
              event: 'processing_log',
              data: {
                step: 'Reference Research',
                log: `🔄 Replacing placeholder entries for: ${url.length > 50 ? url.substring(0, 47) + '...' : url}`
              }
            });
          }
          await storage.deleteUrlFromCache(url);
        }

        // Scrape the content
        if (jobId) {
          broadcastJobUpdate(jobId, {
            event: 'processing_log',
            data: {
              step: 'Reference Research',
              log: `📄 Scraping full page content from: ${url.length > 50 ? url.substring(0, 47) + '...' : url}`
            }
          });
        }
        
        const scrapedContent = await webScraperService.scrapeUrl(url);
        if (!scrapedContent) {
          if (jobId) {
            broadcastJobUpdate(jobId, {
              event: 'processing_log',
              data: {
                step: 'Reference Research',
                log: `❌ Failed to scrape content from: ${url.length > 50 ? url.substring(0, 47) + '...' : url}`
              }
            });
          }
          console.log(`❌ Failed to scrape content from: ${url}`);
          continue;
        }

        // Check if we have content with this hash (same content, different URL)
        const existingByHash = await storage.getReferenceChunksByHash(scrapedContent.contentHash);
        if (existingByHash.length > 0) {
          console.log(`♻️ Content already exists with hash: ${scrapedContent.contentHash}`);
          processedUrls.push(url);
          continue;
        }

        // Chunk the content
        const chunks = contentChunkerService.chunkContent(scrapedContent.content, url);
        
        if (jobId) {
          broadcastJobUpdate(jobId, {
            event: 'processing_log',
            data: {
              step: 'Reference Research',
              log: `📝 Created ${chunks.length} semantic chunks, generating embeddings...`
            }
          });
        }
        console.log(`📄 Created ${chunks.length} chunks from ${url}`);

        // Generate embeddings for each chunk and store
        for (const chunk of chunks) {
          try {
            const embedding = await this.generateEmbedding(chunk.text);
            
            const cacheEntry: InsertReferenceCache = {
              url: url,
              contentHash: scrapedContent.contentHash,
              chunkIndex: chunk.index,
              chunkText: chunk.text,
              chunkEmbedding: JSON.stringify(embedding),
              metadata: {
                ...scrapedContent.metadata,
                chunkSummary: contentChunkerService.createChunkSummary(chunk, url),
                tokenCount: chunk.tokenCount,
                startPosition: chunk.startPosition,
                endPosition: chunk.endPosition
              }
            };

            await storage.createReferenceCache(cacheEntry);
            console.log(`💾 Stored chunk ${chunk.index} from ${url}`);
            
          } catch (error) {
            console.error(`❌ Failed to process chunk ${chunk.index} from ${url}:`, error);
          }
        }

        processedUrls.push(url);
        
        if (jobId) {
          broadcastJobUpdate(jobId, {
            event: 'processing_log',
            data: {
              step: 'Reference Research',
              log: `✅ Successfully embedded ${chunks.length} chunks from: ${url.length > 50 ? url.substring(0, 47) + '...' : url}`
            }
          });
        }
        console.log(`✅ Successfully processed ${url} with ${chunks.length} chunks`);
        
      } catch (error) {
        console.error(`❌ Error processing URL ${url}:`, error);
      }
    }

    if (jobId) {
      broadcastJobUpdate(jobId, {
        event: 'processing_log',
        data: {
          step: 'Reference Research',
          log: `🎯 Completed processing: ${processedUrls.length}/${normalizedUrls.length} URLs successfully embedded (${urls.length - normalizedUrls.length} duplicates removed)`
        }
      });
    }
    console.log(`🏁 Completed processing ${processedUrls.length}/${normalizedUrls.length} URLs (${urls.length - normalizedUrls.length} duplicates removed)`);
    return processedUrls;
  }

  /**
   * Perform semantic search for relevant chunks
   */
  async semanticSearch(query: string, maxResults: number = 20): Promise<SemanticSearchResult[]> {
    try {
      console.log(`🔍 Performing semantic search for: ${query.substring(0, 100)}...`);
      
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Get all cached chunks (in production, you'd want to optimize this with vector search)
      const allChunks = await storage.getAllReferenceChunks();
      console.log(`📊 Searching through ${allChunks.length} cached chunks`);
      
      // Calculate similarities and track score distribution
      const results: SemanticSearchResult[] = [];
      const allSimilarities: number[] = [];
      
      for (const chunk of allChunks) {
        try {
          const chunkEmbedding = JSON.parse(chunk.chunkEmbedding);
          const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
          allSimilarities.push(similarity);
          
          if (similarity >= this.similarityThreshold) {
            results.push({
              chunkText: chunk.chunkText,
              url: chunk.url || '',
              similarity,
              metadata: chunk.metadata
            });
          }
        } catch (error) {
          console.error(`Error processing chunk ${chunk.id}:`, error);
        }
      }
      
      // Log similarity score distribution for debugging
      if (allSimilarities.length > 0) {
        const maxSim = Math.max(...allSimilarities);
        const avgSim = allSimilarities.reduce((a, b) => a + b) / allSimilarities.length;
        const aboveThreshold = allSimilarities.filter(s => s >= this.similarityThreshold).length;
        console.log(`📊 Similarity scores: max=${maxSim.toFixed(3)}, avg=${avgSim.toFixed(3)}, above threshold=${aboveThreshold}/${allSimilarities.length}`);
      }
      
      // Sort by similarity (highest first) and limit results
      results.sort((a, b) => b.similarity - a.similarity);
      const topResults = results.slice(0, maxResults);
      
      if (topResults.length > 0) {
        const avgSimilarity = topResults.reduce((sum, r) => sum + r.similarity, 0) / topResults.length;
        console.log(`🎯 Found ${topResults.length} semantically similar chunks (threshold: ${this.similarityThreshold}, avg similarity: ${avgSimilarity.toFixed(3)})`);
      } else {
        console.log(`🎯 Found 0 semantically similar chunks (threshold: ${this.similarityThreshold})`);
      }
      
      return topResults;
      
    } catch (error) {
      console.error('Semantic search failed:', error);
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Create a reference chunk for documents or URLs
   */
  async createReferenceChunk(params: {
    url: string | null;
    documentId?: string;
    contentHash: string;
    chunkIndex: number;
    chunkText: string;
    metadata?: any;
  }): Promise<void> {
    const { url, documentId, contentHash, chunkIndex, chunkText, metadata } = params;
    
    try {
      // Generate embedding for the chunk
      const embedding = await this.generateEmbedding(chunkText);
      
      // Create the reference cache entry
      await storage.createReferenceCache({
        url,
        documentId,
        contentHash,
        chunkIndex,
        chunkText,
        chunkEmbedding: JSON.stringify(embedding),
        metadata: metadata || {}
      });
      
      console.log(`💾 Stored chunk ${chunkIndex} for ${documentId ? `document ${documentId}` : url}`);
      
    } catch (error) {
      console.error(`Failed to create reference chunk:`, error);
      throw error;
    }
  }

  /**
   * Enhanced reference research with semantic search and full content processing
   */
  async enhancedReferenceResearch(contextualQuestion: string): Promise<{
    processedUrls: string[];
    relevantChunks: SemanticSearchResult[];
  }> {
    console.log(`🚀 Starting enhanced reference research for contextual question`);
    
    // Step 1: Search for relevant URLs
    const urls = await this.searchRelevantUrls(contextualQuestion);
    
    // Normalize URLs to remove fragments and deduplicate
    const normalizedUrls = Array.from(new Set(urls.map(url => this.normalizeUrl(url))));
    console.log(`📋 Found ${urls.length} URLs, normalized to ${normalizedUrls.length} unique URLs for processing`);
    
    // Step 2: Process URLs (scrape, chunk, embed, store)
    const processedUrls = await this.processUrls(normalizedUrls);
    
    // Step 3: Perform semantic search for relevant chunks
    const relevantChunks = await this.semanticSearch(contextualQuestion);
    
    console.log(`📈 Research complete: ${processedUrls.length} URLs processed, ${relevantChunks.length} relevant chunks found`);
    
    return {
      processedUrls,
      relevantChunks
    };
  }
}

export const enhancedEmbeddingsService = new EnhancedEmbeddingsService();