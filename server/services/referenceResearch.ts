/**
 * Enhanced Reference Research Service
 * Includes intelligent caching with cosine similarity and link validation
 */

import { storage } from '../storage';
import { embeddingsService } from './embeddings';
import { linkValidator } from './linkValidator';
import { openaiService } from './openai';

interface ReferenceResult {
  Reference_URL: string;
  Reference_URL_Summary: string;
  Reference_URL_Quotes: string[];
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

  async findReferences(question: string, agent?: any): Promise<CachedReferences> {
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
    return await this.generateNewReferences(question, agent);
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

  private async generateNewReferences(question: string, agent?: any): Promise<CachedReferences> {
    // Use agent configuration if provided, otherwise fall back to generic prompt
    let prompt: string;
    let systemPrompt: string;
    
    if (agent && agent.userPrompt && agent.systemPrompt) {
      // Use the pipeline configuration prompts
      console.log('\n🎯 [DEBUG] Using PIPELINE configuration:');
      console.log('📋 System Prompt:', agent.systemPrompt);
      console.log('👤 User Prompt:', agent.userPrompt);
      
      systemPrompt = agent.systemPrompt;
      prompt = agent.userPrompt.replace('{{FIRST_COLUMN}}', question);
      
      console.log('✅ Final prompt:', prompt);
    } else {
      // This should NEVER happen - always require pipeline configuration
      console.error('\n❌ [CRITICAL ERROR] No agent configuration provided to referenceResearch!');
      console.error('This means the pipeline configuration is not being passed properly.');
      throw new Error('Agent configuration is required for reference research. Pipeline configuration missing.');
    }

    console.log('\n🤖 [DEBUG] Calling OpenAI with:');
    console.log('🔧 Model: gpt-4o');
    console.log('🎭 System:', systemPrompt);
    console.log('💬 User:', prompt);

    const result = await openaiService.callOpenAIDirect({
      model: "gpt-4o",
      systemPrompt: systemPrompt,
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 1000
    });

    console.log('\n📤 [DEBUG] OpenAI Response:');
    console.log('📝 Output:', result.output);

    if (result.error) {
      throw new Error(`Reference generation failed: ${result.error}`);
    }

    let referencesData;
    let cleanOutput = result.output.trim();
    
    try {
      console.log(`🔍 Debug - Original output:`, result.output);
      console.log(`🔍 Debug - Clean output before processing:`, cleanOutput);
      
      // More robust cleaning for markdown code fences
      if (cleanOutput.includes('```json')) {
        cleanOutput = cleanOutput.replace(/```json\s*/g, '').replace(/\s*```/g, '');
      } else if (cleanOutput.includes('```')) {
        cleanOutput = cleanOutput.replace(/```\s*/g, '').replace(/\s*```/g, '');
      }
      
      console.log(`🔍 Debug - Clean output after processing:`, cleanOutput);
      
      referencesData = JSON.parse(cleanOutput);
      console.log(`✅ Successfully parsed JSON:`, referencesData);
    } catch (error) {
      console.error(`❌ JSON Parse Error:`, error);
      console.error(`❌ Original Output Length:`, result.output.length);
      console.error(`❌ Original Output:`, result.output);
      console.error(`❌ Clean Output:`, cleanOutput);
      throw new Error(`Failed to parse reference response: ${result.output.substring(0, 500)}...`);
    }

    const references = referencesData.references || [];
    console.log(`📚 Generated ${references.length} potential references`);

    // Validate all links
    const urls = references.map((ref: any) => ref.Reference_URL);
    const validationResults = await linkValidator.validateUrls(urls);

    // Merge validation results with reference data
    const validatedReferences: ReferenceResult[] = references.map((ref: any, index: number) => {
      const validation = validationResults[index];
      return {
        Reference_URL: ref.Reference_URL,
        Reference_URL_Summary: ref.Reference_URL_Summary,
        Reference_URL_Quotes: ref.Reference_URL_Quotes || [],
        status: validation.status,
        statusCode: validation.statusCode,
        error: validation.error
      };
    });

    const validCount = validatedReferences.filter(r => r.status === 'valid').length;
    console.log(`✅ ${validCount}/${validatedReferences.length} references are valid`);

    // If we don't have enough valid references, try to generate more
    if (validCount < 5) {
      console.log(`🔄 Only ${validCount} valid references found. Attempting to find more...`);
      
      try {
        const additionalRefs = await this.generateAdditionalReferences(question, agent, validatedReferences);
        if (additionalRefs.length > 0) {
          console.log(`🆕 Found ${additionalRefs.length} additional references`);
          validatedReferences.push(...additionalRefs);
        }
      } catch (error) {
        console.log(`⚠️ Could not generate additional references: ${error}`);
      }
    }

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

    const urls = cachedResult.references.map(ref => ref.Reference_URL);
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

  private async generateAdditionalReferences(question: string, agent: any, existingRefs: ReferenceResult[]): Promise<ReferenceResult[]> {
    const existingUrls = new Set(existingRefs.map(r => r.Reference_URL));
    
    const fallbackPrompt = `Find MORE specific Twilio ecosystem references for: ${question}

**AVOID these URLs already found:** ${Array.from(existingUrls).join(', ')}

**Focus on these additional areas:**
- https://www.twilio.com/customers/ (case studies)
- https://www.twilio.com/resources/guides/ (detailed guides)
- https://sendgrid.com/marketing-campaigns/ (email marketing)
- https://segment.com/solutions/ (data solutions)
- https://www.twilio.com/ahoy/ (developer resources)

Return JSON with the new structure:
{
  "references": [
    {
      "Reference_URL": "https://www.twilio.com/[specific-page]",
      "Reference_URL_Summary": "How this resource addresses the question",
      "Reference_URL_Quotes": [
        "Relevant quote from the resource",
        "Another key point or statistic"
      ]
    }
  ]
}

Return at least 3 NEW references that haven't been used yet.`;

    const result = await openaiService.callOpenAIDirect({
      model: "gpt-4o",
      systemPrompt: agent.systemPrompt,
      userPrompt: fallbackPrompt,
      temperature: 0.3,
      maxTokens: 1000
    });

    if (result.error) {
      return [];
    }

    let cleanOutput = result.output.trim();
    if (cleanOutput.includes('```json')) {
      cleanOutput = cleanOutput.replace(/```json\s*/g, '').replace(/\s*```/g, '');
    }

    try {
      const additionalData = JSON.parse(cleanOutput);
      const newReferences = additionalData.references || [];
      
      // Filter out URLs we already have
      const uniqueRefs = newReferences.filter((ref: any) => !existingUrls.has(ref.Reference_URL));
      
      if (uniqueRefs.length === 0) {
        return [];
      }

      // Validate the new URLs
      const urls = uniqueRefs.map((ref: any) => ref.Reference_URL);
      const validationResults = await linkValidator.validateUrls(urls);

      return uniqueRefs.map((ref: any, index: number) => {
        const validation = validationResults[index];
        return {
          Reference_URL: ref.Reference_URL,
          Reference_URL_Summary: ref.Reference_URL_Summary,
          Reference_URL_Quotes: ref.Reference_URL_Quotes || [],
          status: validation.status,
          statusCode: validation.statusCode,
          error: validation.error
        };
      });

    } catch (error) {
      console.log(`❌ Failed to parse additional references: ${error}`);
      return [];
    }
  }

  formatReferencesForOutput(references: ReferenceResult[]): string {
    const validRefs = references.filter(ref => ref.status === 'valid');
    const invalidRefs = references.filter(ref => ref.status !== 'valid');

    let output = "## 📚 Reference Sources\n\n";
    output += `**Found ${validRefs.length} verified sources for this question**\n\n`;

    if (validRefs.length > 0) {
      output += "### ✅ Verified Sources:\n";
      validRefs.forEach((ref, index) => {
        output += `${index + 1}. **[${ref.Reference_URL}](${ref.Reference_URL})**\n`;
        output += `   **Summary:** ${ref.Reference_URL_Summary}\n`;
        if (ref.Reference_URL_Quotes && ref.Reference_URL_Quotes.length > 0) {
          output += `   **Key Points:**\n`;
          ref.Reference_URL_Quotes.forEach(quote => {
            output += `   • "${quote}"\n`;
          });
        }
        output += "\n";
      });
    }

    if (invalidRefs.length > 0) {
      output += "### ⚠️ Unverified Sources:\n";
      invalidRefs.forEach((ref, index) => {
        output += `${index + 1}. **${ref.Reference_URL}** (${ref.status})\n`;
        output += `   **Summary:** ${ref.Reference_URL_Summary}\n`;
        if (ref.error) {
          output += `   **Error:** ${ref.error}\n`;
        }
        output += "\n";
      });
    }

    if (validRefs.length < 5) {
      output += `\n**Note:** Found ${validRefs.length} working sources (target: 5+ sources)\n`;
    }

    return output;
  }
}

export const referenceResearchService = new ReferenceResearchService();