import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Enforcement gates (audit: typescript P2 + seo/build P3). The zero-`any`
      // / no-ts-suppression mandate is now tooling-enforced, not convention.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Phase 5 — Static→Dynamic refactor guards.
      // Force every page that renders an agent name to go through
      // `formatAgentDisplay()` (see CLAUDE.md project rule "Agent Name Display").
      // Forbid `agent.name` inside JSX text positions. Allow inside arguments
      // to `formatAgentDisplay({ name: agent.name })` since that's the canonical
      // formatter call site.
      'no-restricted-syntax': [
        'warn',
        {
          selector: "JSXExpressionContainer > MemberExpression[object.name='agent'][property.name='name']",
          message: 'Render agent names via formatAgentDisplay({ name: agent.name, id: agent.filename }) — never raw agent.name in JSX (see CLAUDE.md Agent Name Display rule).',
        },
        {
          selector: "JSXExpressionContainer > MemberExpression[object.name='node'][property.name='name']",
          message: 'Render node names via formatAgentDisplay() — never raw node.name in JSX.',
        },
      ],
    },
  },
  {
    // Tuning page legitimately renders raw config values — exempt.
    files: ['src/pages/SettingsTuning.tsx', 'src/lib/agentDisplay.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // clientLogger is the sanctioned console wrapper — it must use console.* directly.
    files: ['src/lib/clientLogger.ts'],
    rules: { 'no-console': 'off' },
  },
])
