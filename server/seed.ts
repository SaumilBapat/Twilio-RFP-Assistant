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
        tools: ["web_search"],
        systemPrompt: "You are a research specialist for RFP responses. Find relevant, current references and extract key quotes that support answering the question. Focus on finding official documentation, recent articles, and authoritative sources with specific data points, metrics, and factual information.",
        userPrompt: "Research this RFP question and gather relevant references: {{FIRST_COLUMN}}\n\nFind and provide:\n1. 3-6 relevant URLs from authoritative sources (official docs, recent articles, industry reports)\n2. Key quotes and data points from each source\n3. Specific metrics, compliance information, or technical details\n4. Publication dates and source credibility\n\nFormat as:\nREFERENCES:\n[URL 1]\nQuote: \"[relevant quote with specific data]\"\nKey points: [bullet points of important info]\n\n[URL 2]\n[etc...]"
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