'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { rateLimit } = require('../middleware/rateLimit');
const { validateName, validateProjectId } = require('../lib/validators');
const { atomicWriteText, readFileSafe, ensureDir } = require('../lib/atomicIo');
const { listMdFiles } = require('../lib/discovery');
const { loadConfig } = require('../lib/config');
const { discoverProjects } = require('../lib/discovery');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');

const RULE_TEMPLATES = [
  {
    id: 'no-any',
    name: 'No Any Types',
    description: 'Forbid usage of TypeScript `any` type',
    category: 'typescript',
    content: `Never use the TypeScript \`any\` type. No exceptions.

Alternatives:
- Use specific types or interfaces
- Use generics for flexible typing
- Use \`unknown\` with type guards for truly unknown data
- Use \`Parameters<typeof fn>[0]\` to infer parameter types

Also forbidden: \`as any\`, \`@ts-ignore\`, \`@ts-expect-error\` (unless the comment explains exactly why and when it will be fixed).`,
  },
  {
    id: 'zod-validation',
    name: 'Zod Validation',
    description: 'Require Zod schemas for all API input validation',
    category: 'validation',
    content: `All API routes must validate request input with Zod schemas. Never trust raw request data.

Required pattern:
\`\`\`typescript
const schema = z.object({ ... })
const result = schema.safeParse(await request.json())
if (!result.success) return Response.json({ error: result.error.flatten() }, { status: 400 })
\`\`\`

Never access \`request.json()\` fields directly without validation.
Never use \`schema.parse()\` — always \`schema.safeParse()\` with explicit error handling.`,
  },
  {
    id: 'no-console-log',
    name: 'No Console.log',
    description: 'Use structured logging instead of console.log in production code',
    category: 'logging',
    content: `Never use \`console.log\`, \`console.warn\`, or \`console.error\` directly in production code.

- Use the project's structured logger instead
- Include contextual metadata (request ID, user ID, operation name)
- Use appropriate log levels (debug, info, warn, error)
- Exception: CLI scripts and build tooling may use console directly`,
  },
  {
    id: 'error-handling',
    name: 'Error Handling',
    description: 'Proper error handling patterns — no silent catches',
    category: 'reliability',
    content: `All errors must be caught, typed, and handled appropriately.

- Never swallow errors silently (empty catch blocks)
- Use custom error classes extending Error for domain errors
- Always include the original error as the cause
- Return Result types or throw — never return null to indicate failure
- Never expose raw database or third-party errors to the client`,
  },
  {
    id: 'no-hardcoded-secrets',
    name: 'No Hardcoded Secrets',
    description: 'Never hardcode credentials or API keys in source code',
    category: 'security',
    content: `Never hardcode API keys, passwords, tokens, or connection strings in source code.

- Use environment variables for all secrets
- Reference secrets from a .env file (never committed to git)
- Check .env.example matches actual .env keys
- Never log secrets or include them in error messages`,
  },
  {
    id: 'no-direct-push',
    name: 'No Direct Push to Main',
    description: 'Always use feature branches and pull requests',
    category: 'git',
    content: `Never commit or push directly to the main branch.

Always create a feature branch:
- Branch name format: feature/[short-description] or fix/[short-description]
- Example: git checkout -b feature/csv-import

Open a pull request for all changes. Never use git push origin main.`,
  },
  {
    id: 'no-mock-db',
    name: 'No Mock Database',
    description: 'Always use real test databases instead of mocks',
    category: 'testing',
    content: `Never mock the database in tests. Always use a real test database with seed data.

Never use: jest.mock('prisma'), vi.mock('@/lib/db'), or any database stub.
Always use: a dedicated test database with DATABASE_URL_TEST in .env.test.

Mocked DB tests give false confidence. Real DB tests catch actual query bugs.`,
  },
  {
    id: 'prisma-migrations',
    name: 'Prisma Migrations Only',
    description: 'All schema changes must go through Prisma migrations',
    category: 'database',
    content: `Never modify schema.prisma and apply changes manually in production.

All schema changes must go through:
1. Edit prisma/schema.prisma
2. Run: npx prisma migrate dev --name [descriptive-name]
3. Run: npx prisma generate
4. Commit both the schema change and the migration file

Never run npx prisma db push in production — use migrate deploy.
Never run npx prisma migrate reset without explicit user confirmation.`,
  },
];

// GET /api/global/rules
router.get('/global/rules', (req, res) => {
  const rules = listMdFiles(path.join(CLAUDE_DIR, 'rules'));
  res.json(rules);
});

// GET /api/global/rules/:name
router.get('/global/rules/:name', validateName, (req, res) => {
  const filePath = path.join(CLAUDE_DIR, 'rules', req.params.name + '.md');
  const content = readFileSafe(filePath);
  if (content === null) return res.status(404).json({ error: 'Not found' });
  let updatedAt = new Date().toISOString();
  try { updatedAt = fs.statSync(filePath).mtime.toISOString(); } catch {}
  res.json({ name: req.params.name, content, path: filePath, updatedAt });
});

// PUT /api/global/rules/:name
router.put('/global/rules/:name', validateName, (req, res) => {
  if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'content must be a string' });
  const dir = path.join(CLAUDE_DIR, 'rules');
  ensureDir(dir);
  const filePath = path.join(dir, req.params.name + '.md');
  atomicWriteText(filePath, req.body.content);
  const stats = fs.statSync(filePath);
  res.json({ ok: true, rule: { name: req.params.name, content: req.body.content, path: filePath, updatedAt: stats.mtime.toISOString() } });
});

// DELETE /api/global/rules/:name
router.delete('/global/rules/:name', validateName, (req, res) => {
  const filePath = path.join(CLAUDE_DIR, 'rules', req.params.name + '.md');
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// POST /api/global/rules/from-template
router.post('/global/rules/from-template', rateLimit('write'), (req, res) => {
  const { templateId } = req.body;
  if (!templateId || typeof templateId !== 'string') return res.status(400).json({ error: 'templateId required' });
  const template = RULE_TEMPLATES.find(t => t.id === templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  const dir = path.join(CLAUDE_DIR, 'rules');
  ensureDir(dir);
  const filePath = path.join(dir, template.id + '.md');
  if (fs.existsSync(filePath)) return res.status(409).json({ error: `Rule "${template.id}" already exists` });
  atomicWriteText(filePath, template.content);
  const stats = fs.statSync(filePath);
  res.json({ ok: true, rule: { name: template.id, content: template.content, path: filePath, updatedAt: stats.mtime.toISOString() } });
});

// GET /api/projects/:id/rules
router.get('/projects/:id/rules', validateProjectId, (req, res) => {
  res.json(listMdFiles(path.join(req.projectPath, '.claude', 'rules')));
});

// GET /api/projects/:id/rules/:name
router.get('/projects/:id/rules/:name', validateProjectId, validateName, (req, res) => {
  const filePath = path.join(req.projectPath, '.claude', 'rules', req.params.name + '.md');
  const content = readFileSafe(filePath);
  if (content === null) return res.status(404).json({ error: 'Not found' });
  let updatedAt = new Date().toISOString();
  try { updatedAt = fs.statSync(filePath).mtime.toISOString(); } catch {}
  res.json({ name: req.params.name, content, path: filePath, updatedAt });
});

// PUT /api/projects/:id/rules/:name
router.put('/projects/:id/rules/:name', validateProjectId, validateName, (req, res) => {
  if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'content must be a string' });
  const dir = path.join(req.projectPath, '.claude', 'rules');
  ensureDir(dir);
  const filePath = path.join(dir, req.params.name + '.md');
  atomicWriteText(filePath, req.body.content);
  const stats = fs.statSync(filePath);
  res.json({ ok: true, rule: { name: req.params.name, content: req.body.content, path: filePath, updatedAt: stats.mtime.toISOString() } });
});

// DELETE /api/projects/:id/rules/:name
router.delete('/projects/:id/rules/:name', validateProjectId, validateName, (req, res) => {
  const filePath = path.join(req.projectPath, '.claude', 'rules', req.params.name + '.md');
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// POST /api/projects/:id/rules/from-template
router.post('/projects/:id/rules/from-template', rateLimit('write'), validateProjectId, (req, res) => {
  const { templateId } = req.body;
  if (!templateId || typeof templateId !== 'string') return res.status(400).json({ error: 'templateId required' });
  const template = RULE_TEMPLATES.find(t => t.id === templateId);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  const dir = path.join(req.projectPath, '.claude', 'rules');
  ensureDir(dir);
  const filePath = path.join(dir, template.id + '.md');
  if (fs.existsSync(filePath)) return res.status(409).json({ error: `Rule "${template.id}" already exists` });
  atomicWriteText(filePath, template.content);
  const stats = fs.statSync(filePath);
  res.json({ ok: true, rule: { name: template.id, content: template.content, path: filePath, updatedAt: stats.mtime.toISOString() } });
});

// GET /api/rule-templates
router.get('/rule-templates', (req, res) => {
  res.json(RULE_TEMPLATES);
});

// POST /api/projects/:id/init-rules
router.post('/projects/:id/init-rules', rateLimit('write'), validateProjectId, (req, res) => {
  const dir = path.join(req.projectPath, '.claude', 'rules');
  ensureDir(dir);
  const created = [];
  const templates = Array.isArray(req.body.templates) ? req.body.templates : [];
  for (const tid of templates) {
    const template = RULE_TEMPLATES.find(t => t.id === tid);
    if (!template) continue;
    const filePath = path.join(dir, template.id + '.md');
    if (!fs.existsSync(filePath)) {
      atomicWriteText(filePath, template.content);
      created.push(template.id);
    }
  }
  res.json({ ok: true, path: dir, created });
});

// POST /api/init-rules
router.post('/init-rules', rateLimit('write'), (req, res) => {
  const config = loadConfig();
  const projects = discoverProjects(config.projectDirs);
  const templates = Array.isArray(req.body.templates) ? req.body.templates : [];
  const results = [];
  for (const project of projects) {
    const dir = path.join(project.path, '.claude', 'rules');
    const existed = fs.existsSync(dir);
    ensureDir(dir);
    const created = [];
    for (const tid of templates) {
      const template = RULE_TEMPLATES.find(t => t.id === tid);
      if (!template) continue;
      const filePath = path.join(dir, template.id + '.md');
      if (!fs.existsSync(filePath)) {
        atomicWriteText(filePath, template.content);
        created.push(template.id);
      }
    }
    results.push({ projectId: project.id, projectName: project.name, existed, created });
  }
  res.json({ ok: true, initialized: results });
});

// GET /api/unified/rules
router.get('/unified/rules', (req, res) => {
  const config = loadConfig();
  const projects = discoverProjects(config.projectDirs);
  const results = [];

  const globalRules = listMdFiles(path.join(CLAUDE_DIR, 'rules'));
  for (const rule of globalRules) {
    results.push({ ...rule, scope: 'global', projectId: null, projectName: null });
  }

  for (const project of projects) {
    const rls = listMdFiles(path.join(project.path, '.claude', 'rules'));
    for (const rule of rls) {
      results.push({ ...rule, scope: 'project', projectId: project.id, projectName: project.name });
    }
  }

  results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(results);
});

module.exports = router;
