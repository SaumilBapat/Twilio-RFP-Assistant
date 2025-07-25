/**
 * Embeddings Service
 * Handles text embeddings and cosine similarity calculations for reference caching
 */

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface EmbeddingResult {
  embedding: number[];
  text: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class EmbeddingsService {
  
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      console.log(`🧠 Generating embedding for text: ${text.substring(0, 100)}...`);
      
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small", // Newer, faster model
        input: text.trim(),
      });

      const embedding = response.data[0].embedding;
      
      console.log(`✅ Generated embedding with ${embedding.length} dimensions`);
      
      return {
        embedding,
        text,
        usage: response.usage
      };
      
    } catch (error) {
      console.error(`❌ Failed to generate embedding:`, error);
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return similarity;
  }

  async findSimilarQuestions(
    questionText: string, 
    cachedEmbeddings: Array<{id: string, embedding: number[], question: string}>,
    threshold: number = 0.85
  ): Promise<Array<{id: string, question: string, similarity: number}>> {
    
    const questionEmbedding = await this.generateEmbedding(questionText);
    const similarities: Array<{id: string, question: string, similarity: number}> = [];
    
    for (const cached of cachedEmbeddings) {
      const similarity = this.cosineSimilarity(questionEmbedding.embedding, cached.embedding);
      
      if (similarity >= threshold) {
        similarities.push({
          id: cached.id,
          question: cached.question,
          similarity
        });
      }
    }
    
    // Sort by similarity descending
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    console.log(`🔍 Found ${similarities.length} similar questions above threshold ${threshold}`);
    
    return similarities;
  }

  normalizeQuestion(question: string): string {
    // Normalize the question for better similarity matching
    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}

export const embeddingsService = new EmbeddingsService();