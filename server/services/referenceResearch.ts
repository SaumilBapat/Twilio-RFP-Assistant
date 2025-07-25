/**
 * Enhanced Reference Research Service
 * Includes intelligent caching with cosine similarity and link validation
 */

import { storage } from '../storage';
import { embeddingsService } from './embeddings';
import { linkValidator } from './linkValidator';
import { openaiService } from './openai';

interface ReferenceResult {
  url: string;
  title: string;
  description: string;
  status: 'valid' | 'invalid' | 'timeout';
  statusCode?: number;
  error?: string;
}

interface CachedReferences {
  fromCache: boolean;
  cacheId?: string;
  similarity?: number;
  references: ReferenceResult[];
  validatedAt: Date;
}

export class ReferenceResearchService {
  private readonly SIMILARITY_THRESHOLD = 0.85;
  private readonly CACHE_VALIDITY_HOURS = 24;

  async findReferences(question: string): Promise<CachedReferences> {
    console.log(`🔍 Finding references for question: ${question.substring(0, 100)}...`);
    
    // Step 1: Check cache for similar questions
    const cachedResult = await this.checkCache(question);
    if (cachedResult) {
      console.log(`💰 Found cached references with ${cachedResult.similarity?.toFixed(3)} similarity`);
      
      // Validate cached links if they're old
      if (this.isCacheStale(cachedResult.validatedAt)) {
        console.log(`🔄 Cache is stale, re-validating links...`);
        await this.revalidateCachedReferences(cachedResult);
      }
      
      return cachedResult;
    }

    // Step 2: No similar cached results, generate new references
    console.log(`🆕 No similar cached references found, generating new ones...`);
    return await this.generateNewReferences(question);
  }

  private async checkCache(question: string): Promise<CachedReferences | null> {
    const embedding = await embeddingsService.generateEmbedding(
      embeddingsService.normalizeQuestion(question)
    );
    
    const similarCache = await storage.findSimilarReferences(
      embedding.embedding,
      this.SIMILARITY_THRESHOLD
    );

    if (similarCache.length > 0) {
      const bestMatch = similarCache[0];
      const references = Array.isArray(bestMatch.references) ? bestMatch.references : [];
      
      return {
        fromCache: true,
        cacheId: bestMatch.id,
        similarity: embedding.embedding ? 
          embeddingsService.cosineSimilarity(
            embedding.embedding,
            JSON.parse(bestMatch.questionEmbedding)
          ) : undefined,
        references: references as ReferenceResult[],
        validatedAt: bestMatch.validatedAt
      };
    }

    return null;
  }

  private async generateNewReferences(question: string): Promise<CachedReferences> {
    // Call OpenAI directly to avoid circular dependency
    const prompt = `Find authoritative sources and references that would help answer this RFP question: "${question}"

Return your response as a JSON object with this structure:
{
  "references": [
    {
      "url": "https://example.com/resource",
      "title": "Resource Title",
      "description": "Brief description of why this resource is relevant"
    }
  ]
}

Focus on:
- Official documentation and whitepapers
- Industry standards and compliance documents  
- Authoritative company resources
- Government regulatory documents
- Academic or research publications

Provide 3-5 high-quality references with working URLs.`;

    const result = await openaiService.callOpenAIDirect({
      model: "gpt-4o",
      systemPrompt: "You are a research expert finding authoritative sources for RFP questions.",
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 1000
    });

    if (result.error) {
      throw new Error(`Reference generation failed: ${result.error}`);
    }

    let referencesData;
    try {
      // Clean the response to remove markdown code fences if present
      let cleanOutput = result.output.trim();
      if (cleanOutput.startsWith('```json')) {
        cleanOutput = cleanOutput.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanOutput.startsWith('```')) {
        cleanOutput = cleanOutput.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      referencesData = JSON.parse(cleanOutput);
    } catch (error) {
      console.error(`❌ JSON Parse Error:`, error);
      console.error(`❌ Original Output:`, result.output);
      throw new Error(`Failed to parse reference response: ${result.output}`);
    }

    const references = referencesData.references || [];
    console.log(`📚 Generated ${references.length} potential references`);

    // Validate all links
    const urls = references.map((ref: any) => ref.url);
    const validationResults = await linkValidator.validateUrls(urls);

    // Merge validation results with reference data
    const validatedReferences: ReferenceResult[] = references.map((ref: any, index: number) => {
      const validation = validationResults[index];
      return {
        url: ref.url,
        title: ref.title,
        description: ref.description,
        status: validation.status,
        statusCode: validation.statusCode,
        error: validation.error
      };
    });

    const validCount = validatedReferences.filter(r => r.status === 'valid').length;
    console.log(`✅ ${validCount}/${validatedReferences.length} references are valid`);

    // Cache the results for future use
    await this.cacheReferences(question, validatedReferences);

    return {
      fromCache: false,
      references: validatedReferences,
      validatedAt: new Date()
    };
  }

  private async cacheReferences(question: string, references: ReferenceResult[]): Promise<void> {
    try {
      const embedding = await embeddingsService.generateEmbedding(
        embeddingsService.normalizeQuestion(question)
      );

      await storage.createReferenceCache({
        question,
        questionEmbedding: JSON.stringify(embedding.embedding),
        references,
        validatedAt: new Date()
      });

      console.log(`💾 Cached references for future use`);
    } catch (error) {
      console.error(`❌ Failed to cache references:`, error);
      // Don't fail the whole operation if caching fails
    }
  }

  private async revalidateCachedReferences(cachedResult: CachedReferences): Promise<void> {
    if (!cachedResult.cacheId) return;

    const urls = cachedResult.references.map(ref => ref.url);
    const validationResults = await linkValidator.validateUrls(urls);

    // Update reference statuses
    cachedResult.references.forEach((ref, index) => {
      const validation = validationResults[index];
      ref.status = validation.status;
      ref.statusCode = validation.statusCode;
      ref.error = validation.error;
    });

    // Update validation timestamp in cache
    await storage.updateReferenceCacheValidation(cachedResult.cacheId, new Date());
    cachedResult.validatedAt = new Date();

    console.log(`🔄 Re-validated cached references`);
  }

  private isCacheStale(validatedAt: Date): boolean {
    const hoursOld = (Date.now() - validatedAt.getTime()) / (1000 * 60 * 60);
    return hoursOld > this.CACHE_VALIDITY_HOURS;
  }

  formatReferencesForOutput(references: ReferenceResult[]): string {
    const validRefs = references.filter(ref => ref.status === 'valid');
    const invalidRefs = references.filter(ref => ref.status !== 'valid');

    let output = "## 📚 Reference Sources\n\n";

    if (validRefs.length > 0) {
      output += "### ✅ Verified Sources:\n";
      validRefs.forEach((ref, index) => {
        output += `${index + 1}. **[${ref.title}](${ref.url})**\n`;
        output += `   ${ref.description}\n\n`;
      });
    }

    if (invalidRefs.length > 0) {
      output += "### ⚠️ Unverified Sources:\n";
      invalidRefs.forEach((ref, index) => {
        output += `${index + 1}. **${ref.title}** (${ref.status})\n`;
        output += `   ${ref.description}\n`;
        output += `   URL: ${ref.url}\n`;
        if (ref.error) {
          output += `   Error: ${ref.error}\n`;
        }
        output += "\n";
      });
    }

    return output;
  }
}

export const referenceResearchService = new ReferenceResearchService();