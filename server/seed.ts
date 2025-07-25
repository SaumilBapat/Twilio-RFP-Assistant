import { db } from "./db";
import { pipelines } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seedDatabase() {
  console.log('Seeding database...');
  
  // Create default pipeline with search and refinement steps
  const defaultPipeline = {
    name: "RFP Research & Response Pipeline",
    description: "A two-step pipeline using search preview and answer refinement",
    steps: [
      {
        name: "Reference Search",
        model: "gpt-4o-search-preview",
        temperature: 0.0,
        maxTokens: 1000,
        tools: [],
        systemPrompt: "You are a research assistant. Find relevant references and quotes for RFP questions.",
        userPrompt: "Please find relevant references and quotes for the following RFP question: {{FIRST_COLUMN}}"
      },
      {
        name: "Answer Refinement", 
        model: "gpt-3.5-turbo",
        temperature: 0.7,
        maxTokens: 2000,
        tools: [],
        systemPrompt: "You are a helpful assistant. Provide a thorough answer and list references at the end.",
        userPrompt: "Based on the research: {{Reference Search}}\n\nAnswer the RFP question: {{FIRST_COLUMN}} and include citations to the above references."
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