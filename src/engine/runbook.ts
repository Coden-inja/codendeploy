import { ProjectBlueprint, RequiredToken, VerificationResult } from './types.js';
import { verifyToken } from './tokenVerifier.js';
import fs from 'node:fs';

/**
 * Runbook Generator: Turns a ProjectBlueprint into an actionable,
 * human-readable credential checklist with deep links, and verifies provided keys.
 */

export function generateRunbookMarkdown(blueprint: ProjectBlueprint): string {
  let md = `# 🔑 Cloud Credentials Runbook: ${blueprint.projectName}\n\n`;
  md += `> **Category:** \`${blueprint.category}\` | **Hosting:** \`${blueprint.recommendedStack.hosting}\`\n`;
  md += `> **Summary:** ${blueprint.plainEnglishSummary}\n\n`;
  md += `To deploy this project to production with live database, authentication, and payments, provide the following **verified cloud keys**:\n\n`;

  md += `| Service | Environment Variable | Why It's Needed | Direct Setup Link |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;

  for (const token of blueprint.requiredTokens) {
    md += `| **${token.name}** | \`${token.envKey}\` | ${token.whyNeeded} | [Get Key Here](${token.deepLink}) |\n`;
  }

  md += `\n---\n\n`;
  md += `### 📄 Required \`.env\` Configuration\n\n`;
  md += `Paste the verified keys into your local \`.env\` file:\n\n`;
  md += `\`\`\`bash\n`;
  for (const token of blueprint.requiredTokens) {
    md += `# ${token.description}\n`;
    md += `${token.envKey}=\n\n`;
  }
  md += `\`\`\`\n\n`;

  md += `### 🛡️ Security Boundaries & Verification\n`;
  md += `- **Never commit your \`.env\` file to GitHub.** It is automatically added to \`.gitignore\`.\n`;
  md += `- Public/Anon keys are safe for frontend bundles; Service Role & Secret keys must remain server-side only.\n`;

  return md;
}

export interface TokenAuditSummary {
  allSatisfied: boolean;
  missingCount: number;
  verifiedCount: number;
  tokens: Array<{
    token: RequiredToken;
    provided: boolean;
    verification?: VerificationResult;
  }>;
}

/**
 * Audits a set of required tokens against an environment dictionary.
 * Performs live Zero-Trust verification against the respective cloud APIs.
 */
export async function auditTokens(
  requiredTokens: RequiredToken[],
  envVars: Record<string, string | undefined>
): Promise<TokenAuditSummary> {
  const auditTasks = requiredTokens.map(async (reqToken) => {
    const rawVal = envVars[reqToken.envKey];
    if (!rawVal || rawVal.trim() === '') {
      return {
        token: reqToken,
        provided: false,
      };
    }

    // Extra URL for Supabase (usually SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL)
    const extraUrl = envVars['SUPABASE_URL'] || envVars['NEXT_PUBLIC_SUPABASE_URL'];
    const verification = await verifyToken(reqToken.service, rawVal.trim(), extraUrl);

    return {
      token: { ...reqToken, isProvided: verification.valid, value: rawVal.trim() },
      provided: true,
      verification,
    };
  });

  const results = await Promise.all(auditTasks);

  const verifiedCount = results.filter(r => r.verification?.valid === true).length;
  const missingCount = results.length - verifiedCount;

  return {
    allSatisfied: missingCount === 0,
    missingCount,
    verifiedCount,
    tokens: results,
  };
}
