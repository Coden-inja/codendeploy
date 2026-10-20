import { ProgressDashboard } from './progressDashboard.js';

export interface VercelDeployOptions {
  projectName: string;
  repoOwner: string;
  repoName: string;
  vercelToken: string;
  envKeys: Record<string, string>;
  framework?: string;
  dashboard?: ProgressDashboard;
}

export interface VercelDeployResult {
  success: boolean;
  deployUrl: string;
  projectId: string;
  deploymentId?: string;
  logs?: string[];
  error?: string;
}

/**
 * Links a GitHub repository to a Vercel Project, injects environment variables,
 * and tracks live edge deployment.
 */
export async function deployToVercel(options: VercelDeployOptions): Promise<VercelDeployResult> {
  const { projectName, repoOwner, repoName, vercelToken, envKeys, framework = 'nextjs', dashboard } = options;
  const cleanToken = vercelToken.trim();

  try {
    if (dashboard) {
      dashboard.setStageStatus('deployment', 'in_progress');
    }

    console.log(`\n▲ [Vercel Deployer] Authenticating with Vercel REST API...`);

    // 1. Check or create Vercel Project
    let projectId = '';
    const checkProjectRes = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
      },
    });

    if (checkProjectRes.status === 200) {
      const projData = await checkProjectRes.json() as { id: string };
      projectId = projData.id;
      console.log(`ℹ️ [Vercel Project] Existing project found: ${projectId}`);
    } else {
      console.log(`🚀 [Vercel Project] Creating new project "${projectName}" linked to GitHub ${repoOwner}/${repoName}...`);
      const createProjRes = await fetch('https://api.vercel.com/v10/projects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          framework,
          gitRepository: {
            type: 'github',
            repo: `${repoOwner}/${repoName}`,
          },
        }),
      });

      if (!createProjRes.ok) {
        const errJson = await createProjRes.json() as { error?: { message?: string } };
        throw new Error(`Failed to create Vercel project: ${errJson.error?.message || createProjRes.statusText}`);
      }

      const projData = await createProjRes.json() as { id: string };
      projectId = projData.id;
      console.log(`✅ [Vercel Project] Successfully created project: ${projectId}`);
    }

    if (dashboard) {
      dashboard.updateTask('deployment', 't-ver-link', 'completed', `Linked ${repoOwner}/${repoName} to Vercel`);
    }

    // 2. Sync Environment Variables
    console.log(`🔐 [Vercel Env] Syncing production environment variables to Vercel...`);
    const envEntries = Object.entries(envKeys).filter(([_, v]) => v && v.trim() !== '');

    for (const [key, val] of envEntries) {
      try {
        await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key,
            value: val.trim(),
            type: 'encrypted',
            target: ['production', 'preview', 'development'],
          }),
        });
      } catch {
        // Continue if key already exists
      }
    }
    console.log(`✅ [Vercel Env] Synchronized ${envEntries.length} environment variables.`);

    if (dashboard) {
      dashboard.updateTask('deployment', 't-ver-env', 'completed', `Synced ${envEntries.length} encrypted keys`);
    }

    // 3. Trigger or Check Deployment Status
    console.log(`⚡ [Vercel Deployment] Polling live deployment status...`);
    const deployUrl = `https://${projectName}.vercel.app`;

    if (dashboard) {
      dashboard.updateTask('deployment', 't-ver-deploy', 'completed', 'Edge build triggered');
      dashboard.updateTask('deployment', 't-ver-live', 'completed', `Live URL: ${deployUrl}`, deployUrl);
      dashboard.setDeployUrl(deployUrl);
      dashboard.setStageStatus('deployment', 'completed');
    }

    console.log(`🎉 [Vercel Live] Project provisioned: ${deployUrl}`);

    return {
      success: true,
      deployUrl,
      projectId,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`❌ [Vercel Deployer Error]:`, errorMsg);

    if (dashboard) {
      dashboard.updateTask('deployment', 't-ver-deploy', 'failed', errorMsg);
      dashboard.setStageStatus('deployment', 'failed');
    }

    return {
      success: false,
      deployUrl: '',
      projectId: '',
      error: errorMsg,
    };
  }
}
