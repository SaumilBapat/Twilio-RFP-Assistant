import { db } from "./db";
import { pipelines } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seedDatabase() {
  console.log('Seeding database...');
  
  // Create default pipeline with research and response steps
  const defaultPipeline = {
    name: "RFP Research & Response Pipeline", 
    description: "A two-step pipeline for researching and crafting RFP responses",
    steps: [
      {
        name: "Research & Analysis",
        model: "gpt-4o",
        temperature: 0.1,
        maxTokens: 1500,
        tools: [],
        systemPrompt: "You are a research assistant specialized in RFP analysis. Research the question thoroughly and provide relevant background information, industry standards, and key points to address.",
        userPrompt: "Research and analyze this RFP question: {{FIRST_COLUMN}}\n\nProvide relevant background information, industry standards, and key points that should be addressed in a comprehensive response."
      },
      {
        name: "Response Generation",
        model: "gpt-4o",
        temperature: 0.3,
        maxTokens: 2000,
        tools: [],
        systemPrompt: "You are a professional RFP response writer. Create clear, compelling, and comprehensive responses based on research provided.",
        userPrompt: "Based on this research: {{Research & Analysis}}\n\nWrite a professional, comprehensive response to this RFP question: {{FIRST_COLUMN}}\n\nEnsure the response is well-structured, addresses all key points, and demonstrates expertise."
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