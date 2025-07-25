/**
 * Tailored RFP Response Service
 * Creates company-specific responses using o3 model with no caching
 * Incorporates RFP instructions and additional documents
 */

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface TailoredResponseConfig {
  question: string;
  genericDraft: string;
  rfpInstructions?: string;
  additionalDocuments?: Array<{fileName: string, content: string}>;
  agent: any;
}

interface TailoredResponseResult {
  response: string;
  metadata: {
    model: string;
    latency: number;
    usage?: any;
    documentsUsed: number;
    instructionsLength: number;
  };
}

export class TailoredResponseService {

  async generateTailoredResponse(config: TailoredResponseConfig): Promise<TailoredResponseResult> {
    console.log(`🎯 Generating tailored response using ${config.agent.model} for: ${config.question.substring(0, 100)}...`);
    
    const startTime = Date.now();
    
    try {
      // Prepare the context with all available information
      const context = this.prepareContext(config);
      
      // Replace placeholders in the agent's prompts
      const systemPrompt = this.replacePlaceholders(config.agent.systemPrompt, {
        RFP_INSTRUCTIONS: config.rfpInstructions || '',
        ADDITIONAL_DOCUMENTS: this.formatAdditionalDocuments(config.additionalDocuments),
        FIRST_COLUMN: config.question,
        'Generic Draft Generation': config.genericDraft
      });

      const userPrompt = this.replacePlaceholders(config.agent.userPrompt, {
        RFP_INSTRUCTIONS: config.rfpInstructions || '',
        ADDITIONAL_DOCUMENTS: this.formatAdditionalDocuments(config.additionalDocuments),
        FIRST_COLUMN: config.question,
        'Generic Draft Generation': config.genericDraft
      });

      console.log(`🚀 Using ${config.agent.model} with ${config.additionalDocuments?.length || 0} additional documents`);

      // Helper function to determine correct token parameter based on model
      const getTokensParam = (model: string, maxTokens: number) => {
        // o3 models require max_completion_tokens instead of max_tokens
        if (model.startsWith('o3')) {
          return { max_completion_tokens: maxTokens };
        }
        return { max_tokens: maxTokens };
      };

      const tokensParam = getTokensParam(config.agent.model, config.agent.maxTokens || 3000);

      const response = await openai.chat.completions.create({
        model: config.agent.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: config.agent.temperature || 0.4,
        ...tokensParam,
      });

      const output = response.choices[0]?.message?.content || '';
      const latency = Date.now() - startTime;

      console.log(`✅ Tailored response generated in ${latency}ms using ${config.agent.model}`);

      return {
        response: output,
        metadata: {
          model: config.agent.model,
          latency,
          usage: response.usage,
          documentsUsed: config.additionalDocuments?.length || 0,
          instructionsLength: config.rfpInstructions?.length || 0
        }
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      console.error(`❌ Tailored response generation failed after ${latency}ms:`, error);
      throw error;
    }
  }

  private prepareContext(config: TailoredResponseConfig): string {
    let context = `Question: ${config.question}\n\n`;
    context += `Generic Draft:\n${config.genericDraft}\n\n`;
    
    if (config.rfpInstructions) {
      context += `RFP Instructions:\n${config.rfpInstructions}\n\n`;
    }
    
    if (config.additionalDocuments && config.additionalDocuments.length > 0) {
      context += `Additional Documents:\n`;
      config.additionalDocuments.forEach((doc, index) => {
        context += `Document ${index + 1}: ${doc.fileName}\n${doc.content}\n\n`;
      });
    }
    
    return context;
  }

  private formatAdditionalDocuments(docs?: Array<{fileName: string, content: string}>): string {
    if (!docs || docs.length === 0) {
      return "No additional documents provided.";
    }
    
    return docs.map((doc, index) => 
      `**Document ${index + 1}: ${doc.fileName}**\n${doc.content}`
    ).join('\n\n');
  }

  private replacePlaceholders(template: string, data: Record<string, any>): string {
    let result = template;
    
    // Replace all placeholders
    Object.entries(data).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      result = result.replaceAll(placeholder, String(value || ''));
    });
    
    return result;
  }

  getDefaultRfpInstructions(): string {
    return `# Default RFP Response Instructions

## Company Voice & Tone
- Write in first person as Twilio ("We provide...", "Our platform...")
- Use confident, professional tone that demonstrates expertise
- Emphasize innovation, reliability, and customer success

## Key Messaging Points
- Highlight Twilio's global scale and reliability (99.95% uptime)
- Emphasize developer-friendly APIs and extensive documentation
- Mention enterprise-grade security and compliance certifications
- Include specific metrics and customer success stories when relevant

## Response Structure
1. **Direct Answer**: Address the question clearly and concisely
2. **Twilio's Approach**: Explain how Twilio specifically handles this requirement
3. **Key Benefits**: List 3-4 main advantages of Twilio's solution
4. **Supporting Evidence**: Include metrics, certifications, or case studies
5. **Call to Action**: Invite further discussion or demonstration

## Compliance & Security Focus
- Always mention relevant security certifications (SOC 2, ISO 27001, GDPR compliance)
- Reference Twilio's Trust Center for detailed security information
- Highlight data residency options and privacy controls
- Mention audit capabilities and transparency reports

## Technical Details
- Include specific API capabilities when relevant
- Mention SDKs and supported programming languages
- Reference Twilio's extensive partner ecosystem
- Highlight scalability and global infrastructure

Please customize these instructions based on the specific RFP requirements and your company's unique value propositions.`;
  }
}

export const tailoredResponseService = new TailoredResponseService();