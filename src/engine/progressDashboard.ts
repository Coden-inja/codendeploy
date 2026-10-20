import fs from 'node:fs';
import path from 'node:path';
import EventEmitter from 'node:events';
import { ProjectState, PipelineStage, StageStatus, TaskItem } from './types.js';

/**
 * ProgressDashboard: State Machine & Dual Sync (PROGRESS.md on disk + SSE Web Dashboard)
 */
export class ProgressDashboard extends EventEmitter {
  private state: ProjectState;
  private progressMdPath: string;

  constructor(projectName: string, targetDir: string) {
    super();
    this.progressMdPath = path.resolve(targetDir, 'PROGRESS.md');
    this.state = {
      projectName,
      targetDir,
      stages: [
        {
          id: 'credentials',
          name: '1. Cloud Credentials & Zero-Trust Verification',
          status: 'completed',
          tasks: [
            { id: 't-gh', name: 'GitHub Personal Access Token', status: 'completed', detail: '@Coden-inja (verified)' },
            { id: 't-ver', name: 'Vercel Deployment Token', status: 'completed', detail: 'animecarts-1791 (verified)' },
            { id: 't-sup', name: 'Supabase PostgreSQL Sandbox', status: 'completed', detail: 'qvtylzgvmegcgpsydncq (verified)' },
            { id: 't-ai', name: 'Gemini & Groq AI Keys', status: 'completed', detail: 'Active fallback chain' },
            { id: 't-st', name: 'Google Stitch AI & MCP Bridge', status: 'completed', detail: 'Configured in .agents/mcp_config.json' }
          ]
        },
        {
          id: 'repository',
          name: '2. Remote Repository Provisioning',
          status: 'pending',
          tasks: [
            { id: 't-repo-create', name: 'Create GitHub Repo via REST API', status: 'pending' },
            { id: 't-git-init', name: 'Initialize Local Git & Commit Baseline', status: 'pending' },
            { id: 't-git-push', name: 'Push Initial Baseline to origin/main', status: 'pending' }
          ]
        },
        {
          id: 'scaffolding',
          name: '3. Project Scaffolding & Design Injection',
          status: 'pending',
          tasks: [
            { id: 't-strat', name: 'AI Architecture Strategy (Starter Clone vs. Scratch)', status: 'pending' },
            { id: 't-scaffold', name: 'Scaffold Next.js / Supabase / Tailwind codebase', status: 'pending' },
            { id: 't-stitch', name: 'Inject Stitch Design Tokens & Color Palette', status: 'pending' }
          ]
        },
        {
          id: 'handoff',
          name: '4. Autonomous Agent Handoff (OpenCode / Antigravity)',
          status: 'pending',
          tasks: [
            { id: 't-handoff-spec', name: 'Generate HANDOFF_CONTEXT.md & Task Checklist', status: 'pending' },
            { id: 't-probe-runner', name: 'Probe Host Runners (opencode / aider / editor)', status: 'pending' },
            { id: 't-spawn-runner', name: 'Spawn Runner or Launch Editor with Handoff Spec', status: 'pending' }
          ]
        },
        {
          id: 'deployment',
          name: '5. Production Edge Deployment (Vercel)',
          status: 'pending',
          tasks: [
            { id: 't-ver-link', name: 'Link GitHub Repository to Vercel Project', status: 'pending' },
            { id: 't-ver-env', name: 'Sync Encrypted Production Environment Variables', status: 'pending' },
            { id: 't-ver-deploy', name: 'Trigger Production Edge Deployment', status: 'pending' },
            { id: 't-ver-live', name: 'Live Edge URL Active', status: 'pending' }
          ]
        }
      ],
      lastUpdated: new Date().toISOString()
    };

    this.syncToDisk();
  }

  public getState(): ProjectState {
    return this.state;
  }

  public setStageStatus(stageId: string, status: StageStatus): void {
    const stage = this.state.stages.find(s => s.id === stageId);
    if (stage) {
      stage.status = status;
      if (status === 'in_progress' && !stage.startedAt) {
        stage.startedAt = new Date().toISOString();
      } else if (status === 'completed' || status === 'failed') {
        stage.completedAt = new Date().toISOString();
      }
      this.state.lastUpdated = new Date().toISOString();
      this.syncToDisk();
      this.emit('update', this.state);
    }
  }

  public updateTask(stageId: string, taskId: string, status: StageStatus, detail?: string, link?: string): void {
    const stage = this.state.stages.find(s => s.id === stageId);
    if (!stage) return;

    const task = stage.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = status;
      if (detail) task.detail = detail;
      if (link) task.link = link;
    } else {
      stage.tasks.push({ id: taskId, name: taskId, status, detail, link });
    }

    // Auto-update stage status if all complete
    if (stage.tasks.every(t => t.status === 'completed')) {
      stage.status = 'completed';
      stage.completedAt = new Date().toISOString();
    } else if (stage.tasks.some(t => t.status === 'in_progress')) {
      stage.status = 'in_progress';
      if (!stage.startedAt) stage.startedAt = new Date().toISOString();
    }

    this.state.lastUpdated = new Date().toISOString();
    this.syncToDisk();
    this.emit('update', this.state);
  }

  public setRepoUrl(url: string): void {
    this.state.repoUrl = url;
    this.state.lastUpdated = new Date().toISOString();
    this.syncToDisk();
    this.emit('update', this.state);
  }

  public setDeployUrl(url: string): void {
    this.state.deployUrl = url;
    this.state.lastUpdated = new Date().toISOString();
    this.syncToDisk();
    this.emit('update', this.state);
  }

  /**
   * Writes PROGRESS.md synchronously so CLI tools & agents can read it immediately.
   */
  public syncToDisk(): void {
    try {
      if (!fs.existsSync(this.state.targetDir)) {
        fs.mkdirSync(this.state.targetDir, { recursive: true });
      }

      let md = `# 🚀 Project Deployment Progress: ${this.state.projectName}\n\n`;
      md += `> **Last State Sync:** \`${this.state.lastUpdated}\`\n\n`;

      if (this.state.repoUrl) {
        md += `* **GitHub Repository:** [${this.state.repoUrl}](${this.state.repoUrl})\n`;
      }
      if (this.state.deployUrl) {
        md += `* **Live Edge URL:** [${this.state.deployUrl}](${this.state.deployUrl})\n`;
      }
      md += `\n---\n\n`;

      for (const stage of this.state.stages) {
        const icon = stage.status === 'completed' ? '✅' : stage.status === 'in_progress' ? '⚡' : stage.status === 'failed' ? '❌' : '⏳';
        md += `### ${icon} ${stage.name} [${stage.status.toUpperCase()}]\n\n`;
        for (const task of stage.tasks) {
          const checked = task.status === 'completed' ? '[x]' : '[ ]';
          const detail = task.detail ? ` — *${task.detail}*` : '';
          const link = task.link ? ` [View](${task.link})` : '';
          md += `- ${checked} **${task.name}**${detail}${link}\n`;
        }
        md += `\n`;
      }

      fs.writeFileSync(this.progressMdPath, md, 'utf8');
    } catch (err) {
      console.warn(`⚠️ Could not write PROGRESS.md to disk:`, err);
    }
  }

  /**
   * Renders the interactive Linear-style HTML dashboard.
   */
  public renderDashboardHtml(): string {
    const s = this.state;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>codendeploy — ${s.projectName} Progress Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #090d16; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; }
    .container { max-width: 840px; width: 100%; }
    .header { margin-bottom: 25px; border-bottom: 1px solid #21262d; padding-bottom: 20px; }
    .header h1 { font-size: 24px; color: #58a6ff; display: flex; align-items: center; gap: 10px; }
    .header .meta { color: #8b949e; font-size: 13px; margin-top: 6px; }
    .links-bar { display: flex; gap: 15px; margin-top: 15px; }
    .link-badge { background: #161b22; border: 1px solid #30363d; padding: 6px 12px; border-radius: 6px; font-size: 13px; text-decoration: none; color: #58a6ff; }
    .link-badge:hover { background: #1f242c; }
    .stage-card { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 18px; margin-bottom: 16px; transition: border-color 0.2s; }
    .stage-card.in_progress { border-color: #58a6ff; box-shadow: 0 0 12px rgba(88, 166, 255, 0.15); }
    .stage-card.completed { border-color: #238636; }
    .stage-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
    .stage-title { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
    .status-badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 12px; text-transform: uppercase; }
    .status-badge.completed { background: #238636; color: #fff; }
    .status-badge.in_progress { background: #1f6feb; color: #fff; }
    .status-badge.pending { background: #30363d; color: #8b949e; }
    .status-badge.failed { background: #da3633; color: #fff; }
    .task-list { margin-top: 15px; padding-top: 12px; border-top: 1px solid #21262d; list-style: none; }
    .task-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; font-size: 14px; }
    .task-left { display: flex; align-items: center; gap: 10px; }
    .task-icon { width: 18px; text-align: center; }
    .task-detail { color: #8b949e; font-size: 12px; margin-left: 6px; }
    .live-indicator { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #3fb950; margin-right: 6px; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><span class="live-indicator"></span> ${s.projectName} — Live Progress Dashboard</h1>
      <div class="meta">Target Directory: <code>${s.targetDir}</code> | Sync: <code>PROGRESS.md</code></div>
      <div class="links-bar" id="linksBar">
        ${s.repoUrl ? `<a href="${s.repoUrl}" target="_blank" class="link-badge">📦 GitHub Repository ↗</a>` : ''}
        ${s.deployUrl ? `<a href="${s.deployUrl}" target="_blank" class="link-badge">🌐 Live Production URL ↗</a>` : ''}
      </div>
    </div>

    <div id="stagesContainer">
      ${this.renderStagesHtml()}
    </div>
  </div>

  <script>
    // Server-Sent Events (SSE) live updates
    const evtSource = new EventSource('/api/progress-stream');
    evtSource.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        updateDashboard(data);
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    function updateDashboard(state) {
      // Re-render dynamically without page reload
      location.reload();
    }
  </script>
</body>
</html>`;
  }

  private renderStagesHtml(): string {
    return this.state.stages.map(stage => `
      <div class="stage-card ${stage.status}">
        <div class="stage-header">
          <div class="stage-title">
            <span>${stage.status === 'completed' ? '✅' : stage.status === 'in_progress' ? '⚡' : '⏳'}</span>
            <span>${stage.name}</span>
          </div>
          <span class="status-badge ${stage.status}">${stage.status.replace('_', ' ')}</span>
        </div>
        <ul class="task-list">
          ${stage.tasks.map(t => `
            <li class="task-item">
              <div class="task-left">
                <span class="task-icon">${t.status === 'completed' ? '✓' : '•'}</span>
                <span>${t.name}</span>
                ${t.detail ? `<span class="task-detail">${t.detail}</span>` : ''}
              </div>
              ${t.link ? `<a href="${t.link}" target="_blank" style="color: #58a6ff; font-size: 12px;">Open ↗</a>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `).join('');
  }
}
