// Featherless AI Service Integration
// This service provides access to various AI models via Featherless API
import Groq from 'groq-sdk';

interface FeatherlessModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    input: number;
    output: number;
  };
}

interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Available Featherless models
const FEATHERLESS_MODELS: Record<string, FeatherlessModel> = {
  'meta-llama/Llama-3.3-70B-Instruct': {
    id: 'meta-llama/Llama-3.3-70B-Instruct',
    name: 'Llama 3.3 70B Instruct',
    context_length: 128000,
    pricing: { input: 0.0001, output: 0.0001 },
  },
  'meta-llama/Llama-3.1-70B-Instruct': {
    id: 'meta-llama/Llama-3.1-70B-Instruct',
    name: 'Llama 3.1 70B Instruct',
    context_length: 131072,
    pricing: { input: 0.0001, output: 0.0001 },
  },
  'meta-llama/Llama-3.1-8B-Instruct': {
    id: 'meta-llama/Llama-3.1-8B-Instruct',
    name: 'Llama 3.1 8B Instruct',
    context_length: 131072,
    pricing: { input: 0.00002, output: 0.00002 },
  },
  'mistralai/Mistral-7B-Instruct-v0.3': {
    id: 'mistralai/Mistral-7B-Instruct-v0.3',
    name: 'Mistral 7B Instruct',
    context_length: 32768,
    pricing: { input: 0.00001, output: 0.00001 },
  },
};

class FeatherlessService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.featherless.ai/v1';
  }

  /**
   * Generate chat completion
   */
  private async fallbackChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const groqKey = process.env.GROQ_API_KEY || '';
    if (!groqKey) {
      throw new Error('Both FEATHERLESS_API_KEY and GROQ_API_KEY are missing');
    }

    const groq = new Groq({ apiKey: groqKey });
    const modelMap: Record<string, string> = {
      'meta-llama/Llama-3.3-70B-Instruct': 'llama-3.3-70b-versatile',
      'meta-llama/Llama-3.1-70B-Instruct': 'llama-3.3-70b-versatile',
      'meta-llama/Llama-3.1-8B-Instruct': 'llama-3.1-8b-instant',
      'mistralai/Mistral-7B-Instruct-v0.3': 'llama-3.1-8b-instant',
    };

    const groqModel = modelMap[request.model] || 'llama-3.1-8b-instant';

    const completion = await groq.chat.completions.create({
      model: groqModel,
      messages: request.messages as any,
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens || 2048,
    });

    return {
      id: completion.id,
      choices: completion.choices.map((c: any) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content || '',
        },
        finish_reason: c.finish_reason || 'stop',
      })),
      usage: {
        prompt_tokens: completion.usage?.prompt_tokens ?? 0,
        completion_tokens: completion.usage?.completion_tokens ?? 0,
        total_tokens: completion.usage?.total_tokens ?? 0,
      },
    };
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    if (!this.apiKey || this.apiKey.includes('your_featherless_api_key_here') || !this.apiKey.startsWith('rc_')) {
      return this.fallbackChatCompletion(request);
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature || 0.7,
          max_tokens: request.max_tokens || 2048,
          stream: request.stream || false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Featherless API error: ${response.status} - ${error}`);
      }

      return response.json();
    } catch (err: any) {
      console.warn(`[Featherless Service] Request failed, falling back to Groq: ${err.message}`);
      return this.fallbackChatCompletion(request);
    }
  }

  /**
   * Classify attack type from incident data
   */
  async classifyAttackType(incidentData: any): Promise<{
    attackType: string;
    confidence: number;
    reasoning: string;
  }> {
    const prompt = `You are a cybersecurity expert. Classify the following incident by attack type.

Incident Data:
- Target Host: ${incidentData.targetHost}
- Root Cause Hypothesis: ${incidentData.rootCauseHypothesis || 'Not provided'}
- Evidence: ${JSON.stringify(incidentData.evidenceChain || [])}

Available Attack Types:
- RANSOMWARE: Data hijacking and encryption attacks
- ZERO_DAY: Unknown security flaws
- APT: Advanced Persistent Threat (nation-state or organized crime)
- CREDENTIAL_STUFFING: Using stolen credentials
- SQL_INJECTION: Database attack attempts
- DDOS: Service overload attacks
- PHISHING: Fake email scams
- SUPPLY_CHAIN: Dependency compromise attacks
- MALWARE: General malicious software
- NETWORK_SCAN: Reconnaissance activities

Respond in JSON format:
{
  "attackType": "ATTACK_TYPE",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}`;

    const response = await this.chatCompletion({
      model: 'meta-llama/Llama-3.1-8B-Instruct', // Cost-effective model
      messages: [
        { role: 'system', content: 'You are a cybersecurity classification expert. Always respond in valid JSON format.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    try {
      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse Featherless response:', error);
    }

    // Fallback
    return {
      attackType: 'UNKNOWN',
      confidence: 0.5,
      reasoning: 'Classification failed, using default',
    };
  }

  /**
   * Generate incident summary in plain language
   */
  async generateIncidentSummary(incidentData: any): Promise<string> {
    const prompt = `Generate a plain language summary of this security incident for non-technical users.

Incident ID: ${incidentData.incidentId}
Status: ${incidentData.status}
Threat Score: ${incidentData.threatScore || 0}/100
Target System: ${incidentData.targetHost}
Root Cause: ${incidentData.rootCauseHypothesis || 'Investigation in progress'}

Evidence Chain:
${(incidentData.evidenceChain || []).map((e: any) => `- ${e.kind}: ${e.summary}`).join('\n')}

Guidelines:
- Use simple, non-technical language
- Explain what happened in 1-2 sentences
- Explain what's affected
- Explain what action is needed
- Avoid technical jargon or explain it simply
- Keep it under 150 words`;

    const response = await this.chatCompletion({
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      messages: [
        { role: 'system', content: 'You are an expert at explaining complex security incidents in simple terms.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    return response.choices[0].message.content;
  }

  /**
   * Generate executive report
   */
  async generateExecutiveReport(incidentData: any, similarIncidents: any[]): Promise<string> {
    const prompt = `Generate an executive summary report for this security incident.

Incident Details:
- ID: ${incidentData.incidentId}
- Date: ${incidentData.createdAt}
- Status: ${incidentData.status}
- Threat Score: ${incidentData.threatScore || 0}/100
- Affected System: ${incidentData.targetHost}
- Root Cause: ${incidentData.rootCauseHypothesis}

Similar Incidents: ${similarIncidents.length} found
${similarIncidents.slice(0, 3).map((i: any) => `- ${i.incidentId} (${Math.round(i.similarityScore * 100)}% similar)`).join('\n')}

Generate a professional executive report with:
1. Executive Summary (2-3 paragraphs)
2. Impact Assessment
3. Actions Taken
4. Recommendations
5. Lessons Learned

Keep it professional, concise, and actionable for business executives.`;

    const response = await this.chatCompletion({
      model: 'meta-llama/Llama-3.3-70B-Instruct', // Higher quality for reports
      messages: [
        { role: 'system', content: 'You are an expert at writing security incident reports for executives.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    });

    return response.choices[0].message.content;
  }

  /**
   * Analyze threat intelligence
   */
  async analyzeThreatIntel(iocData: any): Promise<{
    threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    indicators: string[];
    recommendations: string[];
  }> {
    const prompt = `Analyze this threat intelligence data and provide threat assessment.

IOC Data:
${JSON.stringify(iocData, null, 2)}

Provide analysis in JSON format:
{
  "threatLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "indicators": ["indicator1", "indicator2"],
  "recommendations": ["recommendation1", "recommendation2"]
}`;

    const response = await this.chatCompletion({
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      messages: [
        { role: 'system', content: 'You are a threat intelligence analyst. Always respond in valid JSON format.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    try {
      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse Featherless response:', error);
    }

    return {
      threatLevel: 'MEDIUM',
      indicators: ['Unknown'],
      recommendations: ['Further investigation needed'],
    };
  }

  /**
   * Explain technical term in plain language
   */
  async explainTerm(term: string): Promise<string> {
    const prompt = `Explain this cybersecurity term in simple, non-technical language that anyone can understand.

Term: ${term}

Provide:
1. A simple definition (1-2 sentences)
2. A real-world analogy
3. Why it matters for security

Keep it under 100 words total.`;

    const response = await this.chatCompletion({
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      messages: [
        { role: 'system', content: 'You are an expert at explaining technical concepts simply.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 200,
    });

    return response.choices[0].message.content;
  }

  /**
   * Get cost estimate for a request
   */
  estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const model = FEATHERLESS_MODELS[modelId];
    if (!model) return 0;

    const inputCost = (inputTokens / 1000) * model.pricing.input;
    const outputCost = (outputTokens / 1000) * model.pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Get available models
   */
  getAvailableModels(): FeatherlessModel[] {
    return Object.values(FEATHERLESS_MODELS);
  }
}

// Singleton instance
let featherlessService: FeatherlessService | null = null;

export function getFeatherlessService(): FeatherlessService {
  if (!featherlessService) {
    const apiKey = process.env.FEATHERLESS_API_KEY || '';
    featherlessService = new FeatherlessService(apiKey);
  }
  return featherlessService;
}

export { FeatherlessService, FEATHERLESS_MODELS };
