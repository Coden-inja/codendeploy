import { analyzeProjectIdea } from './engine/modelGateway.js';
import { generateRunbookMarkdown, auditTokens } from './engine/runbook.js';

async function run() {
  console.log('🚀 Phase 1: Expanding human prompt into ProjectBlueprint...');
  const prompt = 'A subscription-based developer portfolio builder with custom domains, GitHub sync, and Stripe billing';
  const blueprint = await analyzeProjectIdea(prompt);


  console.log(`\n📋 Project: ${blueprint.projectName} (${blueprint.category})`);
  console.log(`Summary: ${blueprint.plainEnglishSummary}`);
  console.log(`Required Tokens (${blueprint.requiredTokens.length}):`);
  for (const t of blueprint.requiredTokens) {
    console.log(`  - [${t.service}] ${t.name} (${t.envKey}) -> ${t.deepLink}`);
  }

  console.log('\n📄 Phase 2: Generating Credentials Runbook Markdown...');
  const runbookMd = generateRunbookMarkdown(blueprint);
  console.log(runbookMd.split('\n').slice(0, 15).join('\n') + '\n  ... [truncated for display]');

  console.log('\n🛡️ Phase 3: Auditing environment with live API pings...');
  const mockEnv = {
    GITHUB_TOKEN: 'ghp_mocktoken123456789',
    STRIPE_SECRET_KEY: 'sk_test_mocksecret12345',
  };

  const audit = await auditTokens(blueprint.requiredTokens, mockEnv);
  console.log(`Audit Result: All satisfied? ${audit.allSatisfied}`);
  console.log(`Verified count: ${audit.verifiedCount} / ${blueprint.requiredTokens.length}`);

  for (const item of audit.tokens) {
    const status = item.verification?.valid ? '✅ VALID' : (item.provided ? '❌ REJECTED' : '⚠️ MISSING');
    const note = item.verification?.identity || item.verification?.error || 'Key not provided in environment';
    console.log(`  - ${item.token.name} (${item.token.envKey}): ${status} [${note}]`);
  }
}

run().catch(console.error);
