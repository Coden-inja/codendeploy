import { analyzeProjectIdea } from './engine/modelGateway.js';

async function main() {
  const prompt = "I want to build an online plant nursery where people can browse indoor plants, add them to cart, and pay with card.";
  console.log(`\n🎯 Testing User Prompt: "${prompt}"\n`);
  
  try {
    const blueprint = await analyzeProjectIdea(prompt);
    console.log('✅ Successfully Generated Project Blueprint:\n');
    console.log(JSON.stringify(blueprint, null, 2));
  } catch (err: any) {
    console.error('❌ Error during analysis:', err.message);
  }
}

main();
