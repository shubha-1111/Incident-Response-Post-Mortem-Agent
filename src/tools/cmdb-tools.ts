import axios from 'axios';
import { traceAgentStep } from '../config/otel.js';

export type AssetCriticality = 'standard' | 'high_impact';

const PROTECTED_ASSET_PATTERNS: RegExp[] = [
  /load.?balancer/i,
  /prod.?db/i,
  /domain.?controller/i,
  /dc-\d+/i,
  /ldap/i,
  /auth.?server/i,
  /payment/i,
  /hsm/i,
];

/**
 * Retrieves asset criticality for a target host from the CMDB registry.
 */
export async function getAssetCriticality(host: string): Promise<AssetCriticality> {
  return traceAgentStep('cmdb-tools', 'asset-lookup', async (span) => {
    span.setAttribute('host.name', host);

    // Step 1 — Check deny-list first (before any API call)
    for (const pattern of PROTECTED_ASSET_PATTERNS) {
      if (pattern.test(host)) {
        console.warn(`[CMDB] Host ${host} matched protected class deny-list pattern: ${pattern}. Defaulting to high_impact.`);
        return 'high_impact';
      }
    }

    const CMDB_API_URL = process.env.CMDB_API_URL;
    const CMDB_API_KEY = process.env.CMDB_API_KEY;

    if (!CMDB_API_URL || !CMDB_API_KEY || CMDB_API_URL.includes('YOUR_ENDPOINT')) {
      // No CMDB configured: this host already cleared the protected-class deny-list above,
      // so treat it as standard criticality rather than forcing every incident into
      // high-impact/human-approval purely because CMDB integration isn't set up.
      console.warn(`[CMDB] CMDB API config missing or mock. Defaulting to standard for host: ${host}.`);
      return 'standard';
    }

    try {
      // Step 2 — Call CMDB API
      const response = await axios.get(`${CMDB_API_URL}/assets/${encodeURIComponent(host)}`, {
        headers: { Authorization: `Bearer ${CMDB_API_KEY}` },
        timeout: 3000,
      });

      // Step 3 — Parse response
      const criticality = response.data?.criticality;
      if (criticality === 'high_impact') {
        return 'high_impact';
      }
      if (criticality === 'standard') {
        return 'standard';
      }

      console.warn(`[CMDB] Unexpected criticality value received: ${criticality} for host ${host}. Defaulting to high_impact.`);
      return 'high_impact';
    } catch (error: any) {
      // Step 4 — Default-deny on ANY failure (timeout, 404, network error, unexpected response shape)
      console.error(`[CMDB] Error during asset lookup for host ${host}. Falling back to high_impact. Reason: ${error.message}`);
      return 'high_impact';
    }
  });
}
