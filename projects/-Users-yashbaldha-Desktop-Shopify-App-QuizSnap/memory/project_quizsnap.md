---
name: QuizSnap Project Overview
description: Shopify product recommendation quiz app - architecture, tech stack, and feature scope from Notion spec
type: project
---

QuizSnap is a Shopify embedded app that lets merchants create product recommendation quizzes.

**Tech Stack:** React Router v7 + @shopify/polaris + Prisma (SQLite) + Shopify App Bridge
**Notion Spec:** https://www.notion.so/32c3ca81e49980f49b69c25dad761a8c

**Key Pages:**
- Dashboard (stats cards, setup checklist, quiz list table)
- My Quizzes (template picker, AI generation, quiz list)
- Quiz Builder (questions editor, product mapping, design customization)
- Analytics (performance metrics, charts, response breakdowns)
- Settings (General, Email Capture, Integrations, Plans & Billing)
- Help Center (guides, FAQs, support)

**Pricing Plans:** Free ($0, 100 completions/mo, 1 quiz), Starter ($29, unlimited, 5 quizzes), Pro ($79, unlimited quizzes, AI, A/B testing)

**Integrations:** Klaviyo, Omnisend, Shopify Flow, Webhooks

**Why:** Building a full-featured product recommendation quiz app for Shopify merchants to increase conversions and collect emails.

**How to apply:** All development should follow the detailed Notion specs for each component/page. Use Polaris React components for UI.
