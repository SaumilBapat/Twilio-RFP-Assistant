import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export interface AgentConfig {
  name: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  tools?: string[];
  systemPrompt: string;
  userPrompt: string;
}

export interface ProcessingResult {
  output: string;
  latency: number;
  inputPrompt: string;
  metadata?: any;
  error?: string;
}

export class OpenAIService {
  async getAvailableModels(): Promise<string[]> {
    try {
      const models = await openai.models.list();
      return models.data
        .filter(model => model.id.includes('gpt') || model.id.includes('o1') || model.id.includes('o3'))
        .map(model => model.id)
        .sort();
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error);
      return ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']; // fallback models
    }
  }

  async processWithAgent(
    agent: AgentConfig,
    rowData: Record<string, any>
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      // Special handling for Reference Research step
      if (agent.name === "Reference Research") {
        return await this.processReferenceResearch(agent, rowData);
      }

      // Replace placeholders in prompts with actual data
      const processedSystemPrompt = this.replacePlaceholders(agent.systemPrompt, rowData);
      const processedUserPrompt = this.replacePlaceholders(agent.userPrompt, rowData);
      
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: processedSystemPrompt },
        { role: "user", content: processedUserPrompt }
      ];

      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      let modelToUse = agent.model;
      
      // Handle special models that don't support certain parameters
      const completionOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: modelToUse,
        messages,
        max_tokens: agent.maxTokens,
      };

      // Some models like gpt-4o-search-preview don't support temperature parameter
      if (!agent.model.includes('search-preview')) {
        completionOptions.temperature = agent.temperature;
      }

      // Add JSON response format for structured output
      if (agent.tools?.includes('json_output')) {
        completionOptions.response_format = { type: "json_object" };
      }

      // Add web search tool if requested (Note: OpenAI doesn't have built-in web search yet, but we prepare for it)
      if (agent.tools?.includes('web_search')) {
        // For now, we'll add a note in the system prompt to encourage research-style responses
        // In the future, this could integrate with actual web search APIs
        messages[0].content += "\n\nNote: Focus on providing specific, verifiable information with source references. When possible, mention authoritative sources and recent data.";
      }

      const response = await openai.chat.completions.create(completionOptions);
      
      const latency = Date.now() - startTime;
      const output = response.choices[0]?.message?.content || '';

      return {
        output,
        latency,
        inputPrompt: `System: ${processedSystemPrompt}\nUser: ${processedUserPrompt}`,
        metadata: {
          model: agent.model,
          temperature: agent.temperature,
          usage: response.usage,
        }
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      console.error(`OpenAI processing error for agent ${agent.name}:`, error);
      
      return {
        output: '',
        latency,
        inputPrompt: `System: ${agent.systemPrompt}\nUser: ${agent.userPrompt}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async processReferenceResearch(
    agent: AgentConfig,
    rowData: Record<string, any>
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      // Import the reference research service dynamically to avoid circular dependencies
      const { referenceResearchService } = await import('./referenceResearch');
      
      // Extract the question from the first column
      const firstColumnKey = Object.keys(rowData)[0];
      const question = firstColumnKey ? String(rowData[firstColumnKey] || '') : '';
      
      if (!question) {
        throw new Error('No question found in input data');
      }

      console.log(`🔍 Using intelligent reference research for: ${question.substring(0, 100)}...`);
      
      // Use the enhanced reference research service
      const result = await referenceResearchService.findReferences(question);
      
      // Format the output using the service
      const output = referenceResearchService.formatReferencesForOutput(result.references);
      
      const latency = Date.now() - startTime;
      
      if (result.fromCache) {
        console.log(`💰 Used cached references (similarity: ${result.similarity?.toFixed(3)})`);
      } else {
        console.log(`🆕 Generated new references with validation`);
      }

      return {
        output,
        latency,
        inputPrompt: `Reference Research for: ${question}`,
        metadata: {
          model: agent.model,
          fromCache: result.fromCache,
          similarity: result.similarity,
          referenceCount: result.references.length,
          validReferences: result.references.filter(r => r.status === 'valid').length
        }
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      console.error(`❌ Reference research failed after ${latency}ms:`, error);
      
      return {
        output: '',
        latency,
        inputPrompt: `Reference Research failed`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
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

  async performWebSearch(query: string): Promise<any> {
    // This would integrate with a web search API like Bing or Google Custom Search
    // For now, return mock search results
    return {
      sources: [
        "https://www.twilio.com/security",
        "https://www.twilio.com/trust-center/privacy"
      ],
      snippets: [
        "Twilio maintains comprehensive security policies...",
        "Our privacy and security practices are designed..."
      ]
    };
  }
}

export const openaiService = new OpenAIService();
