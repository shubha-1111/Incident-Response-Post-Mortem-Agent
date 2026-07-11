# Featherless AI Integration Guide

This guide explains how to use your Featherless API credits in the incident response system.

## What I've Implemented

### 1. Featherless Service (`src/services/featherless-service.ts`)
A comprehensive service that provides:
- **Attack Type Classification** - Classify incidents as ransomware, zero-day, APT, etc.
- **Plain Language Summaries** - Generate simple explanations for non-technical users
- **Executive Reports** - Generate professional reports for business stakeholders
- **Threat Intelligence Analysis** - Analyze IOC data and provide threat assessments
- **Technical Term Explanations** - Explain cybersecurity concepts in simple terms
- **Cost Estimation** - Calculate costs before making API calls

### 2. Report Agent Integration (`src/agents/report-agent.ts`)
Modified the report agent to:
- Use Featherless as the primary LLM for report generation (cost-effective)
- Fall back to Groq if Featherless fails
- Maintain backward compatibility

### 3. Environment Configuration (`.env`)
Added `FEATHERLESS_API_KEY` variable for your API key.

### 4. Test Script (`src/scripts/test-featherless.ts`)
Comprehensive test script to verify Featherless integration.

## Setup Instructions

### 1. Add Your Featherless API Key

Edit `.env` file and replace:
```bash
FEATHERLESS_API_KEY=your_featherless_api_key_here
```

With your actual Featherless API key.

### 2. Test the Integration

Run the test script:
```bash
npm run dev src/scripts/test-featherless.ts
```

This will test:
- Simple chat completion
- Attack type classification
- Incident summary generation
- Technical term explanation
- Cost estimation
- Available models

## Available Models

Featherless provides access to several models at different price points:

| Model | Context | Input Cost | Output Cost | Best For |
|-------|---------|------------|-------------|----------|
| Llama 3.3 70B Instruct | 128K | $0.0001/1K | $0.0001/1K | High-quality reports, complex analysis |
| Llama 3.1 70B Instruct | 131K | $0.0001/1K | $0.0001/1K | High-quality reports, complex analysis |
| Llama 3.1 8B Instruct | 131K | $0.00002/1K | $0.00002/1K | Cost-effective classification, summaries |
| Mistral 7B Instruct | 32K | $0.00001/1K | $0.00001/1K | Very cost-effective simple tasks |

## Cost Comparison

With your $25 credit:

**Using Llama 3.1 8B (most cost-effective):**
- 1,000 input + 500 output tokens = $0.03
- You can process ~833 requests
- Perfect for attack classification and summaries

**Using Llama 3.3 70B (highest quality):**
- 1,000 input + 500 output tokens = $0.15
- You can process ~166 requests
- Best for executive reports and complex analysis

## Usage Examples

### Example 1: Classify Attack Type
```typescript
import { getFeatherlessService } from './services/featherless-service.js';

const featherless = getFeatherlessService();
const classification = await featherless.classifyAttackType({
  incidentId: 'INC-001',
  targetHost: 'db-server-01',
  rootCauseHypothesis: 'Database accessed with stolen credentials',
  evidenceChain: [...]
});

console.log(classification);
// { attackType: 'CREDENTIAL_STUFFING', confidence: 0.85, reasoning: '...' }
```

### Example 2: Generate Plain Language Summary
```typescript
const summary = await featherless.generateIncidentSummary({
  incidentId: 'INC-001',
  status: 'analyzing',
  threatScore: 75,
  targetHost: 'web-server-01',
  rootCauseHypothesis: 'Potential brute force attack',
  evidenceChain: [...]
});

console.log(summary);
// "Someone tried to guess passwords to access your web server. We detected this attack and are investigating. No immediate action is needed from you."
```

### Example 3: Generate Executive Report
```typescript
const report = await featherless.generateExecutiveReport(
  incidentData,
  similarIncidents
);

console.log(report);
// Full executive report with impact assessment, actions taken, and recommendations
```

### Example 4: Explain Technical Term
```typescript
const explanation = await featherless.explainTerm('SQL Injection');
console.log(explanation);
// "SQL Injection is when attackers trick a database into revealing information by sending malicious commands. Think of it like tricking a librarian into giving you restricted books by asking in a special code language."
```

## Integration Points in Your System

### Current Integration:
- **Report Agent** - Uses Featherless for post-mortem report generation

### Future Integration Points (from the detailed plan):
- **Attack Classification** - Replace/supplement existing classification
- **Plain Language Service** - For UX simplification (Phase 8)
- **Threat Intelligence Analysis** - For IOC enrichment (Phase 2)
- **Report Generation** - For executive summaries (Phase 3)
- **Decision Support** - For generating recommendations (Phase 4)

## Cost Optimization Tips

1. **Use smaller models for simple tasks**
   - Use Llama 3.1 8B for classification and summaries
   - Use Llama 3.3 70B only for complex reports

2. **Estimate costs before API calls**
   ```typescript
   const cost = featherless.estimateCost('meta-llama/Llama-3.1-8B-Instruct', 1000, 500);
   console.log(`This request will cost: $${cost}`);
   ```

3. **Cache results**
   - Cache classification results to avoid re-classifying similar incidents
   - Cache term explanations

4. **Use fallback to Groq**
   - The system automatically falls back to Groq if Featherless fails
   - You can disable Featherless by removing the API key from .env

## Monitoring Your Usage

Featherless provides usage tracking in their dashboard. Monitor:
- Total tokens used
- Cost per request
- Remaining credit balance

## Troubleshooting

### Issue: "FEATHERLESS_API_KEY environment variable not set"
**Solution:** Add your API key to `.env` file

### Issue: API rate limits
**Solution:** Implement request queuing or use smaller models

### Issue: Poor quality responses
**Solution:** Try a larger model (Llama 3.3 70B) or adjust temperature parameter

### Issue: High costs
**Solution:** Switch to Llama 3.1 8B or Mistral 7B for cost savings

## Next Steps

1. Add your Featherless API key to `.env`
2. Run the test script to verify integration
3. Monitor costs in Featherless dashboard
4. Consider integrating Featherless into other agents as outlined in the detailed plan

## Questions?

If you have questions about:
- Specific model selection
- Cost optimization strategies
- Integration into other parts of the system
- Custom prompt engineering

Feel free to ask!
