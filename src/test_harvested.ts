import { verifyGitHubToken, verifyVercelToken } from './engine/tokenVerifier.js';

async function testHarvested() {
  console.log('🔍 Testing harvested GITHUB_TOKEN...');
  const ghToken = process.env.GITHUB_TOKEN || '';
  const ghRes = await verifyGitHubToken(ghToken);
  console.log('GitHub Result:', ghRes);

  console.log('\n🔍 Testing harvested VERCEL_TOKEN...');
  const vercelToken = process.env.VERCEL_TOKEN || '';
  const vRes = await verifyVercelToken(vercelToken);
  console.log('Vercel Result:', vRes);
}

testHarvested().catch(console.error);

