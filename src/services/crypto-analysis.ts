import { z } from 'zod';

export const EncryptionAnalysisSchema = z.object({
  payload: z.string(),
  detectedEncoding: z.enum(['base64', 'hex', 'utf8', 'binary']),
  entropy: z.number().min(0).max(1),
  keyLengthBits: z.number().optional(),
  algorithmHint: z.string().optional(),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type EncryptionAnalysis = z.infer<typeof EncryptionAnalysisSchema>;

export const XORResultSchema = z.object({
  decrypted: z.string(),
  keyUsed: z.string(),
  confidence: z.number().min(0).max(1),
});

export type XORResult = z.infer<typeof XORResultSchema>;

function calculateEntropy(data: Buffer): number {
  const frequencies = new Map<number, number>();
  for (const byte of data) {
    frequencies.set(byte, (frequencies.get(byte) || 0) + 1);
  }

  let entropy = 0;
  const len = data.length;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy / 8;
}

function detectEncoding(data: string): 'base64' | 'hex' | 'utf8' | 'binary' {
  if (/^[A-Za-z0-9+/=]+$/.test(data) && data.length % 4 === 0) {
    try {
      const decoded = Buffer.from(data, 'base64');
      if (decoded.toString('utf8').length > 0) return 'base64';
    } catch {}
  }

  if (/^[0-9a-fA-F]+$/.test(data) && data.length % 2 === 0) {
    return 'hex';
  }

  if (/^[\x00-\xFF]+$/.test(data)) {
    return 'binary';
  }

  return 'utf8';
}

export async function analyzeEncryptedPayload(payload: string): Promise<EncryptionAnalysis> {
  const buffer = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload);
  const encoding = detectEncoding(payload);
  const entropy = calculateEntropy(buffer);

  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  if (entropy < 0.5) {
    weaknesses.push('Low entropy detected - may indicate weak encryption or plaintext');
    recommendations.push('Use stronger encryption algorithms (AES-256-GCM recommended)');
  }

  if (entropy < 0.8 && buffer.length > 12) {
    weaknesses.push('Possible XOR encryption detected - trivially reversible');
    recommendations.push('Replace XOR with industry-standard encryption (AES-256)');
  }

  if (encoding === 'base64' && entropy > 0.9) {
    weaknesses.push('High-entropy base64 may indicate encrypted payload requiring further analysis');
    recommendations.push('Perform cryptanalysis to identify cipher suite used');
  }

  return {
    payload,
    detectedEncoding: encoding,
    entropy: Number(entropy.toFixed(3)),
    weaknesses,
    recommendations,
  };
}

export async function xorDecrypt(
  ciphertext: string,
  key: string
): Promise<XORResult> {
  if (!key || key.length === 0) {
    throw new Error('XOR key must be a non-empty string');
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(ciphertext, 'hex');
  } catch {
    buffer = Buffer.from(ciphertext, 'utf8');
  }

  const keyBuffer = Buffer.from(key, 'utf8');
  const keyLen = keyBuffer.length;
  const decrypted = Buffer.alloc(buffer.length);

  for (let i = 0; i < buffer.length; i++) {
    decrypted[i] = buffer[i] ^ keyBuffer[i % keyLen];
  }

  const confidence = calculateEntropy(decrypted) > 0.5 ? 0.85 : 0.45;

  return {
    decrypted: decrypted.toString('utf8'),
    keyUsed: key,
    confidence,
  };
}

export async function analyzeXORPayload(
  ciphertext: string,
  keyLengthHint?: number
): Promise<Array<{ key: string; result: XORResult; score: number }>> {
  const results: Array<{ key: string; result: XORResult; score: number }> = [];
  const buffer = Buffer.from(ciphertext, 'hex');

  const commonKeys = ['secret', 'key', 'password', 'admin', '123456', 'AES', 'xor', 'pass'];

  for (const key of commonKeys) {
    try {
      const result = await xorDecrypt(Buffer.from(ciphertext, 'hex').toString('utf8'), key);
      const printableRatio = result.decrypted.replace(/[^\x20-\x7E]/g, '').length / result.decrypted.length;
      const score = printableRatio * result.confidence;
      results.push({ key, result, score });
    } catch {
      continue;
    }
  }

  if (keyLengthHint && keyLengthHint > 0) {
    const extendedKeys = generateKeysForLength(keyLengthHint);
    for (const key of extendedKeys) {
      try {
        const result = await xorDecrypt(ciphertext, key);
        const printableRatio = result.decrypted.replace(/[^\x20-\x7E]/g, '').length / result.decrypted.length;
        const score = printableRatio * result.confidence;
        results.push({ key, result, score });
      } catch {
        continue;
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 10);
}

function generateKeysForLength(length: number): string[] {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const keys: string[] = [];

  function generate(current: string): void {
    if (current.length === length) {
      keys.push(current);
      return;
    }
    for (const char of chars) {
      generate(current + char);
    }
  }

  generate('');
  return keys.slice(0, 100);
}