import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface GitHubPublishResult {
  success: boolean;
  url?: string;
  message: string;
}

/**
 * Publishes an SRE post-mortem report to GitHub, or saves it locally as a fallback.
 * 
 * @param incidentId The ID of the incident (e.g. INC-2026-DEMO-001)
 * @param title The report title
 * @param content The markdown report text
 */
export async function publishPostMortem(
  incidentId: string,
  title: string,
  content: string
): Promise<GitHubPublishResult> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // Expected format: 'owner/repo'

  const fileName = `${incidentId.toLowerCase()}-postmortem.md`;
  const relativeFilePath = `post-mortems/${fileName}`;

  // Fallback: Ensure local save path exists
  const localDir = path.join(__dirname, '../../data/post-mortems');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  const localFilePath = path.join(localDir, fileName);

  try {
    // Write locally first for audit trail compliance
    fs.writeFileSync(localFilePath, content, 'utf8');
    console.log(`[GitHub Tool] Saved post-mortem locally to: ${localFilePath}`);
  } catch (err: any) {
    console.error(`[GitHub Tool] Failed to write local copy: ${err.message}`);
  }

  // If credentials are not configured, return fallback success
  if (!token || !repo || token.includes('your_github_token') || repo.includes('your_github_repo')) {
    const msg = 'GitHub integrations credentials not configured. Saved locally.';
    console.warn(`[GitHub Tool] ${msg}`);
    return {
      success: true,
      message: msg,
      url: `file://${localFilePath}`,
    };
  }

  try {
    const url = `https://api.github.com/repos/${repo}/contents/${relativeFilePath}`;
    
    // Step 1: Check if file already exists to get its blob SHA (required for updates)
    let sha: string | undefined = undefined;
    const getRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'incident-response-agent',
      },
    });

    if (getRes.status === 200) {
      const getBody = (await getRes.json()) as { sha: string };
      sha = getBody.sha;
    }

    // Step 2: Push or update the file on GitHub
    const base64Content = Buffer.from(content).toString('base64');
    const commitBody = {
      message: `docs(post-mortem): publish report for ${incidentId} - ${title}`,
      content: base64Content,
      sha,
    };

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'incident-response-agent',
      },
      body: JSON.stringify(commitBody),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      throw new Error(`GitHub API response failed (${putRes.status}): ${errText}`);
    }

    const putBody = (await putRes.json()) as { content: { html_url: string } };
    console.log(`[GitHub Tool] Successfully committed post-mortem to GitHub: ${putBody.content.html_url}`);
    
    return {
      success: true,
      message: 'Committed to GitHub successfully.',
      url: putBody.content.html_url,
    };
  } catch (error: any) {
    console.error(`[GitHub Tool] Failed to publish to GitHub: ${error.message}`);
    return {
      success: false,
      message: `Failed to commit to GitHub: ${error.message}. Saved locally.`,
      url: `file://${localFilePath}`,
    };
  }
}
