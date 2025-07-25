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
        systemPrompt: "You are a Twilio ecosystem research specialist. You MUST ONLY find references from Twilio ecosystem domains: twilio.com, segment.com, and sendgrid.com. These are all Twilio companies. Do NOT suggest any competitors like Genesys, Cisco, Five9, NICE, Amazon Connect, or any other non-Twilio sources. Focus exclusively on Twilio ecosystem capabilities, solutions, and resources.",
        userPrompt: "**CRITICAL: You must ONLY return Twilio ecosystem URLs - NO competitors allowed!**\n\nFind TWILIO ECOSYSTEM references for: {{FIRST_COLUMN}}\n\nReturn JSON with this EXACT structure:\n{\n  \"references\": [\n    {\n      \"url\": \"https://www.twilio.com/[specific-page]\",\n      \"title\": \"Twilio [Solution/Feature] Title\",\n      \"description\": \"How this Twilio resource addresses the question\"\n    }\n  ]\n}\n\n**MANDATORY REQUIREMENTS:**\n✅ ALL URLs MUST be from Twilio ecosystem:\n  - https://www.twilio.com/ (main Twilio site)\n  - https://segment.com/ (Twilio acquisition)\n  - https://sendgrid.com/ (Twilio acquisition)\n❌ NEVER include: Genesys, Cisco, Five9, NICE, Amazon Connect, or ANY competitor\n❌ NEVER include: Government sites, industry standards, or generic resources\n\n**ONLY search these Twilio ecosystem areas:**\n- https://www.twilio.com/solutions/ (industry solutions)\n- https://www.twilio.com/products/ (product pages)\n- https://www.twilio.com/customers/ (customer stories)\n- https://www.twilio.com/blog/ (thought leadership)\n- https://www.twilio.com/docs/ (documentation)\n- https://www.twilio.com/security/ (compliance/security)\n- https://segment.com/docs/ (customer data platform)\n- https://segment.com/blog/ (CDP insights)\n- https://sendgrid.com/solutions/ (email solutions)\n- https://sendgrid.com/blog/ (email best practices)\n\n**Example URLs for different topics:**\n- Contact Center: https://www.twilio.com/products/flex\n- Customer Data: https://segment.com/product/\n- Email/Communications: https://sendgrid.com/solutions/\n\nThis is for a Twilio RFP response - demonstrate Twilio ecosystem capabilities ONLY!"
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