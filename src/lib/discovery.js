'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { readFileSafe } = require('./atomicIo');
const { listAgents } = require('./cache');

const HOME = os.homedir();

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

module.exports = { discoverProjects, listMdFiles };
