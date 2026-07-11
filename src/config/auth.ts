import * as jose from 'jose';
import { Request, Response, NextFunction } from 'express';

import crypto from 'crypto';

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('[Security] JWT_SECRET missing in environment. Generating a secure random secret key for this session...');
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.JWT_SECRET = JWT_SECRET;
}
const JWT_EXPIRY = process.env.JWT_EXPIRY || '3600';

const secretKey = new TextEncoder().encode(JWT_SECRET);

/**
 * Generates a signed JWT token.
 */
export async function generateToken(payload: Record<string, any>): Promise<string> {
  const expiryValue = isNaN(Number(JWT_EXPIRY)) ? JWT_EXPIRY : `${JWT_EXPIRY}s`;
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiryValue)
    .sign(secretKey);
}

/**
 * Verifies a JWT token.
 */
export async function verifyJWT(token: string): Promise<Record<string, any>> {
  const { payload } = await jose.jwtVerify(token, secretKey);
  return payload;
}

// ----------------------------------------------------
// In-Memory Rate Limiting
// ----------------------------------------------------
interface RateLimitBucket {
  startTime: number;
  requestCount: number;
}

const rateLimitMap = new Map<string, RateLimitBucket>();

// Automatically clean up expired buckets every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const WINDOW_LIMIT_MS = 15 * 60 * 1000;

const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  const cutoff = now - WINDOW_LIMIT_MS;
  for (const [ip, bucket] of rateLimitMap.entries()) {
    if (bucket.startTime < cutoff) {
      rateLimitMap.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS);

// unref prevents the interval from keeping the Node process alive during test runs or shutdown
if (typeof rateLimitCleanupInterval.unref === 'function') {
  rateLimitCleanupInterval.unref();
}

/**
 * Express middleware to enforce request rate limits per IP address.
 */
export function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip =
    (req.headers['x-forwarded-for'] as string) ||
    req.socket.remoteAddress ||
    'unknown-ip';

  const now = Date.now();
  const cutoff = now - WINDOW_LIMIT_MS;

  let bucket = rateLimitMap.get(ip);

  if (!bucket || bucket.startTime < cutoff) {
    bucket = { startTime: now, requestCount: 1 };
    rateLimitMap.set(ip, bucket);
  } else {
    bucket.requestCount++;
  }

  if (bucket.requestCount > 100) {
    console.warn(`[Auth] Rate limit exceeded for IP: ${ip} (${bucket.requestCount} requests)`);
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again after 15 minutes.',
    });
  }

  next();
}

// ----------------------------------------------------
// Express Authentication Middleware
// ----------------------------------------------------
export interface AuthenticatedRequest extends Request {
  user?: Record<string, any>;
}

/**
 * Express middleware requiring a valid Bearer JWT.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn(`[Auth] Blocked request to ${req.originalUrl} - Missing or malformed authorization header`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or expired token space',
    });
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifyJWT(token);
    req.user = payload;
    next();
  } catch (error: any) {
    console.warn(`[Auth] Blocked request to ${req.originalUrl} - Token verification failed: ${error.message}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or expired token space',
    });
  }
}
