/**
 * Enhanced Response Generation Service
 * Includes intelligent caching for final responses based on question + references
 */

import { storage } from '../storage';
import { embeddingsService } from './embeddings';
import { openaiService } from './openai';

interface CachedResponse {
  fromCache: boolean;
  cacheId?: string;
  similarity?: number;
  response: string;
  metadata?: any;
}

export class ResponseGenerationService {
  private readonly SIMILARITY_THRESHOLD = 0.88; // Higher threshold for responses since they should be more precise

  async generateResponse(
    question: string, 
    references: string,
    agent: any,
    rowData: any
  ): Promise<CachedResponse> {
    console.log(`📝 Generating response for question: ${question.substring(0, 100)}...`);
    
    // Step 1: Check cache for similar question + reference combinations
    const cachedResult = await this.checkResponseCache(question, references);
    if (cachedResult) {
      console.log(`💰 Found cached response with ${cachedResult.similarity?.toFixed(3)} similarity`);
      return cachedResult;
    }

    // Step 2: No similar cached results, generate new response
    console.log(`🆕 No similar cached response found, generating new one...`);
    return await this.generateNewResponse(question, references, agent, rowData);
  }

  private async checkResponseCache(question: string, references: string): Promise<CachedResponse | null> {
    // Create a combined input for similarity matching
    const combinedInput = this.createCombinedInput(question, references);
    
    const embedding = await embeddingsService.generateEmbedding(combinedInput);
    
    const similarCache = await storage.findSimilarResponses(
      embedding.embedding,
      this.SIMILARITY_THRESHOLD
    );

    if (similarCache.length > 0) {
      const bestMatch = similarCache[0];
      
      return {
        fromCache: true,
        cacheId: bestMatch.id,
        similarity: embedding.embedding ? 
          embeddingsService.cosineSimilarity(
            embedding.embedding,
            JSON.parse(bestMatch.combinedEmbedding)
          ) : undefined,
        response: bestMatch.response,
        metadata: bestMatch.metadata
      };
    }

    return null;
  }

  private async generateNewResponse(
    question: string,
    references: string,
    agent: any,
    rowData: any
  ): Promise<CachedResponse> {
    
    // Replace placeholders in the original OpenAI service way
    const processedSystemPrompt = this.replacePlaceholders(agent.systemPrompt, rowData);
    const processedUserPrompt = this.replacePlaceholders(agent.userPrompt, rowData);
    
    const startTime = Date.now();
    
    try {
      // Create OpenAI instance directly since we can't access openaiService.openai
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Helper function to determine correct token parameter based on model
      const getTokensParam = (model: string, maxTokens: number) => {
        // o3 and gpt-5 models require max_completion_tokens instead of max_tokens
        if (model.startsWith('o3') || model.startsWith('gpt-5')) {
          return { max_completion_tokens: maxTokens };
        }
        return { max_tokens: maxTokens };
      };

      const tokensParam = getTokensParam(agent.model, agent.maxTokens || 2000);

      // Build request parameters - gpt-5 and o3 models don't support temperature
      const requestParams: any = {
        model: agent.model,
        messages: [
          { role: "system", content: processedSystemPrompt },
          { role: "user", content: processedUserPrompt }
        ],
        ...tokensParam,
      };

      // Only add temperature for models that support it
      if (!agent.model.startsWith('o3') && !agent.model.startsWith('gpt-5')) {
        requestParams.temperature = agent.temperature || 0.3;
      }

      // GPT-5 specific parameters
      if (agent.model.startsWith('gpt-5')) {
        requestParams.reasoning_effort = 'medium'; // Options: minimal, low, medium, high
      }

      const response = await openai.chat.completions.create(requestParams);

      // Debug logging for gpt-5 responses
      if (agent.model.startsWith('gpt-5')) {
        console.log(`🔍 GPT-5 Response Debug (responseGeneration):`);
        console.log(`   - Response structure: ${JSON.stringify(Object.keys(response))}`);
        console.log(`   - Choices count: ${response.choices?.length || 0}`);
        console.log(`   - Content length: ${response.choices[0]?.message?.content?.length || 0}`);
      }

      const output = response.choices[0]?.message?.content || '';
      const latency = Date.now() - startTime;

      console.log(`✅ Generated new response in ${latency}ms`);

      const metadata = {
        model: agent.model,
        temperature: agent.temperature,
        latency,
        usage: response.usage,
        generatedAt: new Date().toISOString()
      };

      // Cache the response for future use
      await this.cacheResponse(question, references, output, metadata);

      return {
        fromCache: false,
        response: output,
        metadata
      };

    } catch (error) {
      console.error(`❌ Response generation failed:`, error);
      throw error;
    }
  }

  private async cacheResponse(
    question: string,
    references: string,
    response: string,
    metadata: any
  ): Promise<void> {
    try {
      const combinedInput = this.createCombinedInput(question, references);
      const referenceSummary = this.createReferenceSummary(references);
      
      const embedding = await embeddingsService.generateEmbedding(combinedInput);

      await storage.createResponseCache({
        question,
        referenceSummary,
        combinedEmbedding: JSON.stringify(embedding.embedding),
        response,
        metadata
      });

      console.log(`💾 Cached response for future use`);
    } catch (error) {
      console.error(`❌ Failed to cache response:`, error);
      // Don't fail the whole operation if caching fails
    }
  }

  private createCombinedInput(question: string, references: string): string {
    // Create a normalized input that combines question and key reference information
    const normalizedQuestion = embeddingsService.normalizeQuestion(question);
    
    // Extract key URLs and titles from references for similarity matching
    const referenceLines = references.split('\n').filter(line => 
      line.includes('http') || line.includes('**') || line.includes('Title:')
    );
    
    const keyReferences = referenceLines.slice(0, 10).join(' '); // Limit to prevent huge embeddings
    
    return `${normalizedQuestion} || ${keyReferences}`;
  }

  private createReferenceSummary(references: string): string {
    // Create a concise summary of references for storage
    const lines = references.split('\n').filter(line => line.trim());
    const urls = lines.filter(line => line.includes('http')).slice(0, 5);
    const titles = lines.filter(line => line.includes('**')).slice(0, 5);
    
    return [...urls, ...titles].join(' | ').substring(0, 500);
  }

  private replacePlaceholders(template: string, data: Record<string, any>): string {
    let result = template;
    
    // Handle special placeholder for first column
    const firstColumnKey = Object.keys(data)[0];
    if (firstColumnKey) {
      result = result.replace(/\{\{FIRST_COLUMN\}\}/g, String(data[firstColumnKey] || ''));
    }
    
    // Replace placeholders like {{ColumnName}} with actual values
    return result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }
}

export const responseGenerationService = new ResponseGenerationService();