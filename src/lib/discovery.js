'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { readFileSafe } = require('./atomicIo');
const { listAgents } = require('./cache');

const HOME = os.homedir();

// Recursive file walker. Returns absolute paths for every file under `dir`
// whose basename matches `predicate`. Silently ignores unreadable dirs. Depth
// cap prevents runaway walks on symlink cycles.
function walkFiles(dir, predicate, maxDepth = 12) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [{ d: dir, depth: 0 }];
  while (stack.length) {
    const { d, depth } = stack.pop();
    if (depth > maxDepth) continue;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
        stack.push({ d: full, depth: depth + 1 });
      } else if (e.isFile() && predicate(e.name, full)) {
        out.push(full);
      }
    }
  }
  return out;
}

function listMdFiles(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const filePath = path.join(dir, f);
        const content = readFileSafe(filePath);
        const stats = fs.statSync(filePath);
        return {
          name: f.replace('.md', ''),
          content: content || '',
          path: filePath,
          updatedAt: stats.mtime.toISOString(),
        };
      });
  } catch {
    return [];
  }
}

function discoverProjects(dirs) {
  const projects = [];
  for (const dir of dirs) {
    const resolved = dir.replace(/^~/, HOME);
    if (!fs.existsSync(resolved)) continue;
    try {
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const projectPath = path.join(resolved, entry.name);
        const hasClaudeDir = fs.existsSync(path.join(projectPath, '.claude'));
        const hasClaudeMd = fs.existsSync(path.join(projectPath, 'CLAUDE.md'));
        const hasPackageJson = fs.existsSync(path.join(projectPath, 'package.json'));
        const hasPubspec = fs.existsSync(path.join(projectPath, 'pubspec.yaml'));
        if (hasClaudeDir || hasClaudeMd || hasPackageJson || hasPubspec) {
          const agents = listAgents(path.join(projectPath, '.claude', 'agents'));
          const commands = listMdFiles(path.join(projectPath, '.claude', 'commands'));
          const rules = listMdFiles(path.join(projectPath, '.claude', 'rules'));
          projects.push({
            id: Buffer.from(projectPath).toString('base64url'),
            name: entry.name,
            path: projectPath,
            displayPath: projectPath.replace(HOME, '~'),
            hasClaudeDir,
            hasClaudeMd,
            agentCount: agents.length,
            commandCount: commands.length,
            ruleCount: rules.length,
            agents,
            commands: commands.map(c => c.name),
            rules: rules.map(r => r.name),
          });
        }
      }
    } catch {}
  }
  return projects;
}

module.exports = { discoverProjects, listMdFiles, walkFiles };
