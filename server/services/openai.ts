import OpenAI from "openai";
import { performEnhancedReferenceResearch, getRelevantContentChunks } from './enhancedReferenceResearch';

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

  // Helper function to determine correct token parameter based on model
  private getTokensParam(model: string, maxTokens: number) {
    // o3 and gpt-5 models require max_completion_tokens instead of max_tokens
    if (model.startsWith('o3') || model.startsWith('gpt-5')) {
      // GPT-5 needs extra tokens for reasoning overhead
      // The model uses significant tokens for internal reasoning before generating content
      if (model.startsWith('gpt-5')) {
        // GPT-5 uses approximately 2000-4000 tokens for reasoning
        // We need to add extra tokens on top of requested content tokens
        const gpt5TotalTokens = maxTokens + 6000; // Add 6000 tokens for reasoning overhead
        console.log(`🎯 GPT-5 Token Allocation: Requested ${maxTokens} content tokens, allocating ${gpt5TotalTokens} total (includes reasoning overhead)`);
        return { max_completion_tokens: gpt5TotalTokens };
      }
      return { max_completion_tokens: maxTokens };
    }
    return { max_tokens: maxTokens };
  }

  // Direct OpenAI call to avoid circular dependencies
  async callOpenAIDirect(config: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' | 'text' };
  }): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      const tokensParam = this.getTokensParam(config.model, config.maxTokens || 1000);
      
      // Prepare request parameters - o3 models don't support temperature parameter
      const requestParams: any = {
        model: config.model,
        messages: [
          { role: "system", content: config.systemPrompt },
          { role: "user", content: config.userPrompt }
        ],
        ...tokensParam
      };

      // Only add temperature for non-o3 and non-gpt-5 models
      if (!config.model.startsWith('o3') && !config.model.startsWith('gpt-5')) {
        requestParams.temperature = config.temperature || 0.7;
      }

      // GPT-5 specific parameters
      if (config.model.startsWith('gpt-5')) {
        requestParams.reasoning_effort = 'low'; // Use 'low' to reduce reasoning token usage
        console.log(`🔧 GPT-5 Config: reasoning_effort=low, max_completion_tokens=${tokensParam.max_completion_tokens}`);
      }

      // Add response format if specified
      if (config.responseFormat) {
        requestParams.response_format = config.responseFormat;
      }

      const response = await openai.chat.completions.create(requestParams);

      const latency = Date.now() - startTime;
      
      // EXTENSIVE DEBUG LOGGING FOR GPT-5
      if (config.model.startsWith('gpt-5')) {
        console.log(`\n🔴🔴🔴 GPT-5 FULL RESPONSE DEBUG 🔴🔴🔴`);
        console.log(`Model: ${config.model}`);
        console.log(`\n1️⃣ FULL RESPONSE OBJECT:`);
        console.log(JSON.stringify(response, null, 2));
        
        console.log(`\n2️⃣ RESPONSE TOP-LEVEL KEYS:`);
        console.log(Object.keys(response));
        
        if (response.choices && response.choices[0]) {
          console.log(`\n3️⃣ FIRST CHOICE OBJECT:`);
          console.log(JSON.stringify(response.choices[0], null, 2));
          
          console.log(`\n4️⃣ FIRST CHOICE KEYS:`);
          console.log(Object.keys(response.choices[0]));
          
          if (response.choices[0].message) {
            console.log(`\n5️⃣ MESSAGE OBJECT:`);
            console.log(JSON.stringify(response.choices[0].message, null, 2));
            
            console.log(`\n6️⃣ MESSAGE KEYS:`);
            console.log(Object.keys(response.choices[0].message));
          }
        }
        
        // Check all possible locations for content
        console.log(`\n7️⃣ CONTENT EXTRACTION ATTEMPTS:`);
        console.log(`  - response.choices[0].message.content: ${response.choices?.[0]?.message?.content || 'EMPTY/NULL'}`);
        console.log(`  - response.choices[0].message.output: ${(response.choices?.[0]?.message as any)?.output || 'EMPTY/NULL'}`);
        console.log(`  - response.choices[0].message.reasoning: ${(response.choices?.[0]?.message as any)?.reasoning || 'EMPTY/NULL'}`);
        console.log(`  - response.choices[0].message.answer: ${(response.choices?.[0]?.message as any)?.answer || 'EMPTY/NULL'}`);
        console.log(`  - response.choices[0].text: ${(response.choices?.[0] as any)?.text || 'EMPTY/NULL'}`);
        console.log(`  - response.choices[0].output: ${(response.choices?.[0] as any)?.output || 'EMPTY/NULL'}`);
        console.log(`  - response.output: ${(response as any)?.output || 'EMPTY/NULL'}`);
        console.log(`  - response.text: ${(response as any)?.text || 'EMPTY/NULL'}`);
        console.log(`🔴🔴🔴 END GPT-5 DEBUG 🔴🔴🔴\n`);
      }
      
      // Extract content - GPT-5 might use different field names
      let output = '';
      if (config.model.startsWith('gpt-5')) {
        console.log(`\n🟡 ATTEMPTING TO EXTRACT GPT-5 CONTENT...`);
        
        // Try ALL possible fields for GPT-5
        const choice = response.choices?.[0] as any;
        const possibleContents = [
          choice?.message?.content,
          choice?.message?.output,
          choice?.message?.reasoning,
          choice?.message?.answer,
          choice?.message?.response,
          choice?.message?.text,
          choice?.text,
          choice?.output,
          choice?.content,
          (response as any)?.output,
          (response as any)?.text,
          (response as any)?.content
        ];
        
        for (let i = 0; i < possibleContents.length; i++) {
          if (possibleContents[i]) {
            output = possibleContents[i];
            console.log(`✅ FOUND CONTENT at index ${i}: ${output.substring(0, 100)}...`);
            break;
          }
        }
        
        if (!output) {
          console.log(`❌ NO CONTENT FOUND IN ANY EXPECTED LOCATION!`);
          console.log(`Full response for debugging:`, JSON.stringify(response));
        }
      } else {
        output = response.choices[0]?.message?.content || '';
      }
      
      console.log(`\n📊 FINAL OUTPUT LENGTH: ${output.length} characters`);
      
      const finalResult = {
        output,
        latency,
        inputPrompt: `System: ${config.systemPrompt}\nUser: ${config.userPrompt}`
      };
      
      console.log(`\n🎁🎁🎁 CALL OPENAI DIRECT - FINAL RETURN 🎁🎁🎁`);
      console.log(`  - Returning output of length: ${finalResult.output?.length || 0}`);
      console.log(`  - Output exists: ${!!finalResult.output}`);
      console.log(`  - Output preview: ${finalResult.output?.substring(0, 100) || 'EMPTY'}`);
      console.log(`🎁🎁🎁 END CALL OPENAI DIRECT RETURN 🎁🎁🎁\n`);
      
      return finalResult;

    } catch (error) {
      const latency = Date.now() - startTime;
      console.error(`OpenAI direct call error:`, error);
      
      return {
        output: '',
        latency,
        inputPrompt: `System: ${config.systemPrompt}\nUser: ${config.userPrompt}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async processWithAgent(
    agent: AgentConfig,
    rowData: Record<string, any>
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    // Process templates with enhanced context handling
    const processedSystemPrompt = this.processTemplate(agent.systemPrompt, rowData);
    const processedUserPrompt = this.processTemplate(agent.userPrompt, rowData);
    
    try {
      // Special handling for Reference Research step
      if (agent.name === "Reference Research") {
        return await this.processReferenceResearch(agent, rowData);
      }

      // Special handling for Generic Draft Generation step with semantic chunks
      if (agent.name === "Generic Draft Generation") {
        return await this.processGenericDraftGeneration(agent, rowData);
      }

      // Special handling for legacy Response Generation step
      if (agent.name === "Response Generation") {
        // Legacy support - use generic draft generation
        return await this.processGenericDraftGeneration(agent, rowData);
      }

      // Special handling for Tailored RFP Response step (no caching, uses o3)
      if (agent.name === "Tailored RFP Response") {
        return await this.processTailoredResponse(agent, rowData);
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
      const tokensParam = this.getTokensParam(modelToUse, agent.maxTokens || 2000);
      const completionOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: modelToUse,
        messages,
        ...tokensParam,
      };

      // Some models like gpt-4o-search-preview, o3 models, and gpt-5 don't support temperature parameter
      if (!agent.model.includes('search-preview') && !agent.model.startsWith('o3') && !agent.model.startsWith('gpt-5')) {
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
      console.log(`🚀 Starting Enhanced Reference Research with full content processing...`);
      
      // Get contextual question (created by Context Resolution step)
      const contextualQuestion = rowData.FULL_CONTEXTUAL_QUESTION || 
                                rowData[Object.keys(rowData)[0]] || '';
      
      if (!contextualQuestion) {
        throw new Error('No question found in input data');
      }

      console.log(`🔍 Processing contextual question: ${contextualQuestion.substring(0, 150)}...`);
      
      // Extract jobId from the context if available
      const jobId = (rowData as any).jobId;
      
      // Use the enhanced reference research system
      const result = await performEnhancedReferenceResearch(contextualQuestion, jobId);
      
      const latency = Date.now() - startTime;
      
      console.log(`✅ Enhanced reference research completed in ${latency}ms:
      - Processed URLs: ${result.urls.length}
      - URLs with content: ${result.urls.filter(url => url).length}`);
      
      return {
        output: JSON.stringify(result.urls),
        latency,
        inputPrompt: `Enhanced Reference Research for: ${contextualQuestion.substring(0, 100)}...`,
        metadata: {
          model: 'enhanced-semantic-search',
          enhanced: true,
          urlsProcessed: result.urls.length,
          contextualQuestion: contextualQuestion.substring(0, 100) + '...'
        }
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      console.error(`❌ Enhanced reference research failed after ${latency}ms:`, error);
      
      return {
        output: JSON.stringify([]),
        latency,
        inputPrompt: `Enhanced Reference Research failed`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async processGenericDraftGeneration(
    agent: AgentConfig,
    rowData: Record<string, any>
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      console.log(`📝 Processing Generic Draft Generation with semantic chunks...`);
      
      const contextualQuestion = rowData.FULL_CONTEXTUAL_QUESTION || rowData[Object.keys(rowData)[0]] || '';
      const jobId = (rowData as any).jobId;
      
      // Use global broadcast function
      const broadcastJobUpdate = (global as any).broadcastJobUpdate;
      
      if (jobId && broadcastJobUpdate) {
        broadcastJobUpdate(jobId, {
          event: 'processing_log',
          data: {
            step: 'Generic Draft Generation',
            log: `📝 Starting semantic search for relevant content chunks...`
          }
        });
      }
      
      if (!contextualQuestion) {
        throw new Error('No contextual question found in input data');
      }

      // Get relevant content chunks using semantic search
      const relevantChunks = await getRelevantContentChunks(contextualQuestion, 15);
      
      if (jobId && broadcastJobUpdate) {
        broadcastJobUpdate(jobId, {
          event: 'processing_log',
          data: {
            step: 'Generic Draft Generation',
            log: `📊 Found ${relevantChunks.length} relevant content chunks (avg similarity: ${relevantChunks.length > 0 ? (relevantChunks.reduce((sum, chunk) => sum + chunk.similarity, 0) / relevantChunks.length * 100).toFixed(1) + '%' : 'N/A'})`
          }
        });
      }
      
      console.log(`📊 Found ${relevantChunks.length} relevant content chunks for draft generation`);
      
      // Create enhanced context with semantic chunks
      const enhancedContext = relevantChunks.map((chunk, index) => 
        `[Reference ${index + 1}] ${chunk.source}
URL: ${chunk.url}
Content: ${chunk.text}
Relevance Score: ${(chunk.similarity * 100).toFixed(1)}%`
      ).join('\n\n---\n\n');
      
      // Process the template with enhanced data
      const processedPrompt = this.processTemplate(agent.userPrompt, {
        ...rowData,
        SEMANTIC_CONTEXT: enhancedContext,
        RELEVANT_CHUNKS_COUNT: relevantChunks.length.toString(),
        REFERENCE_URLS: relevantChunks.map(chunk => chunk.url).join('\n')
      });
      
      if (jobId && broadcastJobUpdate) {
        broadcastJobUpdate(jobId, {
          event: 'processing_log',
          data: {
            step: 'Generic Draft Generation',
            log: `🤖 Generating draft response using ${agent.model} with ${relevantChunks.length} semantic chunks...`
          }
        });
      }
      
      const result = await this.callOpenAIDirect({
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        userPrompt: processedPrompt,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens
      });
      
      const latency = Date.now() - startTime;
      
      if (jobId && broadcastJobUpdate) {
        broadcastJobUpdate(jobId, {
          event: 'processing_log',
          data: {
            step: 'Generic Draft Generation',
            log: `✅ Generic draft completed in ${latency}ms using ${relevantChunks.length} semantic chunks`
          }
        });
      }
      
      console.log(`✅ Generic draft generation completed in ${latency}ms using ${relevantChunks.length} semantic chunks`);
      
      console.log(`\n📦📦📦 GENERIC DRAFT GENERATION - PREPARING RETURN VALUE 📦📦📦`);
      console.log(`  - result.output exists: ${!!result.output}`);
      console.log(`  - result.output length: ${result.output?.length || 0}`);
      console.log(`  - result.output type: ${typeof result.output}`);
      console.log(`  - result.output preview: ${result.output?.substring(0, 200) || 'EMPTY'}`);
      
      const returnValue = {
        output: result.output,
        latency,
        inputPrompt: processedPrompt,
        metadata: { 
          ...result.metadata,
          semanticChunks: relevantChunks.length,
          avgSimilarity: relevantChunks.length > 0 ? 
            (relevantChunks.reduce((sum: number, chunk: any) => sum + chunk.similarity, 0) / relevantChunks.length).toFixed(3) : 'N/A',
          uniqueUrls: Array.from(new Set(relevantChunks.map((chunk: any) => chunk.url))).length
        }
      };
      
      console.log(`  - returnValue.output length: ${returnValue.output?.length || 0}`);
      console.log(`📦📦📦 END GENERIC DRAFT GENERATION RETURN 📦📦📦\n`);
      
      return returnValue;

    } catch (error) {
      const latency = Date.now() - startTime;
      console.error(`❌ Generic draft generation failed after ${latency}ms:`, error);
      
      return {
        output: '',
        latency,
        inputPrompt: `Generic Draft Generation failed`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async processTailoredResponse(
    agent: AgentConfig,
    rowData: Record<string, any>
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      // Import the tailored response service dynamically
      const { tailoredResponseService } = await import('./tailoredResponse');
      
      // Extract required data
      console.log(`\n🔍🔍🔍 TAILORED RESPONSE - EXTRACTING DATA 🔍🔍🔍`);
      console.log(`Row data keys available: ${Object.keys(rowData).join(', ')}`);
      console.log(`\nChecking each key:`);
      Object.keys(rowData).forEach(key => {
        const value = rowData[key];
        const preview = typeof value === 'string' ? value.substring(0, 100) : JSON.stringify(value);
        console.log(`  - ${key}: ${value ? `${String(value).length} chars` : 'EMPTY/NULL'} | Preview: ${preview}`);
      });
      
      const firstColumnKey = Object.keys(rowData)[0];
      const question = firstColumnKey ? String(rowData[firstColumnKey] || '') : '';
      
      console.log(`\n🎯 Attempting to get Generic Draft Generation:`);
      console.log(`  - rowData["Generic Draft Generation"] exists: ${rowData.hasOwnProperty("Generic Draft Generation")}`);
      console.log(`  - rowData["Generic Draft Generation"] value: ${rowData["Generic Draft Generation"]}`);
      console.log(`  - rowData["Generic Draft Generation"] type: ${typeof rowData["Generic Draft Generation"]}`);
      console.log(`  - rowData["Generic Draft Generation"] length: ${rowData["Generic Draft Generation"]?.length || 0}`);
      
      const genericDraft = String(rowData["Generic Draft Generation"] || '');
      console.log(`  - After String conversion, genericDraft length: ${genericDraft.length}`);
      console.log(`  - genericDraft preview: ${genericDraft.substring(0, 200)}`);
      
      const references = String(rowData["Reference Research"] || '');
      console.log(`\n  - Reference Research length: ${references.length}`);
      
      // Get RFP-specific data from job context (this would be passed from the job processor)
      const rfpInstructions = String(rowData["RFP_INSTRUCTIONS"] || '');
      const additionalDocuments = rowData["ADDITIONAL_DOCUMENTS"] || [];
      
      if (!question) {
        console.log(`❌ NO QUESTION FOUND!`);
        throw new Error('No question found in input data');
      }

      if (!genericDraft) {
        console.log(`❌❌❌ NO GENERIC DRAFT FOUND! This is the error causing the failure!`);
        console.log(`Final check - all rowData keys: ${JSON.stringify(Object.keys(rowData))}`);
        throw new Error('No generic draft found from previous step');
      }
      
      console.log(`✅ All required data found, proceeding with tailored response generation`);

      console.log(`🎯 Using tailored response generation with ${agent.model} for: ${question.substring(0, 100)}...`);
      
      // Use the tailored response service (no caching)
      const result = await tailoredResponseService.generateTailoredResponse({
        question,
        genericDraft,
        references,
        rfpInstructions,
        additionalDocuments,
        agent
      });
      
      const latency = Date.now() - startTime;
      
      console.log(`🆕 Generated tailored response in ${latency}ms with ${result.metadata.documentsUsed} documents`);

      return {
        output: result.response,
        latency,
        inputPrompt: `Tailored RFP Response for: ${question}`,
        metadata: {
          ...result.metadata,
          questionLength: question.length,
          genericDraftLength: genericDraft.length,
          rfpInstructionsLength: rfpInstructions.length
        }
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      console.error(`❌ Tailored response generation failed after ${latency}ms:`, error);
      
      return {
        output: '',
        latency,
        inputPrompt: `Tailored RFP Response failed`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  processTemplate(template: string, data: Record<string, any>): string {
    // Handle handlebars-style conditional blocks for PREVIOUS_CONTEXT
    let processed = template;
    
    // Check if PREVIOUS_CONTEXT exists
    const hasContext = data.PREVIOUS_CONTEXT?.referencedQuestions?.length > 0;
    
    // Process {{#if PREVIOUS_CONTEXT}} blocks
    const ifRegex = /\{\{#if PREVIOUS_CONTEXT\}\}([\s\S]*?)\{\{\/if\}\}/g;
    processed = processed.replace(ifRegex, (match, content) => {
      return hasContext ? content : '';
    });
    
    // Process {{#each PREVIOUS_CONTEXT.referencedQuestions}} blocks
    const eachRegex = /\{\{#each PREVIOUS_CONTEXT\.referencedQuestions\}\}([\s\S]*?)\{\{\/each\}\}/g;
    processed = processed.replace(eachRegex, (match, content) => {
      if (!hasContext) return '';
      
      return data.PREVIOUS_CONTEXT.referencedQuestions.map((question: any) => {
        let questionContent = content;
        questionContent = questionContent.replace(/\{\{questionNumber\}\}/g, question.questionNumber);
        questionContent = questionContent.replace(/\{\{question\}\}/g, question.question);
        questionContent = questionContent.replace(/\{\{referenceResearch\}\}/g, question.referenceResearch);
        questionContent = questionContent.replace(/\{\{tailoredResponse\}\}/g, question.tailoredResponse);
        questionContent = questionContent.replace(/\{\{referencedAs\}\}/g, question.referencedAs);
        return questionContent;
      }).join('\n');
    });
    
    // Process PREVIOUS_CONTEXT object references
    if (hasContext) {
      processed = processed.replace(/\{\{PREVIOUS_CONTEXT\.contextNote\}\}/g, data.PREVIOUS_CONTEXT.contextNote || '');
    }
    
    // Now process regular placeholders
    return this.replacePlaceholders(processed, data);
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
