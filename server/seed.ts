import { db } from "./db";
import { pipelines } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seedDatabase() {
  console.log('Seeding database...');
  
  // Create default pipeline with reference gathering and response generation
  const defaultPipeline = {
    name: "RFP Research & Response Pipeline", 
    description: "A two-step pipeline for gathering references and crafting RFP responses with citations",
    steps: [
      {
        name: "Reference Research",
        model: "gpt-4o",
        temperature: 0.1,
        maxTokens: 2000,
        tools: ["reference_cache", "link_validation"],
        systemPrompt: "You are an intelligent research specialist that uses cached reference data and validates links. When provided with references, analyze their relevance and create comprehensive research summaries with validated source citations.",
        userPrompt: "Find and validate authoritative references for this RFP question: {{FIRST_COLUMN}}\n\nThis step uses intelligent caching and link validation to:\n1. Check for similar questions in the reference cache using cosine similarity\n2. Validate all reference URLs to ensure they return 200 status\n3. Generate new references only if no similar cached results exist\n4. Format results with validation status\n\nProvide verified references with:\n- ✅ Validated working links\n- 📚 Authoritative sources (official docs, whitepapers, compliance guides)\n- 🎯 Relevance to the specific question\n- ⚠️ Clear marking of any unverified sources\n\nThe system automatically handles caching and validation - you will receive pre-processed reference data."
      },
      {
        name: "Response Generation",
        model: "gpt-4o",
        temperature: 0.3,
        maxTokens: 2000,
        tools: [],
        systemPrompt: "You are a professional RFP response writer. Create compelling, well-structured responses using the research and references provided. Include specific data points, metrics, and citations. Write in a professional, third-person tone suitable for business proposals.",
        userPrompt: "Based on the research and references: {{Reference Research}}\n\nWrite a comprehensive response to this RFP question: {{FIRST_COLUMN}}\n\nRequirements:\n- Include specific data points and metrics from the research\n- Reference credible sources to support claims\n- Address all aspects of the question\n- Use professional, clear language\n- End with a 'References:' section listing the key URLs cited\n\nEnsure the response demonstrates expertise and builds confidence in the capabilities being described."
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