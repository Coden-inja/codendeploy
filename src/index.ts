import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import { analyzeProjectIdea } from './engine/modelGateway.js';
import { auditTokens } from './engine/runbook.js';
import { harvestTokensInteractively, setActiveDashboard } from './engine/browserHarvester.js';
import { ProgressDashboard } from './engine/progressDashboard.js';
import { provisionGitHubRepository } from './engine/githubProvisioner.js';
import { primeAgentWorkspace } from './engine/workspacePrimer.js';
import { deployToVercel } from './engine/vercelDeployer.js';
import { ProjectBlueprint, RequiredToken } from './engine/types.js';

function parseEnvFile(envPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        result[match[1].trim()] = match[2].trim();
      }
    }
  }
  return result;
}

async function main() {
  const userPrompt = process.argv.slice(2).join(' ') ||
    'Build a modern anime e-commerce platform with Supabase database, Stripe checkout payments, and Google Stitch UI design';

  console.log('====================================================');
  console.log('⚡ CODENDEPLOY: AUTONOMOUS SOFTWARE FOUNDRY');
  console.log('====================================================');
  console.log(`💡 Intent: "${userPrompt}"\n`);

  const envPath = path.resolve(process.cwd(), '.env');
  const envKeys = parseEnvFile(envPath);

  // 1. Semantic Reasoning & Blueprint Generation
  console.log('🧠 [Phase 1: Scoping] Reasoning project blueprint using Model Gateway...');
  let blueprint: ProjectBlueprint;
  try {
    blueprint = await analyzeProjectIdea(userPrompt, {
      geminiKey: envKeys['GEMINI_API_KEY'],
      groqKey: envKeys['GROQ_API_KEY'],
    });
    console.log(`✅ [Blueprint Ready] Project: "${blueprint.projectName}" (${blueprint.category})`);
    console.log(`   └─ Tagline: "${blueprint.tagline}"`);
  } catch (err) {
    console.warn(`⚠️ Model Gateway fallback to deterministic blueprint: ${err}`);
    blueprint = {
      projectName: 'anime-vault',
      category: 'ecommerce',
      tagline: 'Premium anime merchandise with Stripe & Supabase',
      plainEnglishSummary: 'Fullstack Next.js 15 e-commerce store with database catalog and billing',
      coreFeatures: ['Product Catalog', 'Stripe Checkout', 'User Authentication', 'Order History'],
      capabilities: {
        needsAuth: true,
        needsDatabase: true,
        needsPayments: true,
        needsStorage: false,
        needsEmail: false,
        needsAI: true
      },
      requiredTokens: [
        { id: 'github', name: 'GitHub Token', envKey: 'GITHUB_TOKEN', service: 'github', description: '', whyNeeded: '', deepLink: '' },
        { id: 'vercel', name: 'Vercel Token', envKey: 'VERCEL_TOKEN', service: 'vercel', description: '', whyNeeded: '', deepLink: '' },
        { id: 'supabase', name: 'Supabase Key', envKey: 'SUPABASE_SERVICE_ROLE_KEY', service: 'supabase', description: '', whyNeeded: '', deepLink: '' }
      ],
      recommendedStack: {
        framework: 'Next.js 15 (App Router)',
        styling: 'Tailwind CSS',
        database: 'Supabase PostgreSQL',
        auth: 'Supabase Auth',
        hosting: 'Vercel Edge Network'
      }
    };
  }

  // 2. Pre-Flight Credential Audit
  console.log('\n🔍 [Phase 2: Pre-Flight Audit] Auditing required credentials against disk...');
  const audit = await auditTokens(blueprint.requiredTokens, envKeys);

  const missingTokens: RequiredToken[] = [];
  for (const item of audit.tokens) {
    if (!item.provided || !item.verification?.valid) {
      missingTokens.push(item.token);
    }
  }

  if (missingTokens.length > 0) {
    console.log(`⚠️ Missing ${missingTokens.length} credentials. Launching Browser Harvester on 127.0.0.1:4242...`);
    await harvestTokensInteractively(missingTokens, envPath);
  } else {
    console.log('✅ All required cloud credentials verified active on disk! (Harvester bypassed)');
  }

  // Reload fresh env
  const updatedEnv = parseEnvFile(envPath);
  const targetDir = path.resolve(process.cwd(), blueprint.projectName);

  // 3. Initialize Progress State Machine & SSE Dashboard
  const dashboard = new ProgressDashboard(blueprint.projectName, targetDir);
  setActiveDashboard(dashboard);

  // 4. Provision Remote GitHub Repository
  console.log('\n📦 [Phase 3: GitHub Provisioning] Provisioning remote repository under @Coden-inja...');
  const gitHubResult = await provisionGitHubRepository({
    repoName: blueprint.projectName,
    description: blueprint.tagline,
    isPrivate: false,
    targetDir,
    githubToken: updatedEnv['GITHUB_TOKEN'],
    dashboard
  });

  if (!gitHubResult.success) {
    console.error('❌ Failed to provision GitHub repository:', gitHubResult.error);
    return;
  }

  // 5. Prime Agent-Ready Workspace (README, Rules, MCP, .env)
  console.log('\n🚀 [Phase 4: Workspace Priming] Writing Agent Ignition Kit...');
  await primeAgentWorkspace({
    blueprint,
    targetDir,
    repoUrl: gitHubResult.repoUrl,
    deployUrl: `https://${blueprint.projectName}.vercel.app`,
    envKeys: updatedEnv,
    openEditor: true // Boots Antigravity IDE
  });

  dashboard.updateTask('scaffolding', 't-scaffold', 'completed', 'Workspace primed with Agent Ignition Kit');
  dashboard.updateTask('handoff', 't-handoff-spec', 'completed', 'README.md & AGENTS.md ready for Gemini 3.8');
  dashboard.setStageStatus('scaffolding', 'completed');
  dashboard.setStageStatus('handoff', 'completed');

  // 6. Provision Vercel Project & Edge Deployment
  if (updatedEnv['VERCEL_TOKEN']) {
    console.log('\n▲ [Phase 5: Vercel Cloud Orchestration] Linking repository to Vercel...');
    await deployToVercel({
      projectName: blueprint.projectName,
      repoOwner: gitHubResult.owner,
      repoName: blueprint.projectName,
      vercelToken: updatedEnv['VERCEL_TOKEN'],
      envKeys: updatedEnv,
      framework: 'nextjs',
      dashboard
    });
  }

  console.log('\n====================================================');
  console.log('🎉 PIPELINE COMPLETE: WORKSPACE READY FOR ANTIGRAVITY');
  console.log('====================================================');
  console.log(`📁 Local Project: ${targetDir}`);
  console.log(`📦 GitHub Repo:   ${gitHubResult.repoUrl}`);
  console.log(`🌐 Live Vercel:   https://${blueprint.projectName}.vercel.app`);
  console.log(`📊 Progress Log:  ${path.resolve(targetDir, 'PROGRESS.md')}`);
  console.log('\nAntigravity IDE has been launched into your new workspace.');
  console.log('You can now prompt the agent inside Antigravity: "Build the store according to README.md"');
}

main().catch(err => {
  console.error('💥 Fatal orchestrator error:', err);
});
