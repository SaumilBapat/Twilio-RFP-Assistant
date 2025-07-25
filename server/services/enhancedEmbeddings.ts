import OpenAI from 'openai';
import { storage } from '../storage';
import { webScraperService } from './webScraper';
import { contentChunkerService } from './contentChunker';
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
  private readonly similarityThreshold = 0.75; // Lower threshold for more results

  /**
   * Generate embeddings for text content
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: this.embeddingModel,
        input: text,
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
   * Process URLs: scrape, chunk, embed, and store in cache
   */
  async processUrls(urls: string[]): Promise<string[]> {
    const processedUrls: string[] = [];
    
    for (const url of urls) {
      try {
        console.log(`🌐 Processing URL: ${url}`);
        
        // Check if URL is valid and live
        const isValid = await webScraperService.isValidUrl(url);
        if (!isValid) {
          console.log(`❌ URL not valid or not accessible: ${url}`);
          continue;
        }

        // Check if we already have this content in cache
        const existingChunks = await storage.getReferenceChunksByUrl(url);
        if (existingChunks.length > 0) {
          console.log(`♻️ URL already processed: ${url} (${existingChunks.length} chunks)`);
          processedUrls.push(url);
          continue;
        }

        // Scrape the content
        const scrapedContent = await webScraperService.scrapeUrl(url);
        if (!scrapedContent) {
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
        console.log(`✅ Successfully processed ${url} with ${chunks.length} chunks`);
        
      } catch (error) {
        console.error(`❌ Error processing URL ${url}:`, error);
      }
    }

    console.log(`🏁 Completed processing ${processedUrls.length}/${urls.length} URLs`);
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
      
      // Calculate similarities
      const results: SemanticSearchResult[] = [];
      
      for (const chunk of allChunks) {
        try {
          const chunkEmbedding = JSON.parse(chunk.chunkEmbedding);
          const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
          
          if (similarity >= this.similarityThreshold) {
            results.push({
              chunkText: chunk.chunkText,
              url: chunk.url,
              similarity,
              metadata: chunk.metadata
            });
          }
        } catch (error) {
          console.error(`Error processing chunk ${chunk.id}:`, error);
        }
      }
      
      // Sort by similarity (highest first) and limit results
      results.sort((a, b) => b.similarity - a.similarity);
      const topResults = results.slice(0, maxResults);
      
      console.log(`🎯 Found ${topResults.length} semantically similar chunks (threshold: ${this.similarityThreshold})`);
      
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
   * Enhanced reference research with semantic search and full content processing
   */
  async enhancedReferenceResearch(contextualQuestion: string): Promise<{
    processedUrls: string[];
    relevantChunks: SemanticSearchResult[];
  }> {
    console.log(`🚀 Starting enhanced reference research for contextual question`);
    
    // Step 1: Search for relevant URLs
    const urls = await this.searchRelevantUrls(contextualQuestion);
    
    // Step 2: Process URLs (scrape, chunk, embed, store)
    const processedUrls = await this.processUrls(urls);
    
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