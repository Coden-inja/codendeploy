import { ProjectBlueprint } from './types.js';

interface ProviderConfig {
  geminiKey?: string;
  groqKey?: string;
}

const SYSTEM_PROMPT = `You are a Principal Software Architect & Infrastructure Engineer.
Analyze the user's application idea and deduce all implicit technical requirements.
For example:
- A user asking for an "e-commerce store" implicitly needs Auth, a Database (products/orders), and Payments (Stripe).
- A user asking for a "portfolio" only needs static hosting (Vercel) and GitHub.
- A user asking for a "dashboard with updates" implicitly needs Auth and a Database (CMS).

You MUST respond with a single, raw, valid JSON object matching this TypeScript structure (do not wrap in markdown or backticks):
{
  "projectName": "kebab-case-project-name",
  "category": "ecommerce | saas | blog | portfolio | api | fullstack-cms | custom",
  "tagline": "A punchy one-sentence description",
  "plainEnglishSummary": "A clear 2-3 sentence overview of what the app does and who it is for",
  "coreFeatures": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],
  "capabilities": {
    "needsAuth": boolean,
    "needsDatabase": boolean,
    "needsPayments": boolean,
    "needsStorage": boolean,
    "needsEmail": boolean,
    "needsAI": boolean
  },
  "requiredTokens": [
    {
      "id": "github_pat",
      "name": "GitHub Personal Access Token",
      "envKey": "GITHUB_TOKEN",
      "service": "github",
      "description": "Token to create remote repository and push commits",
      "whyNeeded": "Allows the deployment engine to create the GitHub repository autonomously",
      "deepLink": "https://github.com/settings/tokens/new?scopes=repo",
      "scopes": ["repo"]
    },
    {
      "id": "vercel_token",
      "name": "Vercel Access Token",
      "envKey": "VERCEL_TOKEN",
      "service": "vercel",
      "description": "CLI Token to deploy the website live to production",
      "whyNeeded": "Deploys your application to high-speed edge servers and gives you a live URL",
      "deepLink": "https://vercel.com/account/tokens"
    }
  ],
  "recommendedStack": {
    "framework": "Next.js 15 (App Router)",
    "styling": "Tailwind CSS",
    "database": "Supabase (PostgreSQL)" (or null if not needed),
    "auth": "Supabase Auth" (or null if not needed),
    "hosting": "Vercel"
  }
}

Always include GitHub PAT and Vercel Token in requiredTokens.
If needsPayments is true, also include Stripe Secret Key (deepLink: "https://dashboard.stripe.com/test/apikeys").
If needsDatabase is true, also include Supabase API Key & URL (deepLink: "https://supabase.com/dashboard").
If needsEmail is true, also include Resend API Key (deepLink: "https://resend.com/api-keys").
`;

/**
 * Strips markdown codeblocks if model adds them
 */
function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * 1. Calls Google Gemini API
 */
async function callGemini(apiKey: string, userPrompt: string): Promise<ProjectBlueprint> {
  // Target gemini-flash-latest or gemini-3.8-flash directly
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${SYSTEM_PROMPT}\n\nUSER PROJECT IDEA:\n"${userPrompt}"` }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned empty response structure');
  }

  return JSON.parse(cleanJsonResponse(text)) as ProjectBlueprint;
}

/**
 * 2. Calls Groq API (Fallback)
 */
async function callGroq(apiKey: string, userPrompt: string): Promise<ProjectBlueprint> {
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `USER PROJECT IDEA: "${userPrompt}"` }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Groq returned empty response structure');
  }

  return JSON.parse(cleanJsonResponse(text)) as ProjectBlueprint;
}

/**
 * Gateway function with primary + automatic fallback
 */
export async function analyzeProjectIdea(
  userPrompt: string,
  config: ProviderConfig = {
    geminiKey: process.env.GEMINI_API_KEY,
    groqKey: process.env.GROQ_API_KEY
  }
): Promise<ProjectBlueprint> {
  // Try Gemini First
  if (config.geminiKey) {
    try {
      console.log('🤖 Analyzing idea via Gemini...');
      return await callGemini(config.geminiKey, userPrompt);
    } catch (err: any) {
      console.warn(`⚠️ Gemini primary call failed (${err.message}). Falling back to Groq...`);
    }
  }

  // Fallback to Groq
  if (config.groqKey) {
    console.log('⚡ Analyzing idea via Groq fallback...');
    return await callGroq(config.groqKey, userPrompt);
  }

  throw new Error('No valid API keys found for Gemini or Groq in environment.');
}
