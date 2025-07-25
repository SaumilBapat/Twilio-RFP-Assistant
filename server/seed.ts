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
        systemPrompt: "You are a professional RFP response writer creating generic, comprehensive draft responses using ONLY the provided Twilio ecosystem research. You must NEVER add external sources beyond what is provided in the Reference Research input. Focus exclusively on Twilio's capabilities and resources.",
        userPrompt: "Based EXCLUSIVELY on the research and references: {{Reference Research}}\n\nWrite a comprehensive generic draft response to this RFP question: {{FIRST_COLUMN}}\n\n**CRITICAL REQUIREMENTS:**\n- Use ONLY the provided Twilio ecosystem references - NO external sources allowed\n- Do NOT add references to HIMSS, Ponemon Institute, PMI, or any non-Twilio sources\n- Do NOT create fictional metrics or case studies\n- Include specific data points ONLY from the provided Twilio research\n- Address all aspects using Twilio's ecosystem capabilities\n- Use professional, clear language focused on Twilio solutions\n- End with a 'References:' section listing ONLY the provided Twilio/Segment/SendGrid URLs\n\n**MANDATORY:** All citations and references must come from the Reference Research input. Do not generate or add any external sources.\n\nThis is a generic draft that will be tailored with company-specific information in the final step."
      },
      {
        name: "Tailored RFP Response",
        model: "o3-mini",
        temperature: 0.4,
        maxTokens: 3000,
        tools: ["no_cache", "additional_documents", "rfp_instructions"],
        systemPrompt: "You are an expert RFP response specialist creating final, submission-ready responses. Transform the generic draft into a polished, professional response that can be directly submitted to the client. Do NOT include any meta-text, headers, or formatting indicators.",
        userPrompt: "Transform this generic draft into a final RFP response:\n\n**Question:** {{FIRST_COLUMN}}\n\n**Validated References:** {{Reference Research}}\n\n**Generic Draft:** {{Generic Draft Generation}}\n\n**RFP Instructions:** {{RFP_INSTRUCTIONS}}\n\n**Additional Documents:** {{ADDITIONAL_DOCUMENTS}}\n\n**CRITICAL REQUIREMENTS:**\n- Provide ONLY the final response content - no headers, labels, or meta-text\n- Do NOT start with \"Company Overview\", \"Response to RFP Question:\", or similar headers\n- Do NOT include section labels like \"1. Direct Answer\" or \"Our Response:\"\n- Write as if you are directly answering the client's question\n- Customize with company-specific details from additional documents\n- Follow RFP instructions for tone and requirements\n- Use EXCLUSIVELY the specific reference URLs from the \"Validated References\" section above\n- Do NOT generate or add any new reference URLs beyond those provided\n- Do NOT add any external sources (HIMSS, Ponemon, PMI, etc.)\n- MUST include a \"References:\" section at the bottom with the EXACT URLs from the Validated References section\n- Ensure professional, client-ready language\n\n**REFERENCE POLICY:** You MUST use only the specific reference URLs provided in the \"Validated References\" section. These URLs have been researched and validated specifically for this question. Do not generate generic Twilio URLs - use the exact ones provided.\n\nOutput the clean, final response text ending with a References section containing the EXACT validated reference URLs from above."
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