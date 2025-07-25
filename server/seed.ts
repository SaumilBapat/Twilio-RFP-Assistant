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
        model: "gpt-4o",
        temperature: 0.1,
        maxTokens: 2000,
        tools: ["reference_cache", "link_validation"],
        systemPrompt: "You are an intelligent research specialist that uses cached reference data and validates links. When provided with references, analyze their relevance and create comprehensive research summaries with validated source citations.",
        userPrompt: "Find TWILIO-SPECIFIC references for this RFP question: {{FIRST_COLUMN}}\n\nNote: The backend has already checked for cached results. You're only called when new research is needed.\n\nReturn your response as a JSON object with this structure:\n{\n  \"references\": [\n    {\n      \"url\": \"https://twilio.com/resource\",\n      \"title\": \"Resource Title\",\n      \"description\": \"Brief description of why this Twilio resource is relevant\"\n    }\n  ]\n}\n\n**IMPORTANT: ONLY return Twilio-specific content from these sources:**\n- Twilio official website (twilio.com) pages and solutions\n- Twilio customer stories and case studies\n- Twilio blog posts and thought leadership\n- Twilio developer documentation and guides\n- Twilio product pages and feature descriptions\n- Twilio security and compliance pages\n- Twilio partner and integration resources\n\n**Examples of good Twilio URLs:**\n- https://www.twilio.com/solutions/healthcare\n- https://www.twilio.com/customers/stories\n- https://www.twilio.com/blog/\n- https://www.twilio.com/docs/\n- https://www.twilio.com/security\n\nDo NOT include generic industry resources, government sites, or non-Twilio content. Focus exclusively on demonstrating Twilio's capabilities, experience, and solutions. The backend will validate all URLs after you provide them."
      },
      {
        name: "Generic Draft Generation",
        model: "gpt-4o",
        temperature: 0.3,
        maxTokens: 2000,
        tools: ["response_cache"],
        systemPrompt: "You are a professional RFP response writer creating generic, comprehensive draft responses. Use research and references to create well-structured responses with data points, metrics, and citations. This draft will be refined in the next step for company-specific needs.",
        userPrompt: "Based on the research and references: {{Reference Research}}\n\nWrite a comprehensive generic draft response to this RFP question: {{FIRST_COLUMN}}\n\nRequirements:\n- Include specific data points and metrics from the research\n- Reference credible sources to support claims\n- Address all aspects of the question comprehensively\n- Use professional, clear language\n- Structure for easy customization in next step\n- End with a 'References:' section listing key URLs\n\nThis is a generic draft that will be tailored with company-specific information in the final step."
      },
      {
        name: "Tailored RFP Response",
        model: "o3-mini",
        temperature: 0.4,
        maxTokens: 3000,
        tools: ["no_cache", "additional_documents", "rfp_instructions"],
        systemPrompt: "You are an expert RFP response specialist creating company-specific, tailored responses. Use the generic draft as foundation, incorporate specific company information from additional documents, and follow custom RFP instructions to create compelling, personalized responses that directly address the client's needs.",
        userPrompt: "Create a tailored RFP response using:\n\n**Question:** {{FIRST_COLUMN}}\n\n**Generic Draft:** {{Generic Draft Generation}}\n\n**RFP Instructions:** {{RFP_INSTRUCTIONS}}\n\n**Additional Documents:** {{ADDITIONAL_DOCUMENTS}}\n\nRequirements:\n- Customize the generic draft with company-specific details\n- Incorporate relevant information from additional documents\n- Follow the specific RFP instructions provided\n- Maintain professional tone while being company-specific\n- Address client's unique requirements and context\n- Keep all citations and references from the draft\n- Ensure response directly matches RFP evaluation criteria\n\nThis is the final, tailored response ready for submission."
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