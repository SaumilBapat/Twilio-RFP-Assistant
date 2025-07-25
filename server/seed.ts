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
        systemPrompt: "You are a Twilio ecosystem research specialist. You MUST find references from ALL THREE Twilio ecosystem domains equally: twilio.com, sendgrid.com, and segment.com. These are all part of the Twilio family. Include sources from each domain when relevant to the question. Do NOT suggest any competitors like Genesys, Cisco, Five9, NICE, Amazon Connect, or any other non-Twilio sources. Focus exclusively on the complete Twilio ecosystem capabilities.",
        userPrompt: "**CRITICAL: You must find AT LEAST 5 specific, working URLs from ALL THREE Twilio ecosystem domains that directly address this question!**\n\n{{#if PREVIOUS_CONTEXT}}\n**🔗 CROSS-QUESTION DEPENDENCY DETECTED:**\n{{PREVIOUS_CONTEXT.contextNote}}\n\n**Previous Question Context:**\n{{#each PREVIOUS_CONTEXT.referencedQuestions}}\n- **Question {{questionNumber}}:** {{question}}\n- **Previous Research:** {{referenceResearch}}\n- **Previous Response:** {{tailoredResponse}}\n- **Referenced as:** \"{{referencedAs}}\"\n{{/each}}\n\n**IMPORTANT:** This question builds upon previous answers. Use the context above to find references that specifically support the continuation of the previously discussed solutions/implementations.\n{{/if}}\n\nFind SPECIFIC references from the complete Twilio ecosystem for: {{FIRST_COLUMN}}\n\nReturn JSON with EXACTLY this structure (minimum 5 references from twilio.com, sendgrid.com, AND segment.com):\n{\n  \"references\": [\n    {\n      \"Reference_URL\": \"https://www.twilio.com/*\" OR \"https://sendgrid.com/*\" OR \"https://segment.com/*\",\n      \"Reference_URL_Summary\": \"Detailed summary of how this resource directly addresses the question\",\n      \"Reference_URL_Quotes\": [\n        \"Key quote or data point from this resource that supports the answer\",\n        \"Another relevant quote or statistic from this resource\",\n        \"Specific feature or capability mentioned in this resource\"\n      ]\n    }\n  ]\n}\n\n**FIND REFERENCES FROM THESE TWILIO ECOSYSTEM AREAS:**\n\n🏢 **Core Products & Solutions:**\n- https://www.twilio.com/products/ - specific product pages\n- https://www.twilio.com/solutions/ - industry-specific solutions\n- https://www.twilio.com/platform/ - platform capabilities\n- https://www.twilio.com/use-cases/ - use case examples\n\n📚 **Documentation & Resources:**\n- https://www.twilio.com/docs/ - technical documentation\n- https://www.twilio.com/blog/ - thought leadership articles\n- https://www.twilio.com/resources/ - whitepapers and guides\n- https://www.twilio.com/customers/ - customer success stories\n\n🔐 **Security & Compliance:**\n- https://www.twilio.com/security/ - security features\n- https://www.twilio.com/gdpr/ - privacy compliance\n- https://www.twilio.com/trust-center/ - trust and compliance\n\n📧 **SendGrid (Email Solutions):**\n- https://sendgrid.com/solutions/ - email solutions\n- https://sendgrid.com/blog/ - email best practices\n- https://sendgrid.com/docs/ - email API documentation\n- https://sendgrid.com/marketing-campaigns/ - marketing tools\n\n📊 **Segment (Customer Data Platform):**\n- https://segment.com/product/ - CDP features\n- https://segment.com/docs/ - data platform docs\n- https://segment.com/blog/ - data insights\n- https://segment.com/solutions/ - data solutions\n\n**REQUIREMENTS:**\n✅ Find AT LEAST 5 specific, relevant URLs from ALL THREE domains\n✅ Include sources from twilio.com, sendgrid.com, AND segment.com when relevant\n✅ Each URL must directly relate to the question topic\n✅ Use specific pages, not just homepage URLs\n✅ Include diverse resource types (products, docs, blogs, case studies)\n✅ Only Twilio ecosystem domains (twilio.com, sendgrid.com, segment.com)\n❌ NO generic URLs like just \"https://www.twilio.com/\"\n❌ NO competitor references (Genesys, Cisco, Five9, NICE, etc.)\n\n**Think step by step:** What specific Twilio products, features, or solutions address this question? Find the exact pages that demonstrate those capabilities.\n\n**EXAMPLES OF DEEP URLS:**\n- https://www.twilio.com/docs/voice/api/recording\n- https://sendgrid.com/docs/api-reference/mail-send/mail-send\n- https://segment.com/docs/connections/sources/catalog/libraries/server/node\n- https://www.twilio.com/solutions/customer-engagement/contact-center/features\n- https://sendgrid.com/marketing-campaigns/email-automation/behavioral-triggers\n- https://segment.com/product/customer-data-platform/profiles-and-audiences"
      },
      {
        name: "Generic Draft Generation",
        model: "gpt-4o",
        temperature: 0.3,
        maxTokens: 2000,
        tools: ["response_cache"],
        systemPrompt: "You are a professional RFP response writer creating generic, comprehensive draft responses using ONLY the provided Twilio ecosystem research. You must NEVER add external sources beyond what is provided in the Reference Research input. Focus exclusively on Twilio's capabilities and resources.",
        userPrompt: "{{#if PREVIOUS_CONTEXT}}\n**🔗 CONTEXTUAL DEPENDENCY:**\n{{PREVIOUS_CONTEXT.contextNote}}\n\n**Build upon these previous answers:**\n{{#each PREVIOUS_CONTEXT.referencedQuestions}}\n- **Question {{questionNumber}}:** {{question}}\n- **Previous Response:** {{tailoredResponse}}\n{{/each}}\n\n**IMPORTANT:** This question references previous answers. Ensure your response builds logically on the previously described solutions and maintains consistency.\n{{/if}}\n\nBased EXCLUSIVELY on the research and references: {{Reference Research}}\n\nWrite a comprehensive generic draft response to this RFP question: {{FIRST_COLUMN}}\n\n**CRITICAL REQUIREMENTS:**\n- Use ONLY the provided Twilio ecosystem references - NO external sources allowed\n- Do NOT add references to HIMSS, Ponemon Institute, PMI, or any non-Twilio sources\n- Do NOT create fictional metrics or case studies\n- Include specific data points ONLY from the provided Twilio research\n- Address all aspects using Twilio's ecosystem capabilities\n- Use professional, clear language focused on Twilio solutions\n- End with a 'References:' section listing ONLY the provided Twilio/Segment/SendGrid URLs\n\n**MANDATORY:** All citations and references must come from the Reference Research input. Do not generate or add any external sources.\n\nThis is a generic draft that will be tailored with company-specific information in the final step."
      },
      {
        name: "Tailored RFP Response",
        model: "o3-mini",
        temperature: 0.4,
        maxTokens: 3000,
        tools: ["no_cache", "additional_documents", "rfp_instructions"],
        systemPrompt: "You are an expert RFP response specialist creating final, submission-ready responses. Transform the generic draft into a polished, professional response that can be directly submitted to the client. Do NOT include any meta-text, headers, or formatting indicators.",
        userPrompt: "{{#if PREVIOUS_CONTEXT}}\n**🔗 QUESTION DEPENDENCY CONTEXT:**\n{{PREVIOUS_CONTEXT.contextNote}}\n\n**Referenced Previous Questions & Responses:**\n{{#each PREVIOUS_CONTEXT.referencedQuestions}}\n- **Question {{questionNumber}}:** {{question}}\n- **Previous Final Response:** {{tailoredResponse}}\n- **How it's referenced:** \"{{referencedAs}}\"\n{{/each}}\n\n**CRITICAL:** This question builds upon previous responses. Ensure your answer references and builds on the specific solutions, implementations, or approaches mentioned in the previous questions above. Maintain consistency and logical flow.\n{{/if}}\n\nTransform this generic draft into a final RFP response:\n\n**Question:** {{FIRST_COLUMN}}\n\n**Validated References:** {{Reference Research}}\n\n**Generic Draft:** {{Generic Draft Generation}}\n\n**RFP Instructions:** {{RFP_INSTRUCTIONS}}\n\n**Additional Documents:** {{ADDITIONAL_DOCUMENTS}}\n\n**CRITICAL REQUIREMENTS:**\n- Provide ONLY the final response content - no headers, labels, or meta-text\n- Do NOT start with \"Company Overview\", \"Response to RFP Question:\", or similar headers\n- Do NOT include section labels like \"1. Direct Answer\" or \"Our Response:\"\n- Write as if you are directly answering the client's question\n- Customize with company-specific details from additional documents\n- Follow RFP instructions for tone and requirements\n- Use EXCLUSIVELY the specific reference URLs from the \"Validated References\" section above\n- Do NOT generate or add any new reference URLs beyond those provided\n- Do NOT add any external sources (HIMSS, Ponemon, PMI, etc.)\n- MUST include a \"References:\" section at the bottom with the EXACT URLs from the Validated References section\n- Ensure professional, client-ready language\n\n**REFERENCE POLICY:** You MUST use only the specific reference URLs provided in the \"Validated References\" section. These URLs have been researched and validated specifically for this question. Do not generate generic Twilio URLs - use the exact ones provided.\n\nOutput the clean, final response text ending with a References section containing the EXACT validated reference URLs from above."
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