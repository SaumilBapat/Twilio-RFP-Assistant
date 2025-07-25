import { db } from "./db";
import { pipelines } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seedDatabase() {
  console.log('Seeding database...');
  
  // Create default pipeline
  const defaultPipeline = {
    name: "RFP Research & Response Pipeline",
    description: "A two-step pipeline for researching and composing RFP responses",
    steps: [
      {
        name: "Research Agent",
        model: "gpt-4o",
        temperature: 0,
        maxTokens: 1000,
        tools: ["web_search"],
        systemPrompt: "You are a research assistant for Twilio. Your job is to research information relevant to the question being asked.",
        userPrompt: "Research the following question and provide relevant information: {{Question}}"
      },
      {
        name: "Response Agent",
        model: "gpt-4o",
        temperature: 0.2,
        maxTokens: 2000,
        tools: [],
        systemPrompt: "You are a professional RFP response writer for Twilio. Write clear, accurate, and compelling responses.",
        userPrompt: "Based on the research provided, write a professional response to this question: {{Question}}"
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
      console.log('✓ Default pipeline already exists');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

// Run seed if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase().then(() => {
    console.log('Seeding complete');
    process.exit(0);
  }).catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
}

export { seedDatabase };