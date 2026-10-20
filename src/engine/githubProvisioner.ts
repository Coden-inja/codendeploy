import { exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ProgressDashboard } from './progressDashboard.js';

export interface GitHubProvisionOptions {
  repoName: string;
  description?: string;
  isPrivate?: boolean;
  targetDir: string;
  githubToken: string;
  dashboard?: ProgressDashboard;
}

export interface GitHubProvisionResult {
  success: boolean;
  repoUrl: string;
  cloneUrl: string;
  owner: string;
  repoName: string;
  alreadyExisted: boolean;
  error?: string;
}

function runGit(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Git command failed: "${cmd}" in ${cwd}\nStderr: ${stderr}\nStdout: ${stdout}`));
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

/**
 * Provisions a remote GitHub repository under the authenticated user account
 * and pushes the initial local git commit to origin/main.
 */
export async function provisionGitHubRepository(
  options: GitHubProvisionOptions
): Promise<GitHubProvisionResult> {
  const { repoName, description, isPrivate = false, targetDir, githubToken, dashboard } = options;
  const cleanToken = githubToken.trim();

  try {
    if (dashboard) {
      dashboard.setStageStatus('repository', 'in_progress');
    }

    // 1. Resolve authenticated user identity
    console.log(`\n🔍 [GitHub Provisioner] Identifying authenticated GitHub user...`);
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'codendeploy-provisioner',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!userRes.ok) {
      throw new Error(`Failed to authenticate with GitHub API (HTTP ${userRes.status}): ${userRes.statusText}`);
    }

    const userData = await userRes.json() as { login: string };
    const owner = userData.login;
    console.log(`👤 [GitHub User] Authenticated as @${owner}`);

    // 2. Check if repository already exists
    console.log(`🔍 [GitHub Probe] Checking if repository "${owner}/${repoName}" exists...`);
    const checkRepoRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'codendeploy-provisioner',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    let alreadyExisted = false;
    let repoUrl = `https://github.com/${owner}/${repoName}`;
    let cloneUrl = `https://github.com/${owner}/${repoName}.git`;

    if (checkRepoRes.status === 200) {
      alreadyExisted = true;
      const existingData = await checkRepoRes.json() as { html_url: string; clone_url: string };
      repoUrl = existingData.html_url;
      cloneUrl = existingData.clone_url;
      console.log(`ℹ️ [GitHub Provisioner] Repository already exists at: ${repoUrl}`);
    } else if (checkRepoRes.status === 404) {
      // 3. Create repository via REST API
      console.log(`🚀 [GitHub Provisioner] Creating remote repository "${owner}/${repoName}"...`);
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'codendeploy-provisioner',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          name: repoName,
          description: description || 'Scaffolded autonomously by codendeploy',
          private: isPrivate,
          auto_init: false,
        }),
      });

      if (!createRes.ok) {
        const errJson = await createRes.json() as { message?: string };
        throw new Error(`GitHub repo creation failed: ${errJson.message || createRes.statusText}`);
      }

      const createdData = await createRes.json() as { html_url: string; clone_url: string };
      repoUrl = createdData.html_url;
      cloneUrl = createdData.clone_url;
      console.log(`✅ [GitHub Provisioner] Repository successfully created: ${repoUrl}`);
    } else {
      throw new Error(`Unexpected GitHub API response checking repo: HTTP ${checkRepoRes.status}`);
    }

    if (dashboard) {
      dashboard.updateTask('repository', 't-repo-create', 'completed', `Repository: ${repoUrl}`, repoUrl);
      dashboard.setRepoUrl(repoUrl);
    }

    // 4. Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 5. Initialize Git locally
    console.log(`📦 [Local Git] Initializing repository in: ${targetDir}`);
    const isGitRepo = fs.existsSync(path.resolve(targetDir, '.git'));
    if (!isGitRepo) {
      await runGit('git init', targetDir);
      await runGit('git branch -M main', targetDir);
    }

    if (dashboard) {
      dashboard.updateTask('repository', 't-git-init', 'completed', 'Initialized local Git on main');
    }

    // Configure remote with token auth
    const authedRemoteUrl = `https://x-access-token:${cleanToken}@github.com/${owner}/${repoName}.git`;
    try {
      await runGit('git remote remove origin', targetDir);
    } catch {
      // Ignore if origin remote did not exist
    }
    await runGit(`git remote add origin "${authedRemoteUrl}"`, targetDir);

    // 6. Ensure baseline files exist before committing
    const gitignorePath = path.resolve(targetDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, 'node_modules\n.env\n.env.local\n.next\ndist\n.DS_Store\n', 'utf8');
    }

    const readmePath = path.resolve(targetDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(
        readmePath,
        `# ${repoName}\n\n${description || 'Autonomous application generated by codendeploy.'}\n\n- **Live Repository:** [${repoUrl}](${repoUrl})\n`,
        'utf8'
      );
    }

    // 7. Commit & Push
    console.log(`📤 [Git Push] Staging baseline files and committing...`);
    await runGit('git add -A', targetDir);

    try {
      await runGit('git commit -m "chore: initial codendeploy baseline"', targetDir);
    } catch {
      console.log('ℹ️ [Git Commit] Nothing to commit or working tree clean.');
    }

    console.log(`🚀 [Git Push] Pushing to origin/main...`);
    await runGit('git push -u origin main --force', targetDir);
    console.log(`🎉 [Git Push Success] Successfully pushed baseline to ${repoUrl}!`);

    if (dashboard) {
      dashboard.updateTask('repository', 't-git-push', 'completed', 'Pushed baseline to origin/main');
      dashboard.setStageStatus('repository', 'completed');
    }

    return {
      success: true,
      repoUrl,
      cloneUrl,
      owner,
      repoName,
      alreadyExisted,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`❌ [GitHub Provisioner Error]:`, errorMsg);

    if (dashboard) {
      dashboard.updateTask('repository', 't-repo-create', 'failed', errorMsg);
      dashboard.setStageStatus('repository', 'failed');
    }

    return {
      success: false,
      repoUrl: '',
      cloneUrl: '',
      owner: '',
      repoName,
      alreadyExisted: false,
      error: errorMsg,
    };
  }
}
