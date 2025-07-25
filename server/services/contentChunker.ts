export interface ContentChunk {
  index: number;
  text: string;
  tokenCount: number;
  startPosition: number;
  endPosition: number;
}

export class ContentChunkerService {
  private readonly maxTokensPerChunk = 600; // Keep well under 8192 OpenAI limit 
  private readonly overlapTokens = 100; // Overlap between chunks for context
  private readonly minChunkTokens = 50; // Minimum tokens for a valid chunk
  private readonly openAiTokenLimit = 8000; // Safe limit for OpenAI embeddings

  /**
   * Split content into semantic chunks suitable for embedding
   */
  chunkContent(content: string, url: string): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    
    // First, try to split by semantic boundaries (paragraphs, sections)
    const semanticChunks = this.splitBySemanticBoundaries(content);
    
    let chunkIndex = 0;
    let currentPosition = 0;
    
    for (const semanticChunk of semanticChunks) {
      const estimatedTokens = this.estimateTokenCount(semanticChunk);
      
      if (estimatedTokens <= this.maxTokensPerChunk && estimatedTokens < this.openAiTokenLimit) {
        // Chunk is small enough, use as-is
        if (estimatedTokens >= this.minChunkTokens) {
          chunks.push({
            index: chunkIndex++,
            text: semanticChunk.trim(),
            tokenCount: estimatedTokens,
            startPosition: currentPosition,
            endPosition: currentPosition + semanticChunk.length
          });
        }
        currentPosition += semanticChunk.length;
      } else {
        // Chunk is too large, split further
        const subChunks = this.splitLargeChunk(semanticChunk, currentPosition);
        for (const subChunk of subChunks) {
          if (subChunk.tokenCount >= this.minChunkTokens) {
            chunks.push({
              ...subChunk,
              index: chunkIndex++
            });
          }
        }
        currentPosition += semanticChunk.length;
      }
    }

    console.log(`📊 Split content from ${url} into ${chunks.length} chunks`);
    return chunks;
  }

  private splitBySemanticBoundaries(content: string): string[] {
    const chunks: string[] = [];
    
    // Split by double newlines (paragraph breaks)
    const paragraphs = content.split(/\n\s*\n/);
    
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();
      if (!trimmedParagraph) continue;
      
      const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + trimmedParagraph;
      const estimatedTokens = this.estimateTokenCount(potentialChunk);
      
      if (estimatedTokens > this.maxTokensPerChunk && currentChunk) {
        // Current chunk is full, start a new one
        chunks.push(currentChunk);
        currentChunk = trimmedParagraph;
      } else {
        currentChunk = potentialChunk;
      }
    }
    
    // Add the last chunk
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    // If we only got one large chunk, fall back to sentence splitting
    if (chunks.length === 1 && this.estimateTokenCount(chunks[0]) > this.maxTokensPerChunk) {
      return this.splitBySentences(chunks[0]);
    }
    
    return chunks;
  }

  private splitBySentences(content: string): string[] {
    const chunks: string[] = [];
    
    // Split by sentence boundaries
    const sentences = content.split(/(?<=[.!?])\s+/);
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
      const estimatedTokens = this.estimateTokenCount(potentialChunk);
      
      if (estimatedTokens > this.maxTokensPerChunk && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        currentChunk = potentialChunk;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  private splitLargeChunk(content: string, startPosition: number): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    
    // Split by sentences first
    const sentences = content.split(/(?<=[.!?])\s+/);
    
    let currentChunk = '';
    let currentStart = startPosition;
    let chunkStartInContent = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
      const estimatedTokens = this.estimateTokenCount(potentialChunk);
      
      if (estimatedTokens > this.maxTokensPerChunk && currentChunk) {
        // Create chunk with current content
        chunks.push({
          index: 0, // Will be set by caller
          text: currentChunk.trim(),
          tokenCount: this.estimateTokenCount(currentChunk),
          startPosition: currentStart + chunkStartInContent,
          endPosition: currentStart + chunkStartInContent + currentChunk.length
        });
        
        // Start new chunk with overlap
        const overlapStart = Math.max(0, i - 2); // Include previous 2 sentences for context
        const overlapSentences = sentences.slice(overlapStart, i);
        const overlapText = overlapSentences.join(' ');
        
        chunkStartInContent += currentChunk.length;
        currentChunk = overlapText + (overlapText ? ' ' : '') + sentence;
      } else {
        currentChunk = potentialChunk;
      }
    }
    
    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        index: 0, // Will be set by caller
        text: currentChunk.trim(),
        tokenCount: this.estimateTokenCount(currentChunk),
        startPosition: currentStart + chunkStartInContent,
        endPosition: currentStart + chunkStartInContent + currentChunk.length
      });
    }
    
    return chunks;
  }

  private estimateTokenCount(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    // This is a conservative estimate; actual tokenization varies
    return Math.ceil(text.length / 4);
  }

  /**
   * Create a summary of the chunk for metadata
   */
  createChunkSummary(chunk: ContentChunk, url: string): string {
    const preview = chunk.text.substring(0, 100);
    return `Chunk ${chunk.index + 1} from ${url}: ${preview}${chunk.text.length > 100 ? '...' : ''}`;
  }
}

export const contentChunkerService = new ContentChunkerService();