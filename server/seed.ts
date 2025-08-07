import { db } from "./db";
import { pipelines } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seedDatabase() {
  console.log('Seeding database...');
  
  // Create default pipeline with 3-step RFP process: Research, Generic Draft, Tailored Response
  const defaultPipeline = {
    name: "Advanced RFP Research & Response Pipeline", 
    description: "A three-step pipeline: Reference research with caching, generic draft with caching, and tailored company-specific responses",
    steps: [
      {
        name: "Reference Research",
        model: "gpt-5",
        temperature: 0.1,
        maxTokens: 2000,
        tools: ["reference_cache", "link_validation"],
        systemPrompt: "You are a URL discovery system that finds working URLs from the Twilio ecosystem. You return only processed URLs that contain relevant content - no summaries, quotes, or descriptions.",
        userPrompt: "Using enhanced semantic search, find and process all relevant URLs from the Twilio ecosystem for: {{FULL_CONTEXTUAL_QUESTION}}\n\nThis step will:\n1. Search for relevant working URLs using GPT-4o\n2. Scrape and process full page content from each URL\n3. Create semantic chunks and embeddings for each page\n4. Perform vector similarity search to find the most relevant content chunks\n5. Return the processed URLs that contain relevant information\n\nReturn ONLY a simple array of the successfully processed URLs that contain relevant content for this question."
      },
      {
        name: "Generic Draft Generation",
        model: "gpt-5",
        temperature: 0.3,
        maxTokens: 2000,
        tools: ["response_cache"],
        systemPrompt: "You are a professional RFP response writer creating generic, comprehensive draft responses using ONLY the provided Twilio ecosystem research. You must NEVER add external sources beyond what is provided in the Reference Research input. Focus exclusively on Twilio's capabilities and resources.",
        userPrompt: "{{#if PREVIOUS_CONTEXT}}\n**🔗 CONTEXTUAL DEPENDENCY:**\n{{PREVIOUS_CONTEXT.contextNote}}\n\n**Build upon these previous answers:**\n{{#each PREVIOUS_CONTEXT.referencedQuestions}}\n- **Question {{questionNumber}}:** {{question}}\n- **Previous Response:** {{tailoredResponse}}\n{{/each}}\n\n**IMPORTANT:** This question references previous answers. Ensure your response builds logically on the previously described solutions and maintains consistency.\n{{/if}}\n\nCreate a comprehensive, professional draft response using the semantically relevant content chunks found through enhanced search.\n\n**Question:** {{FULL_CONTEXTUAL_QUESTION}}\n\n**Semantic Content Context ({{RELEVANT_CHUNKS_COUNT}} relevant chunks found):**\n{{SEMANTIC_CONTEXT}}\n\n**Reference URLs:**\n{{REFERENCE_URLS}}\n\n**CRITICAL REQUIREMENTS:**\n\n1. **SEMANTIC CONTENT USAGE:** Use EXCLUSIVELY the content provided in the semantic context above. Each chunk has been selected for relevance to your question through vector similarity search.\n\n2. **COMPREHENSIVE SYNTHESIS:** Create a detailed, well-structured response that:\n   - Synthesizes information from multiple content chunks\n   - Addresses all aspects of the question with specific technical details\n   - Provides concrete examples and implementation guidance\n   - Maintains logical flow and coherence\n\n3. **REFERENCE INTEGRATION:** Naturally integrate the semantically relevant content chunks to create a unified response. Reference the source URLs when mentioning specific features or capabilities.\n\n4. **PROFESSIONAL TONE:** Write in a professional, confident tone appropriate for enterprise RFP responses.\n\n5. **STRUCTURED RESPONSE:** Organize content logically with clear sections and smooth transitions between concepts.\n\n6. **REFERENCES SECTION:** End with a 'References:' section listing the URLs from the Reference URLs section above.\n\n**Enhancement Note:** This semantic search approach ensures the most relevant content is selected based on conceptual similarity rather than simple keyword matching, providing higher quality, more contextually appropriate responses.\n\nThis is a generic draft that will be tailored with company-specific information in the final step."
      },
      {
        name: "Tailored RFP Response",
        model: "gpt-5",
        temperature: 0.4,
        maxTokens: 3000,
        tools: ["no_cache", "additional_documents", "rfp_instructions"],
        systemPrompt: "You are an expert RFP response specialist creating final, submission-ready responses. Transform the generic draft into a polished, professional response that can be directly submitted to the client. Do NOT include any meta-text, headers, or formatting indicators.",
        userPrompt: "{{#if PREVIOUS_CONTEXT}}\n**🔗 QUESTION DEPENDENCY CONTEXT:**\n{{PREVIOUS_CONTEXT.contextNote}}\n\n**Referenced Previous Questions & Responses:**\n{{#each PREVIOUS_CONTEXT.referencedQuestions}}\n- **Question {{questionNumber}}:** {{question}}\n- **Previous Final Response:** {{tailoredResponse}}\n- **How it's referenced:** \"{{referencedAs}}\"\n{{/each}}\n\n**CRITICAL:** This question builds upon previous responses. Ensure your answer references and builds on the specific solutions, implementations, or approaches mentioned in the previous questions above. Maintain consistency and logical flow.\n{{/if}}\n\nTransform this generic draft into a final RFP response:\n\n**Question:** {{FULL_CONTEXTUAL_QUESTION}}\n\n**Validated References:** {{Reference Research}}\n\n**Generic Draft:** {{Generic Draft Generation}}\n\n**RFP Instructions:** {{RFP_INSTRUCTIONS}}\n\n**Additional Documents:** {{ADDITIONAL_DOCUMENTS}}\n\n**CRITICAL REQUIREMENTS:**\n- Provide ONLY the final response content - no headers, labels, or meta-text\n- Do NOT start with \"Company Overview\", \"Response to RFP Question:\", or similar headers\n- Do NOT include section labels like \"1. Direct Answer\" or \"Our Response:\"\n- Write as if you are directly answering the client's question\n- Customize with company-specific details from additional documents\n- Follow RFP instructions for tone and requirements\n- Use EXCLUSIVELY the specific reference URLs from the \"Validated References\" section above\n- Do NOT generate or add any new reference URLs beyond those provided\n- Do NOT add any external sources (HIMSS, Ponemon, PMI, etc.)\n- MUST include a \"References:\" section at the bottom with the EXACT URLs from the Validated References section\n- Ensure professional, client-ready language\n\n**REFERENCE POLICY:** You MUST use only the specific reference URLs provided in the \"Validated References\" section. These URLs have been researched and validated specifically for this question. Do not generate generic Twilio URLs - use the exact ones provided.\n\nOutput the clean, final response text ending with a References section containing the EXACT validated reference URLs from above."
      }
    ],
    isDefault: true
  };

  try {
    // Check if default pipeline already exists
    const existing = await db.select().from(pipelines).where(eq(pipelines.isDefault, true));
    
    if (existing.length === 0) {
      await db.insert(pipelines).values(defaultPipeline);
      console.log('✓ Default pipeline created');
    } else {
      // Update existing pipeline with new structure
      await db.update(pipelines)
        .set({
          name: defaultPipeline.name,
          description: defaultPipeline.description,
          steps: defaultPipeline.steps
        })
        .where(eq(pipelines.isDefault, true));
      console.log('✓ Default pipeline updated with new workflow');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

// Run seed if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase().then(() => {
    console.log('Seeding complete');
    // Removed process.exit(0) to prevent application termination
  }).catch((error) => {
    console.error('Seeding failed:', error);
    // Only exit on failure when called directly
    process.exit(1);
  });
}

export { seedDatabase };