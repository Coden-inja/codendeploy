import { harvestTokensInteractively } from './engine/browserHarvester.js';
import { RequiredToken } from './engine/types.js';

/**
 * Interactive Harvest Runner:
 * Launches the browser harvester for the core essential cloud services.
 */

const CORE_SERVICES: RequiredToken[] = [
  {
    id: 'github',
    name: 'GitHub Personal Access Token',
    envKey: 'GITHUB_TOKEN',
    service: 'github',
    description: 'Personal Access Token for repo creation & CI/CD deployment hooks',
    whyNeeded: 'Allows codendeploy to autonomously create the remote Git repository and push code',
    deepLink: 'https://github.com/settings/tokens/new?scopes=repo,workflow,admin:repo_hook&description=codendeploy-auth'
  },
  {
    id: 'vercel',
    name: 'Vercel Access Token',
    envKey: 'VERCEL_TOKEN',
    service: 'vercel',
    description: 'Vercel personal token for edge deployment and domain linking',
    whyNeeded: 'Deploys your application to high-speed edge servers and returns live public URLs',
    deepLink: 'https://vercel.com/account/tokens'
  },
  {
    id: 'supabase',
    name: 'Supabase Service Role Key',
    envKey: 'SUPABASE_SERVICE_ROLE_KEY',
    service: 'supabase',
    description: 'Admin key for Postgres database tables and authentication',
    whyNeeded: 'Connects backend API routes to PostgreSQL database tables and bypasses RLS for migrations',
    deepLink: 'https://supabase.com/dashboard/account/tokens'
  },
  {
    id: 'stripe',
    name: 'Stripe Secret Key',
    envKey: 'STRIPE_SECRET_KEY',
    service: 'stripe',
    description: 'Stripe secret key for processing subscription payments',
    whyNeeded: 'Handles checkout sessions, customer billing portals, and payment webhooks',
    deepLink: 'https://dashboard.stripe.com/test/apikeys'
  },
  {
    id: 'gemini',
    name: 'Google Gemini API Key',
    envKey: 'GEMINI_API_KEY',
    service: 'gemini',
    description: 'Free tier key from Google AI Studio for powering multimodal chat & embeddings',
    whyNeeded: 'Enables native AI reasoning, chatbots, and vision features inside your app',
    deepLink: 'https://aistudio.google.com/app/apikey'
  },
  {
    id: 'groq',
    name: 'Groq Cloud API Key',
    envKey: 'GROQ_API_KEY',
    service: 'groq',
    description: 'Ultra-fast Llama-3 and Qwen inference API key from Groq',
    whyNeeded: 'Provides sub-second token streaming for real-time user-facing chatbots',
    deepLink: 'https://console.groq.com/keys'
  },
  {
    id: 'openai',
    name: 'OpenAI API Key',
    envKey: 'OPENAI_API_KEY',
    service: 'openai',
    description: 'OpenAI API key for GPT-4o, DALL-E, and Whisper speech features',
    whyNeeded: 'Powers advanced LLM pipelines, text-to-speech, and image generation',
    deepLink: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'stitch',
    name: 'Google Stitch API Key & MCP Server',
    envKey: 'STITCH_API_KEY',
    service: 'stitch',
    description: 'Google Stitch design generation token; bridges directly into MCP tools',
    whyNeeded: 'Enables coding assistants to inspect bespoke UI screens and design tokens via MCP JSON-RPC',
    deepLink: 'https://stitch.withgoogle.com/settings'
  }
];


async function main() {
  console.log('====================================================');
  console.log('⚡ CODENDEPLOY AUTOMATED KEY HARVESTER');
  console.log('====================================================');
  console.log('Targeting core cloud services: GitHub, Vercel, Supabase, Stripe.');
  console.log('Booting local loopback receiver on 127.0.0.1:4242...');

  try {
    const harvested = await harvestTokensInteractively(CORE_SERVICES);
    console.log('\n🎉 ALL KEYS SUCCESSFULLY HARVESTED & VERIFIED!');
    for (const item of harvested) {
      console.log(`  ✅ ${item.service.toUpperCase()}: ${item.verification.identity} -> Saved to .env`);
    }
    console.log('\n🚀 Your environment is fully primed and production-ready.');
  } catch (err) {
    console.error('❌ Harvester error:', err);
  }
}

main();
