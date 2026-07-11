// Test script for Featherless AI integration
import dotenv from 'dotenv';
import { getFeatherlessService } from '../services/featherless-service.js';

dotenv.config();

async function testFeatherless() {
  console.log('Testing Featherless AI integration...\n');

  try {
    const featherless = getFeatherlessService();

    // Test 1: Simple chat.
    console.log('Test 1: Simple chat completion');
    const chatResponse = await featherless.chatCompletion({
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is 2+2?' },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    console.log('Response:', chatResponse.choices[0].message.content);
    console.log('Usage:', chatResponse.usage);
    console.log();

    // Test 2: Attack type classification
    console.log('Test 2: Attack type classification');
    const classification = await featherless.classifyAttackType({
      incidentId: 'TEST-001',
      targetHost: 'web-server-01',
      rootCauseHypothesis: 'Multiple failed login attempts from IP 192.168.1.100 using common passwords',
      evidenceChain: [
        { kind: 'auth_failure', summary: 'SSH login failed for user admin' },
        { kind: 'auth_failure', summary: 'SSH login failed for user root' },
      ],
    });

    console.log('Classification result:', classification);
    console.log();

    // Test 3: Plain language summary
    console.log('Test 3: Incident summary generation');
    const summary = await featherless.generateIncidentSummary({
      incidentId: 'TEST-001',
      status: 'analyzing',
      threatScore: 75,
      targetHost: 'web-server-01',
      rootCauseHypothesis: 'Potential brute force attack detected',
      evidenceChain: [
        { kind: 'auth_failure', summary: 'SSH login failed for user admin' },
        { kind: 'auth_failure', summary: 'SSH login failed for user root' },
      ],
    });

    console.log('Summary:', summary);
    console.log();

    // Test 4: Technical term explanation
    console.log('Test 4: Technical term explanation');
    const explanation = await featherless.explainTerm('SQL Injection');
    console.log('Explanation:', explanation);
    console.log();

    // Test 5: Cost estimation
    console.log('Test 5: Cost estimation');
    const cost = featherless.estimateCost('meta-llama/Llama-3.1-8B-Instruct', 1000, 500);
    console.log('Estimated cost for 1000 input + 500 output tokens:', cost);
    console.log();

    // Test 6: Available models
    console.log('Test 6: Available models');
    const models = featherless.getAvailableModels();
    console.log('Available models:');
    models.forEach(model => {
      console.log(`- ${model.name} (${model.id})`);
      console.log(`  Context: ${model.context_length}`);
      console.log(`  Pricing: $${model.pricing.input}/1K input, $${model.pricing.output}/1K output`);
    });

    console.log('\n✅ All tests passed!');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testFeatherless();
