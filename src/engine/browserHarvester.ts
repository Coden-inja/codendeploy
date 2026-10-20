import http from 'node:http';
import { exec } from 'node:child_process';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { verifyToken } from './tokenVerifier.js';
import { RequiredToken, VerificationResult } from './types.js';
import { ProgressDashboard } from './progressDashboard.js';

let activeDashboard: ProgressDashboard | null = null;

export function setActiveDashboard(dashboard: ProgressDashboard | null): void {
  activeDashboard = dashboard;
}

/**
 * BrowserHarvester: Automated browser launcher & local loopback server
 * Captures cloud tokens without requiring manual terminal copy-paste.
 */

export function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd = '';

  if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, (err) => {
    if (err) {
      console.warn(`⚠️ Could not automatically launch browser. Please open: ${url}`);
    }
  });
}

export interface HarvestedKey {
  envKey: string;
  service: string;
  value: string;
  verification: VerificationResult;
}

/**
 * Spins up a temporary local loopback server on 127.0.0.1
 * Serves an interactive, human-in-the-loop key collection helper page,
 * captures tokens via HTTP POST or query params, runs live verification,
 * and writes valid keys to .env automatically.
 */
export async function harvestTokensInteractively(
  requiredTokens: RequiredToken[],
  targetEnvPath: string = path.resolve(process.cwd(), '.env'),
  port: number = 4242
): Promise<HarvestedKey[]> {
  return new Promise((resolve, reject) => {
    const harvested: Map<string, HarvestedKey> = new Map();
    const missingTokens = [...requiredTokens];

    const server = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);

      // API: Save key endpoint
      if (req.method === 'POST' && parsedUrl.pathname === '/api/save-token') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body) as { service: string; envKey: string; value: string; extraUrl?: string };
            const { service, envKey, value, extraUrl } = payload;

            console.log(`\n📨 [HTTP POST /api/save-token] Inbound key verification request:`);
            console.log(`   ├─ Service: ${service.toUpperCase()}`);
            console.log(`   ├─ Target Env Var: ${envKey}`);
            console.log(`   └─ Value Fingerprint: ${value ? value.slice(0, 8) + '...' + value.slice(-4) : '(empty)'}`);

            if (!value || value.trim() === '') {
              console.warn(`⚠️ [Verify Rejected] Token value was empty.`);
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Token value cannot be empty' }));
              return;
            }

            console.log(`🔍 [Cloud Probe] Pinging ${service.toUpperCase()} REST API with timeout budget...`);
            // Zero-Trust verify against live API
            const verification = await verifyToken(service, value.trim(), extraUrl);

            if (!verification.valid) {
              console.error(`❌ [Verification Failed] ${service.toUpperCase()}: ${verification.error} (${verification.latencyMs}ms)`);
              res.writeHead(422, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: verification.error || 'Token verification failed against cloud API',
                latencyMs: verification.latencyMs
              }));
              return;
            }

            console.log(`✅ [Verification Success] ${service.toUpperCase()} authenticated in ${verification.latencyMs}ms!`);
            console.log(`   └─ Identity / Scope: ${verification.identity}`);

            // Save to internal state
            harvested.set(envKey, {
              envKey,
              service,
              value: value.trim(),
              verification,
            });

            // Write/append to .env atomically
            console.log(`💾 [Syscall I/O] Node fs.writeFileSync appending ${envKey} to ${targetEnvPath}`);
            appendKeyToEnv(targetEnvPath, envKey, value.trim());
            if (extraUrl && (service === 'supabase')) {
              console.log(`💾 [Syscall I/O] Node fs.writeFileSync appending NEXT_PUBLIC_SUPABASE_URL to ${targetEnvPath}`);
              appendKeyToEnv(targetEnvPath, 'NEXT_PUBLIC_SUPABASE_URL', extraUrl.trim());
            }

            // If Google Stitch, configure MCP bridge automatically
            if (service === 'stitch') {
              console.log(`🔌 [MCP Bridge] Node fs.writeFileSync configuring Stitch MCP in .agents/mcp_config.json`);
              writeStitchMcpConfig(process.cwd(), value.trim());
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              identity: verification.identity,
              latencyMs: verification.latencyMs,
              remaining: missingTokens.length - harvested.size,
            }));

            // Check if all collected
            if (harvested.size >= missingTokens.length) {
              console.log(`🎉 [Harvester Complete] All requested keys collected and verified!`);
              setTimeout(() => {
                server.close(() => {
                  resolve(Array.from(harvested.values()));
                });
              }, 1200);
            }
          } catch (err: unknown) {
            console.error(`💥 [Harvester Internal Error]:`, err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      // Serve the Interactive Harvester UI
      if (parsedUrl.pathname === '/') {
        console.log(`🌐 [HTTP GET /] Client connected from ${req.socket.remoteAddress || '127.0.0.1'} — Rendering Harvester Dashboard`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderHarvesterHtml(missingTokens, port));
        return;
      }

      // Serve the Live Progress Dashboard
      if (parsedUrl.pathname === '/dashboard') {
        if (activeDashboard) {
          console.log(`📊 [HTTP GET /dashboard] Serving Live Project Progress Dashboard`);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(activeDashboard.renderDashboardHtml());
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body style="font-family:sans-serif; background:#0d1117; color:#8b949e; padding:40px; text-align:center;">
            <h2>⏳ No Active Project Pipeline</h2>
            <p>The orchestrator has not initialized a project pipeline yet.</p>
          </body></html>`);
        }
        return;
      }

      // API: Server-Sent Events (SSE) Stream for real-time dashboard updates
      if (parsedUrl.pathname === '/api/progress-stream') {
        if (!activeDashboard) {
          res.writeHead(404);
          res.end();
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write(`data: ${JSON.stringify(activeDashboard.getState())}\n\n`);

        const listener = (state: unknown) => {
          res.write(`data: ${JSON.stringify(state)}\n\n`);
        };

        activeDashboard.on('update', listener);
        req.on('close', () => {
          if (activeDashboard) {
            activeDashboard.off('update', listener);
          }
        });
        return;
      }

      // API: JSON State endpoint
      if (parsedUrl.pathname === '/api/project-state') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(activeDashboard ? activeDashboard.getState() : { error: 'No active pipeline' }));
        return;
      }

      // Static close page
      if (parsedUrl.pathname === '/done') {
        console.log(`🏁 [HTTP GET /done] Harvester complete page rendered.`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0d1117; color: #58a6ff;">
          <h2>✅ All Keys Harvested & Verified!</h2>
          <p>Saved securely to local .env. You can view progress at <a href="/dashboard" style="color: #58a6ff;">/dashboard</a>.</p>
        </body></html>`);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(port, '127.0.0.1', () => {
      const helperUrl = `http://127.0.0.1:${port}/`;
      console.log(`\n🌐 [Browser Harvester Active] Listening at: ${helperUrl}`);
      console.log(`🚀 Launching your browser to auto-collect missing cloud keys...`);
      openBrowser(helperUrl);
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

function appendKeyToEnv(envPath: string, key: string, value: string): void {
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }

  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    // Replace existing
    content = content.replace(regex, `${key}=${value}`);
  } else {
    // Append
    content += `\n${key}=${value}\n`;
  }

  fs.writeFileSync(envPath, content.trim() + '\n', 'utf8');
}

function writeStitchMcpConfig(workspaceRoot: string, apiKey: string): void {
  const agentsDir = path.resolve(workspaceRoot, '.agents');
  const mcpConfigFile = path.resolve(agentsDir, 'mcp_config.json');

  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  let config: { mcpServers?: Record<string, unknown> } = {};
  if (fs.existsSync(mcpConfigFile)) {
    try {
      config = JSON.parse(fs.readFileSync(mcpConfigFile, 'utf8'));
    } catch {
      config = {};
    }
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  config.mcpServers['stitch'] = {
    command: 'npx',
    args: ['-y', '@google/stitch-mcp'],
    env: {
      STITCH_API_KEY: apiKey,
    },
  };

  fs.writeFileSync(mcpConfigFile, JSON.stringify(config, null, 2), 'utf8');
  console.log(`🔌 [MCP Bridge] Configured Google Stitch MCP in ${mcpConfigFile}`);
}

function renderHarvesterHtml(tokens: RequiredToken[], port: number): string {
  const cardsHtml = tokens.map((t, idx) => `
    <div class="card" id="card-${t.envKey}">
      <div class="card-header">
        <span class="service-badge ${t.service}">${t.service.toUpperCase()}</span>
        <h3>${t.name}</h3>
      </div>
      <p class="desc">${t.whyNeeded}</p>
      
      <div class="action-row">
        <a href="${t.deepLink}" target="_blank" class="btn btn-primary" onclick="markOpened('${t.envKey}')">
          1. Open ${t.service.toUpperCase()} Dashboard ↗
        </a>
      </div>

      ${t.service === 'supabase' ? `
        <div class="input-group" style="margin-top: 10px;">
          <label>Project URL (https://xyz.supabase.co):</label>
          <input type="text" id="url-${t.envKey}" placeholder="https://your-project.supabase.co" />
        </div>
      ` : ''}

      <div class="input-group">
        <label>Key Value (or paste from clipboard):</label>
        <div class="input-row">
          <input type="password" id="input-${t.envKey}" placeholder="Paste key here (e.g. ghp_..., sk_test_...)" />
          <button class="btn btn-paste" onclick="pasteFromClipboard('${t.envKey}')">📋 Paste</button>
          <button class="btn btn-verify" id="btn-verify-${t.envKey}" onclick="submitKey('${t.service}', '${t.envKey}')">Verify & Save</button>
        </div>
      </div>
      
      <div class="status" id="status-${t.envKey}">Awaiting input...</div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>codendeploy — Automated Key Harvester</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #090d16; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; }
    .container { max-width: 780px; width: 100%; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { font-size: 26px; color: #58a6ff; margin-bottom: 8px; }
    .header p { color: #8b949e; font-size: 15px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    .card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .service-badge { font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 12px; }
    .service-badge.github { background: #238636; color: white; }
    .service-badge.vercel { background: #ffffff; color: black; }
    .service-badge.supabase { background: #3ecf8e; color: black; }
    .service-badge.stripe { background: #635bff; color: white; }
    .service-badge.resend { background: #ea580c; color: white; }
    .service-badge.gemini { background: #4285f4; color: white; }
    .service-badge.groq { background: #f55036; color: white; }
    .service-badge.openai { background: #10a37f; color: white; }
    .service-badge.stitch { background: #ea4335; color: white; }
    .desc { color: #8b949e; font-size: 14px; margin-bottom: 15px; }


    .btn { padding: 9px 16px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; border: none; display: inline-flex; align-items: center; justify-content: center; }
    .btn-primary { background: #1f6feb; color: white; }
    .btn-primary:hover { background: #388bfd; }
    .btn-paste { background: #21262d; border: 1px solid #363b42; color: #c9d1d9; margin-left: 8px; }
    .btn-verify { background: #238636; color: white; margin-left: 8px; }
    .btn-verify:hover { background: #2ea043; }
    .input-group { margin-top: 15px; }
    .input-group label { display: block; font-size: 12px; color: #8b949e; margin-bottom: 6px; }
    .input-row { display: flex; align-items: center; }
    input[type="password"], input[type="text"] { flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 9px 12px; color: white; font-size: 14px; }
    input:focus { border-color: #58a6ff; outline: none; }
    .status { margin-top: 10px; font-size: 13px; color: #8b949e; }
    .status.success { color: #3fb950; font-weight: 500; }
    .status.error { color: #f85149; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚡ codendeploy Cloud Key Harvester</h1>
      <p>Human-in-the-Loop: Open the link, sign in or solve 2FA, then click Paste. Keys are verified live and written to your local .env.</p>
    </div>

    ${cardsHtml}
  </div>

  <script>
    async function pasteFromClipboard(envKey) {
      try {
        const text = await navigator.clipboard.readText();
        document.getElementById('input-' + envKey).value = text;
        const statusEl = document.getElementById('status-' + envKey);
        statusEl.innerText = 'Pasted from clipboard! Click "Verify & Save" to validate.';
      } catch (err) {
        alert('Please allow clipboard access or paste manually.');
      }
    }

    function markOpened(envKey) {
      const statusEl = document.getElementById('status-' + envKey);
      statusEl.innerText = 'Dashboard opened. If 2FA/Password is prompted, approve it, then copy your key.';
    }

    async function submitKey(service, envKey) {
      const inputEl = document.getElementById('input-' + envKey);
      const statusEl = document.getElementById('status-' + envKey);
      const btnEl = document.getElementById('btn-verify-' + envKey);
      const urlEl = document.getElementById('url-' + envKey);

      const val = inputEl.value.trim();
      const extraUrl = urlEl ? urlEl.value.trim() : undefined;

      if (!val) {
        statusEl.className = 'status error';
        statusEl.innerText = 'Please paste a token before verifying.';
        return;
      }

      btnEl.disabled = true;
      btnEl.innerText = 'Verifying...';
      statusEl.className = 'status';
      statusEl.innerText = 'Pinging cloud API...';

      try {
        const res = await fetch('/api/save-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service, envKey, value: val, extraUrl })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          statusEl.className = 'status success';
          statusEl.innerText = '✅ Verified (' + data.latencyMs + 'ms): ' + data.identity + ' — Saved to .env!';
          inputEl.disabled = true;
          btnEl.style.display = 'none';

          if (data.remaining === 0) {
            setTimeout(() => {
              window.location.href = '/done';
            }, 800);
          }
        } else {
          statusEl.className = 'status error';
          statusEl.innerText = '❌ Verification Failed: ' + (data.error || 'Unknown error');
          btnEl.disabled = false;
          btnEl.innerText = 'Try Again';
        }
      } catch (err) {
        statusEl.className = 'status error';
        statusEl.innerText = 'Network error contacting local server.';
        btnEl.disabled = false;
        btnEl.innerText = 'Verify & Save';
      }
    }
  </script>
</body>
</html>`;
}
