import OpenAI from 'openai';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ContextResolutionResult {
  fullContextualQuestion: string;
  hasReferences: boolean;
  referencedQuestions: number[];
  reasoning: string;
}

export class ContextResolutionService {
  async resolveQuestionContext(
    allQuestions: Array<{questionNumber: number, question: string}>,
    currentQuestionNumber: number
  ): Promise<ContextResolutionResult> {
    const currentQuestion = allQuestions.find(q => q.questionNumber === currentQuestionNumber);
    if (!currentQuestion) {
      throw new Error(`Question ${currentQuestionNumber} not found`);
    }

    // If this is the first question, no context needed
    if (currentQuestionNumber === 1) {
      return {
        fullContextualQuestion: currentQuestion.question,
        hasReferences: false,
        referencedQuestions: [],
        reasoning: "First question requires no additional context"
      };
    }

    const previousQuestions = allQuestions
      .filter(q => q.questionNumber < currentQuestionNumber)
      .sort((a, b) => a.questionNumber - b.questionNumber);

    const systemPrompt = `You are an expert RFP question analyzer. Your task is to determine if a question references or builds upon previous questions, and if so, create a fully self-contained version that includes all necessary context.

CRITICAL: You must return valid JSON in exactly this format:
{
  "fullContextualQuestion": "string",
  "hasReferences": boolean,
  "referencedQuestions": [numbers],
  "reasoning": "string"
}`;

    const userPrompt = `Analyze this RFP question to determine if it references previous questions and create a fully contextual version.

CURRENT QUESTION (#${currentQuestionNumber}):
"${currentQuestion.question}"

PREVIOUS QUESTIONS:
${previousQuestions.map(q => `${q.questionNumber}. ${q.question}`).join('\n')}

TASK:
1. Determine if the current question references, builds upon, or depends on any previous questions
2. If YES: Create a "fullContextualQuestion" that incorporates all necessary context from previous questions to make it completely self-contained
3. If NO: Return the original question as the "fullContextualQuestion"

EXAMPLES OF REFERENCES TO DETECT:
- Explicit: "Q4", "Question 4", "the CCaaS implementation from Q4"
- Implicit: "the solution mentioned above", "your previous answer", "that approach"
- Contextual: "provide more details", "expand on that", "be more specific about"
- Implementation-specific: "the platform you recommended", "that technology", "those capabilities"

GUIDELINES FOR FULL CONTEXTUAL QUESTIONS:
- Include specific technologies, platforms, or solutions mentioned in referenced questions
- Incorporate key context that makes the question standalone
- Maintain the original intent and scope
- Keep professional RFP language
- Don't make assumptions about specific implementations unless clearly stated in previous questions

Return JSON with your analysis.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 1000
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      // Validate the response structure
      if (!result.fullContextualQuestion || typeof result.hasReferences !== 'boolean') {
        throw new Error('Invalid response format from OpenAI');
      }

      return {
        fullContextualQuestion: result.fullContextualQuestion,
        hasReferences: result.hasReferences,
        referencedQuestions: Array.isArray(result.referencedQuestions) ? result.referencedQuestions : [],
        reasoning: result.reasoning || 'No reasoning provided'
      };

    } catch (error) {
      console.error('Context resolution failed:', error);
      
      // Fallback to original question if LLM fails
      return {
        fullContextualQuestion: currentQuestion.question,
        hasReferences: false,
        referencedQuestions: [],
        reasoning: `Context resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export const contextResolutionService = new ContextResolutionService();