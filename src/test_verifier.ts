import { verifyGitHubToken, verifyStripeKey } from './engine/tokenVerifier.js';

async function run() {
  console.log('🧪 Testing TokenVerifier with a dummy GitHub token...');
  const res = await verifyGitHubToken('ghp_dummytoken1234567890');
  console.log('Result:', JSON.stringify(res, null, 2));

  console.log('\n🧪 Testing TokenVerifier with a dummy Stripe key...');
  const stripeRes = await verifyStripeKey('sk_test_dummykey12345');
  console.log('Result:', JSON.stringify(stripeRes, null, 2));
}

run();
