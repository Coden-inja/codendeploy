import { exec } from 'node:child_process';
import process from 'node:process';
import { HostEnvironment } from './types.js';

import fs from 'node:fs';
import path from 'node:path';

/**
 * Checks if a specific CLI binary exists in the host system's PATH.
 */
export function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where.exe ${cmd}` : `which ${cmd}`;

    exec(checkCmd, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Probes host machine to discover available developer tools, runners, and editors.
 * Specifically checks for Antigravity IDE runtime environment before falling back to VS Code.
 */
export async function probeHostEnvironment(): Promise<HostEnvironment> {
  const antigravityLocalExe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe');
  const isInsideAntigravity = Boolean(
    process.env.ANTIGRAVITY_AGENT ||
    process.env.ANTIGRAVITY_EDITOR_APP_ROOT ||
    fs.existsSync(antigravityLocalExe)
  );

  const [hasGit, hasGhCli, hasOpenCode, hasAider, hasVsCode, hasCursor] = await Promise.all([
    commandExists('git'),
    commandExists('gh'),
    commandExists('opencode'),
    commandExists('aider'),
    commandExists('code'),
    commandExists('cursor')
  ]);

  let preferredEditor: 'vscode' | 'antigravity' | 'cursor' | 'terminal' = 'terminal';
  let editorCmd = '';

  // Prioritize Antigravity IDE (AI Native with free reasoning models)
  if (isInsideAntigravity) {
    preferredEditor = 'antigravity';
    editorCmd = antigravityLocalExe;
  } else if (hasCursor) {
    preferredEditor = 'cursor';
    editorCmd = 'cursor';
  } else if (hasVsCode) {
    preferredEditor = 'vscode';
    editorCmd = 'code';
  }

  return {
    hasGit,
    hasGhCli,
    hasOpenCode,
    hasAider,
    preferredEditor,
    editorCmd
  };
}

/**
 * Opens a project folder in the user's preferred graphical code editor.
 */
export function openInEditor(targetPath: string, preferredEditor?: string): void {
  const platform = process.platform;
  let cmd = '';

  if (preferredEditor === 'antigravity') {
    const antigravityExe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe');
    if (fs.existsSync(antigravityExe)) {
      cmd = `"${antigravityExe}" "${targetPath}"`;
    } else {
      cmd = `code "${targetPath}"`;
    }
  } else if (preferredEditor === 'cursor') {
    cmd = `cursor "${targetPath}"`;
  } else if (preferredEditor === 'vscode' || preferredEditor === 'code') {
    cmd = `code "${targetPath}"`;
  } else {
    // OS File Manager fallback
    if (platform === 'win32') {
      cmd = `explorer.exe "${targetPath}"`;
    } else if (platform === 'darwin') {
      cmd = `open "${targetPath}"`;
    } else {
      cmd = `xdg-open "${targetPath}"`;
    }
  }

  exec(cmd, (err) => {
    if (err) {
      console.warn(`⚠️ Could not automatically launch editor: ${err.message}`);
    } else {
      console.log(`🖥️ [Editor Launched] Opened ${targetPath}`);
    }
  });
}

/**
 * Opens a new terminal window rooted inside the newly scaffolded project.
 * Optionally runs an initial command (e.g. `opencode` or `npm run dev`).
 */
export async function openInTerminal(targetPath: string, commandToRun?: string): Promise<void> {
  const platform = process.platform;
  let cmd = '';

  if (platform === 'win32') {
    const hasWt = await commandExists('wt');
    const shellCmd = commandToRun ? `${commandToRun}` : 'echo "🚀 Project directory ready."';
    if (hasWt) {
      cmd = `start wt.exe -d "${targetPath}" powershell -NoExit -Command "${shellCmd}"`;
    } else {
      cmd = `start powershell.exe -NoExit -Command "cd '${targetPath}'; ${shellCmd}"`;
    }
  } else if (platform === 'darwin') {
    const execScript = commandToRun ? `cd '${targetPath}' && ${commandToRun}` : `cd '${targetPath}'`;
    cmd = `osascript -e 'tell app "Terminal" to do script "${execScript}"'`;
  } else {
    const execScript = commandToRun ? `cd '${targetPath}' && ${commandToRun}; exec bash` : `cd '${targetPath}'; exec bash`;
    cmd = `x-terminal-emulator -e bash -c "${execScript}"`;
  }

  exec(cmd, (err) => {
    if (err) {
      console.warn(`⚠️ Could not spawn new terminal window: ${err.message}`);
    } else {
      console.log(`⚡ [Terminal Spawned] Booted terminal inside ${targetPath}`);
    }
  });
}
