'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { rateLimit } = require('../middleware/rateLimit');
const { validateProjectId } = require('../lib/validators');
const { loadConfig } = require('../lib/config');
const { discoverProjects } = require('../lib/discovery');
const { listAgents } = require('../lib/cache');
const { listMdFiles } = require('../lib/discovery');
const { execSync } = require('child_process');
const { readFileSafe, ensureDir } = require('../lib/atomicIo');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');

// Per-conversation mutex prevents lost-update on concurrent message sends to
// the same conversation_id. Each chain awaits the previous before reading.
const conversationLocks = new Map();
function withConversationLock(key, fn) {
  const prev = conversationLocks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);  // run fn whether prev resolved or rejected
  conversationLocks.set(key, next.catch(() => {}));
  // GC: drop entry once chain settles + no one else has appended.
  next.finally(() => {
    if (conversationLocks.get(key) === next) conversationLocks.delete(key);
  });
  return next;
}

// GET /api/projects
router.get('/projects', (req, res) => {
  const config = loadConfig();
  const projects = discoverProjects(config.projectDirs);
  res.json(projects);
});

// GET /api/browse
router.get('/browse', rateLimit('read'), (req, res) => {
  let targetPath = (req.query.path || HOME).replace(/^~/, HOME);
  if (typeof targetPath !== 'string' || targetPath.includes('\0')) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  targetPath = path.resolve(targetPath);
  if (!targetPath.startsWith(HOME)) {
    return res.status(403).json({ error: 'Cannot browse outside home directory' });
  }

  try {
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }

    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__')
      .map(e => ({
        name: e.name,
        path: path.join(targetPath, e.name),
        displayPath: path.join(targetPath, e.name).replace(HOME, '~'),
        hasProjects: false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const dir of dirs) {
      try {
        const sub = fs.readdirSync(dir.path, { withFileTypes: true });
        dir.hasProjects = sub.some(s =>
          s.isDirectory() && (
            fs.existsSync(path.join(dir.path, s.name, '.claude')) ||
            fs.existsSync(path.join(dir.path, s.name, 'CLAUDE.md')) ||
            fs.existsSync(path.join(dir.path, s.name, 'package.json')) ||
            fs.existsSync(path.join(dir.path, s.name, 'pubspec.yaml'))
          )
        );
      } catch {}
    }

    const parts = targetPath.split(path.sep).filter(Boolean);
    const breadcrumbs = parts.map((part, i) => ({
      name: i === 0 && targetPath.startsWith(HOME) ? '~' : part,
      path: path.sep + parts.slice(0, i + 1).join(path.sep),
    }));

    if (targetPath.startsWith(HOME)) {
      const homeIndex = HOME.split(path.sep).filter(Boolean).length - 1;
      breadcrumbs.splice(0, homeIndex + 1, { name: '~', path: HOME });
    }

    res.json({
      current: targetPath,
      displayPath: targetPath.replace(HOME, '~'),
      parent: path.dirname(targetPath) !== targetPath ? path.dirname(targetPath) : null,
      breadcrumbs,
      directories: dirs,
    });
  } catch (e) {
    res.status(500).json({ error: 'Cannot read directory' });
  }
});

// GET /api/projects/:projectId/conversations
router.get('/projects/:projectId/conversations', rateLimit('read'), (req, res) => {
  const db = require('../db');
  const convos = db.loadProjectConversations(req.params.projectId);
  res.json(convos.map(c => ({
    id: c.id,
    title: c.title,
    agentName: c.agentName,
    messageCount: c.messages.length,
    lastMessageAt: c.messages.length > 0 ? c.messages[c.messages.length - 1].timestamp : c.createdAt,
    createdAt: c.createdAt,
  })));
});

// GET /api/projects/:projectId/conversations/:id
router.get('/projects/:projectId/conversations/:id', rateLimit('read'), (req, res) => {
  const db = require('../db');
  const convos = db.loadProjectConversations(req.params.projectId);
  const convo = convos.find(c => c.id === req.params.id);
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });
  res.json(convo);
});

// POST /api/projects/:projectId/conversations
router.post('/projects/:projectId/conversations', rateLimit('write'), (req, res) => {
  const db = require('../db');
  const { title, agentName } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const convo = {
    id: genId(),
    projectId: req.params.projectId,
    title,
    agentName: agentName || null,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const convos = db.loadProjectConversations(req.params.projectId);
  convos.unshift(convo);
  db.saveProjectConversations(req.params.projectId, convos);
  res.json(convo);
});

// DELETE /api/projects/:projectId/conversations/:id
router.delete('/projects/:projectId/conversations/:id', rateLimit('write'), (req, res) => {
  const db = require('../db');
  const convos = db.loadProjectConversations(req.params.projectId);
  db.saveProjectConversations(req.params.projectId, convos.filter(c => c.id !== req.params.id));
  res.json({ ok: true });
});

// POST /api/projects/:projectId/conversations/:id/send (streaming SSE)
router.post('/projects/:projectId/conversations/:id/send', rateLimit('heavy'), (req, res) => {
  const db = require('../db');
  const { spawn } = require('child_process');
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const projectId = req.params.projectId;
  const convoId = req.params.id;
  const lockKey = `${projectId}:${convoId}`;

  // Atomic read-modify-write under per-conversation lock. Prevents lost messages
  // when two requests arrive simultaneously on the same conversation.
  const convoSnapshot = withConversationLock(lockKey, () => {
    const convos = db.loadProjectConversations(projectId);
    const convoIdx = convos.findIndex(c => c.id === convoId);
    if (convoIdx < 0) return null;
    const c = convos[convoIdx];
    c.messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    c.updatedAt = new Date().toISOString();
    db.saveProjectConversations(projectId, convos);
    return c;
  });

  // Snapshot returned via lock-chain Promise. Continue handler when settled.
  let convo;
  return Promise.resolve(convoSnapshot).then((c) => {
    if (!c) return res.status(404).json({ error: 'Conversation not found' });
    convo = c;
    return continueSend();
  }).catch((err) => {
    console.error('[projects] send pipeline error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  function continueSend() {

  let instructions = '';
  if (convo.agentName) {
    const agentPath = path.join(CLAUDE_DIR, 'agents', convo.agentName + '.md');
    if (fs.existsSync(agentPath)) {
      instructions = fs.readFileSync(agentPath, 'utf-8');
    }
  }

  let projectContext = '';
  try {
    const config = loadConfig();
    const projects = discoverProjects(config.projectDirs);
    const project = projects.find(p => p.id === projectId);
    if (project) {
      const claudeMdPath = path.join(project.path, 'CLAUDE.md');
      if (fs.existsSync(claudeMdPath)) {
        projectContext = `\n\n## Project Context (${project.name} CLAUDE.md):\n${fs.readFileSync(claudeMdPath, 'utf-8').slice(0, 3000)}`;
      }
    }
  } catch {}

  let prompt = '';
  if (instructions) prompt += instructions + '\n\n---\n\n';
  prompt += `You are having a conversation about the project "${projectId}".${projectContext}\n\n`;
  prompt += '## Conversation History:\n';
  for (const msg of convo.messages) {
    if (msg.role === 'user') prompt += `Human: ${msg.content}\n\n`;
    else if (msg.role === 'assistant') prompt += `Assistant: ${msg.content}\n\n`;
  }
  prompt += 'Assistant:';

  res.setTimeout(0);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const claudePath = process.env.CLAUDE_PATH || 'claude';
  const childEnv = { ...process.env, HOME: os.homedir() };
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  delete childEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING;
  delete childEnv.CLAUDE_AGENT_SDK_VERSION;

  const proc = spawn(claudePath, ['-p'], { env: childEnv });
  let fullOutput = '';
  let responded = false;
  const startTime = Date.now();

  const endStream = (eventData) => {
    if (responded) return;
    responded = true;
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    res.end();
  };

  proc.stdout.on('data', (data) => {
    const chunk = data.toString();
    fullOutput += chunk;
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
  });

  proc.stderr.on('data', () => {});

  proc.on('close', (code) => {
    const trimmed = fullOutput.trim();
    if (code !== 0 && !trimmed) {
      endStream({ type: 'error', error: 'Agent failed to respond' });
    } else {
      const freshConvos = db.loadProjectConversations(projectId);
      const freshIdx = freshConvos.findIndex(c => c.id === req.params.id);
      if (freshIdx >= 0) {
        freshConvos[freshIdx].messages.push({ role: 'assistant', content: trimmed, timestamp: new Date().toISOString() });
        freshConvos[freshIdx].updatedAt = new Date().toISOString();
        db.saveProjectConversations(projectId, freshConvos);
      }

      try {
        const agentRun = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          agentName: convo.agentName || 'chat',
          prompt: message.slice(0, 200),
          source: 'project-chat',
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          status: 'success',
          promptChars: message.length,
          outputChars: trimmed.length,
          estimatedTokens: Math.ceil((message.length + trimmed.length) / 4),
          estimatedCost: 0,
          error: null,
          metadata: { projectId, conversationId: convo.id },
        };
        db.insertAgentRun(agentRun);
      } catch {}

      endStream({ type: 'done', content: trimmed });
    }
  });

  proc.on('error', (err) => {
    endStream({ type: 'error', error: err.message });
  });

  proc.stdin.write(prompt, 'utf8');
  proc.stdin.end();

  req.socket?.on('close', () => {
    if (!responded) { try { proc.kill(); } catch {} }
  });
  } // end continueSend()
});

// GET /api/projects/:projectId/activity
router.get('/projects/:projectId/activity', rateLimit('read'), (req, res) => {
  const db = require('../db');
  const projectId = req.params.projectId;
  const runs = db.loadAgentRuns();
  const projectRuns = runs.filter(r =>
    r.metadata?.projectId === projectId ||
    r.metadata?.orchestrationId?.includes?.(projectId) ||
    r.source === 'project-chat' && r.metadata?.projectId === projectId
  );
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json({ total: projectRuns.length, runs: projectRuns.slice(0, limit) });
});

// GET /api/setup/status
router.get('/setup/status', (req, res) => {
  let pm2Status = 'unknown';
  try {
    const out = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const list = JSON.parse(out);
    const hub = list.find(p => p.name === 'polyglot');
    pm2Status = hub ? hub.pm2_env.status : 'not_registered';
  } catch {
    pm2Status = 'not_installed';
  }

  const launchAgentPath = path.join(os.homedir(), 'Library/LaunchAgents/io.boldteq.polyglot.plist');
  const launchAgentInstalled = fs.existsSync(launchAgentPath);

  const agentDir = path.join(CLAUDE_DIR, 'agents');
  const agentCount = fs.existsSync(agentDir)
    ? fs.readdirSync(agentDir).filter(f => f.endsWith('.md')).length
    : 0;

  const sdkPath = path.join(__dirname, '..', '..', 'sdk');
  const sdkExists = fs.existsSync(path.join(sdkPath, 'package.json'));

  res.json({ pm2Status, launchAgentInstalled, agentCount, sdkExists, port: process.env.PORT || 3847 });
});

// GET /api/setup/projects
router.get('/setup/projects', (req, res) => {
  const config = loadConfig();
  const results = [];

  for (const dir of config.projectDirs || []) {
    const resolved = dir.replace(/^~/, HOME);
    if (!fs.existsSync(resolved)) continue;
    try {
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const projectPath = path.join(resolved, entry.name);
        const hasPackageJson = fs.existsSync(path.join(projectPath, 'package.json'));
        const hasClaudeDir = fs.existsSync(path.join(projectPath, '.claude'));
        const hasClaudeMd = fs.existsSync(path.join(projectPath, 'CLAUDE.md'));
        const hasPubspec = fs.existsSync(path.join(projectPath, 'pubspec.yaml'));
        if (!hasClaudeDir && !hasClaudeMd && !hasPackageJson && !hasPubspec) continue;

        const hasSdk = fs.existsSync(path.join(projectPath, 'node_modules', '@boldteq', 'agents'));
        let hasPackageEntry = false;
        if (hasPackageJson) {
          try {
            const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
            hasPackageEntry = !!(
              (pkg.dependencies && pkg.dependencies['@boldteq/agents']) ||
              (pkg.devDependencies && pkg.devDependencies['@boldteq/agents'])
            );
          } catch {}
        }

        const hasScreenshotScript = fs.existsSync(path.join(projectPath, 'scripts', 'screenshot.mjs'));
        let hasPlaywright = false;
        if (hasPackageJson) {
          try {
            const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
            hasPlaywright = !!(
              (pkg.dependencies && pkg.dependencies['playwright']) ||
              (pkg.devDependencies && pkg.devDependencies['playwright']) ||
              (pkg.dependencies && pkg.dependencies['@playwright/test']) ||
              (pkg.devDependencies && pkg.devDependencies['@playwright/test'])
            );
          } catch {}
        }
        const hasBrowser = fs.existsSync(path.join(projectPath, 'node_modules', 'playwright'))
          || fs.existsSync(path.join(projectPath, 'node_modules', '.bin', 'playwright'));

        results.push({
          name: entry.name,
          path: projectPath,
          hasSdk,
          hasPackageEntry,
          hasScreenshotScript,
          hasPlaywright,
          hasBrowser,
        });
      }
    } catch {}
  }

  res.json(results);
});

// POST /api/setup/install-sdk
router.post('/setup/install-sdk', (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath || typeof projectPath !== 'string') {
    return res.status(400).json({ error: 'projectPath is required' });
  }

  const resolvedProject = path.resolve(projectPath);
  if (!fs.existsSync(resolvedProject) || !fs.statSync(resolvedProject).isDirectory()) {
    return res.status(400).json({ error: 'Project path does not exist' });
  }

  const config = loadConfig();
  const allowedRoots = (config.projectDirs || []).map(d => path.resolve(d.replace(/^~/, HOME)));
  const isAllowed = allowedRoots.some(root => resolvedProject.startsWith(root));
  if (!isAllowed) {
    return res.status(403).json({ error: 'Path outside allowed project directories' });
  }

  const isLovableOrVite = fs.existsSync(path.join(resolvedProject, 'vite.config.ts'))
    || fs.existsSync(path.join(resolvedProject, 'vite.config.js'));

  const sdkAbsPath = path.resolve(path.join(__dirname, '..', '..', 'sdk'));

  if (isLovableOrVite) {
    const helperContent = `/**
 * Polyglot Agent Helper — auto-generated by Polyglot install-sdk
 * Calls Polyglot agents via HTTP. No npm dependency required.
 * Polyglot must be running at localhost:3847 (auto-starts on login).
 *
 * Usage (browser/Vite):
 *   import { callAgent, isOnline } from '@/lib/polyglot'
 *   const result = await callAgent('quill', 'Write a tagline')
 *
 * NOTE: Only works during local development. Polyglot is not available
 * in production/deployed environments (Lovable, Vercel, etc.).
 */

const POLYGLOT_URL = import.meta.env.VITE_POLYGLOT_URL || 'http://localhost:3847'

export async function callAgent(agentName, prompt, timeoutMs = 120000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(\`\${POLYGLOT_URL}/api/playground/run\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName, prompt }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) throw new Error(\`Polyglot returned \${response.status}\`)

    const text = await response.text()
    const events = text
      .split('\\n')
      .filter(line => line.startsWith('data: '))
      .map(line => { try { return JSON.parse(line.slice(6)) } catch { return null } })
      .filter(Boolean)

    const errorEvent = events.find(e => e.type === 'error')
    if (errorEvent) return { success: false, output: '', agent: agentName, error: errorEvent.error }

    const doneEvent = events.find(e => e.type === 'done' || e.type === 'complete')
    return { success: true, output: doneEvent?.output || '', agent: agentName }
  } catch (err) {
    clearTimeout(timeout)
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      output: '',
      agent: agentName,
      error: msg.includes('abort')
        ? \`Timed out after \${timeoutMs / 1000}s\`
        : \`Polyglot not reachable — is it running?\`,
    }
  }
}

export async function listAgents() {
  try {
    const res = await fetch(\`\${POLYGLOT_URL}/api/global/agents\`)
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`)
    return await res.json()
  } catch { return [] }
}

export async function isOnline() {
  try {
    const res = await fetch(\`\${POLYGLOT_URL}/api/global/agents\`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch { return false }
}
`;

    const libDir = path.join(resolvedProject, 'src', 'lib');
    if (!fs.existsSync(libDir)) {
      fs.mkdirSync(libDir, { recursive: true });
    }

    const helperPath = path.join(libDir, 'polyglot.ts');
    fs.writeFileSync(helperPath, helperContent);

    const envLocalPath = path.join(resolvedProject, '.env.local');
    let envContent = '';
    if (fs.existsSync(envLocalPath)) {
      envContent = fs.readFileSync(envLocalPath, 'utf-8');
    }
    if (!envContent.includes('VITE_POLYGLOT_URL')) {
      envContent += `\n# Polyglot — local agent server (only works in dev)\nVITE_POLYGLOT_URL=http://localhost:3847\n`;
      fs.writeFileSync(envLocalPath, envContent);
    }

    res.json({
      success: true,
      method: 'helper-file',
      helperPath: 'src/lib/polyglot.ts',
      usage: "import { callAgent } from '@/lib/polyglot'",
      note: 'Lovable/Vite project detected. Installed standalone helper file instead of file: dependency. No npm package needed — works via direct HTTP calls to Polyglot.',
    });

  } else {
    const pkgPath = path.join(resolvedProject, 'package.json');
    let pkg = { name: path.basename(resolvedProject), version: '1.0.0', dependencies: {} };
    if (fs.existsSync(pkgPath)) {
      try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      } catch {
        return res.status(500).json({ error: 'Could not parse project package.json' });
      }
    }

    const relPath = path.relative(resolvedProject, sdkAbsPath);
    const isInsideProject = !relPath.startsWith('..');

    if (!pkg.dependencies) pkg.dependencies = {};

    if (isInsideProject) {
      pkg.dependencies['@boldteq/agents'] = `file:${relPath}`;
    } else {
      const targetSdkDir = path.join(resolvedProject, 'lib', 'boldteq-agents');
      fs.mkdirSync(targetSdkDir, { recursive: true });
      const sdkFiles = ['index.js', 'package.json'];
      for (const f of sdkFiles) {
        const src = path.join(sdkAbsPath, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(targetSdkDir, f));
        }
      }
      pkg.dependencies['@boldteq/agents'] = 'file:lib/boldteq-agents';
    }

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    try {
      execSync('npm install', { cwd: resolvedProject, timeout: 60000, stdio: 'pipe' });
      res.json({
        success: true,
        method: isInsideProject ? 'file-dep-internal' : 'copy-sdk',
        note: isInsideProject
          ? 'SDK is inside the project — added file: dependency (safe for local servers).'
          : 'SDK was outside the project — copied to lib/boldteq-agents to avoid cross-project file: dep.',
      });
    } catch (err) {
      res.status(500).json({ error: err.message || 'npm install failed' });
    }
  }
});

// POST /api/setup/install-screenshot
router.post('/setup/install-screenshot', (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath || typeof projectPath !== 'string') {
    return res.status(400).json({ error: 'projectPath is required' });
  }

  const resolvedProject = path.resolve(projectPath);
  if (!fs.existsSync(resolvedProject) || !fs.statSync(resolvedProject).isDirectory()) {
    return res.status(400).json({ error: 'Project path does not exist' });
  }

  const config = loadConfig();
  const allowedRoots = (config.projectDirs || []).map(d => path.resolve(d.replace(/^~/, HOME)));
  const isAllowed = allowedRoots.some(root => resolvedProject.startsWith(root));
  if (!isAllowed) {
    return res.status(403).json({ error: 'Path outside allowed project directories' });
  }

  try {
    const scriptsDir = path.join(resolvedProject, 'scripts');
    ensureDir(scriptsDir);
    const destScript = path.join(scriptsDir, 'screenshot.mjs');

    const rankora = path.join(HOME, 'Desktop', 'Boldteq App', 'Rankora', 'scripts', 'screenshot.mjs');
    if (fs.existsSync(rankora)) {
      fs.copyFileSync(rankora, destScript);
    } else {
      const scriptContent = `#!/usr/bin/env node
/**
 * Auto-Screenshot Utility — installed by Polyglot
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const SCREENSHOT_DIR = resolve('.screenshots');
const VIEWPORTS = {
  mobile:  { width: 375, height: 812 },
  tablet:  { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

async function run() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  await browser.close();
  console.log('Screenshot tool ready');
}

run().catch(err => { console.error(err.message); process.exit(1); });
`;
      fs.writeFileSync(destScript, scriptContent, 'utf-8');
    }

    const pkgPath = path.join(resolvedProject, 'package.json');
    let addedPlaywright = false;
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const hasPw = (pkg.dependencies?.playwright) || (pkg.devDependencies?.playwright)
          || (pkg.dependencies?.['@playwright/test']) || (pkg.devDependencies?.['@playwright/test']);
        if (!hasPw) {
          if (!pkg.devDependencies) pkg.devDependencies = {};
          pkg.devDependencies['playwright'] = '^1.52.0';
          fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
          addedPlaywright = true;
        }
      } catch {}
    }

    const gitignorePath = path.join(resolvedProject, '.gitignore');
    let gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
    if (!gitignore.includes('.screenshots')) {
      gitignore += '\n# Screenshot tool\n.screenshots/\n';
      fs.writeFileSync(gitignorePath, gitignore, 'utf-8');
    }

    res.json({
      ok: true,
      scriptPath: 'scripts/screenshot.mjs',
      addedPlaywright,
      nextSteps: addedPlaywright
        ? ['npm install', 'npx playwright install chromium', 'node scripts/screenshot.mjs']
        : ['npx playwright install chromium', 'node scripts/screenshot.mjs'],
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Install failed' });
  }
});

module.exports = router;
