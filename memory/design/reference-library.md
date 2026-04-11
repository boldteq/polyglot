# UI/UX Reference Library
## Curated by Yash + Auto-Researched by Nova

This file is the single source of truth for UI/UX references. Agents read this before designing any page.

**How to add references:** Yash adds entries under the relevant section. Nova adds competitor research per project.

---

## Component Libraries (Use These for Building)

### Primary Stack (Default for every project)
| Library | URL | Use For |
|---------|-----|---------|
| **shadcn/ui** | https://ui.shadcn.com | Base components — buttons, inputs, cards, dialogs, tables, tabs. Always the foundation. |
| **shadcn/ui Blocks** | https://ui.shadcn.com/blocks | Pre-built page sections — dashboards, auth pages, settings. Start here before custom building. |
| **Radix UI** | https://www.radix-ui.com | Headless primitives under shadcn. Reference docs for accessibility and behavior. |
| **Tailwind CSS** | https://tailwindcss.com/docs | Utility classes. Never write custom CSS if a Tailwind class exists. |

### Animation & Premium Effects
| Library | URL | Use For | Notes |
|---------|-----|---------|-------|
| **Magic UI** | https://magicui.design | Animated components — number tickers, shimmer buttons, globe, particles. 150+ free components. | Best for landing page wow-factor |
| **Aceternity UI** | https://ui.aceternity.com | Spotlight effects, parallax scroll, 3D cards, animated grids. 200+ free components. | Best for premium feel on marketing pages |
| **Motion Primitives** | https://motion-primitives.com | Framer Motion animation presets — fade, slide, scale, stagger. | Use for subtle micro-interactions |
| **Shadcnblocks** | https://shadcnblocks.com | 1350+ pre-built blocks and multi-page templates for shadcn. | Fastest way to scaffold entire pages |

### Dashboard & Admin Specific
| Library | URL | Use For |
|---------|-----|---------|
| **Tremor** | https://tremor.so | Dashboard components — area charts, bar charts, KPI cards, tables with sparklines. Built on Tailwind. |
| **Recharts** | https://recharts.org | Chart library used in the project. Simple, composable, works well with React. |
| **TailAdmin** | https://tailadmin.com | Admin dashboard template reference. Study layout patterns, not copy code. |

### Icons
| Library | URL | Notes |
|---------|-----|-------|
| **Lucide** | https://lucide.dev | Primary icon set. Consistent, clean, 1400+ icons. Always use this. |
| **Heroicons** | https://heroicons.com | Backup if Lucide doesn't have what you need. Same style. |

---

## SaaS Design Inspiration (Yash's Curated Sources — Study Before Every Build)

These are Yash's preferred design reference sites. Agents MUST check these before designing any component or page.

### Primary Reference Libraries

#### SaaSPO (https://saaspo.com) — 1400+ Landing Page Examples
**What it has:** The largest curated collection of SaaS website designs, updated daily.
**Page types:**
- Landing pages (1251 examples)
- Product pages (313 examples)
- About pages (180 examples)
- Templates pages
- Pricing pages
- Blog pages
**Section types:**
- Features sections (121 examples)
- Hero sections
- CTA sections
- Social proof sections
- Pricing sections
**Industry filters:** AI SaaS (219), Design, Marketing, Developer Tools, and more
**When to use:** Before designing ANY public-facing page (landing, pricing, features, about). Browse the niche filter for the specific product category.

#### SaaS Interface (https://saasinterface.com) — Component-Level UI Examples
**What it has:** Real SaaS app UI screenshots organized by COMPONENT type. This is the most useful for building individual components.
**Component categories:**
- Dashboard (149 examples)
- Modal & Dialog (241 examples)
- Side Panel (72 examples)
- Tables & Data Grids
- Navigation / Sidebar
- Forms & Inputs
- Cards & Widgets
- Empty States
- Settings Pages
- Notifications
- Search Interfaces
**When to use:** Before building ANY specific component. Example: building a settings page? Check SaaS Interface's settings category first.

#### SaaSFrame (https://saasframe.io) — 5000+ Full Page Screenshots + Figma
**What it has:** The largest SaaS design library with desktop + mobile views and Figma file downloads.
**Page categories:**
- Dashboard (166 examples)
- Settings (184 examples)
- Features page (70 examples)
- Tables / Data grids (66 examples)
- Integrations page (32 examples)
- Documentation (36 examples)
- AI page (15 examples)
- Use Cases (34 examples)
- Templates Library (28 examples)
- Pricing pages
- Login / Signup
- Onboarding flows
- Changelogs
- Email sequences
**Special feature:** Switch between desktop and mobile views. Download Figma files for any page.
**When to use:** For full-page layout reference. When you need to see how a complete page is structured, not just one component.

#### SaaS UI Design (https://saasui.design) — Categorized UI Patterns
**What it has:** Hand-picked screenshots organized by both pattern type AND software category. Every pattern is quality-reviewed.
**Pattern types (20+ categories):**
- Dashboards
- Login & Signup flows
- Onboarding sequences
- Settings screens
- Pricing pages
- Navigation (sidebars, top bars, breadcrumbs)
- Empty states (zero-data, first-use prompts)
- Modals & Dialogs (confirmation, detail views, overlays)
- Forms (input fields, validation, multi-step, submission)
- Data tables (sortable, filters, pagination, bulk actions)
- Profile pages (accounts, avatars, settings, activity)
- Search interfaces
- Notifications
- Editors
**Software categories:** CRM, Project Management, Developer Tools, Analytics, Marketing Automation, E-commerce, Collaboration, Scheduling
**When to use:** When you need to see how a specific SOFTWARE CATEGORY handles a specific pattern. Example: "How do CRM tools design their data tables?" or "How do analytics tools design their dashboards?"

### Component-to-Reference Quick Lookup

When building a specific component, check these sources IN THIS ORDER:

| Building This | Check First | Then Check | Then Check |
|--------------|-------------|------------|------------|
| **Landing page** | SaaSPO (1251 examples) | SaaSFrame (full layouts) | SaaS Interface |
| **Dashboard** | SaaS Interface (149 examples) | SaaSFrame (166 examples) | SaaS UI Design |
| **Settings page** | SaaSFrame (184 examples) | SaaS UI Design | SaaS Interface |
| **Data table** | SaaS Interface | SaaSFrame (66 examples) | SaaS UI Design (sortable, filters) |
| **Modal / Dialog** | SaaS Interface (241 examples) | SaaS UI Design | — |
| **Side panel / Drawer** | SaaS Interface (72 examples) | SaaS UI Design | — |
| **Forms** | SaaS UI Design (validation, multi-step) | SaaS Interface | — |
| **Empty states** | SaaS UI Design (zero-data, first-use) | SaaS Interface | — |
| **Navigation / Sidebar** | SaaS UI Design (sidebars, breadcrumbs) | SaaS Interface | — |
| **Pricing page** | SaaSPO (section examples) | SaaSFrame | SaaS UI Design |
| **Onboarding flow** | SaaS UI Design | SaaSFrame | — |
| **Login / Signup** | SaaS UI Design | SaaSFrame | — |
| **Admin panel** | [AppName] (admin-panel-standards.md) | SaaS Interface (dashboards) | SaaSFrame (settings) |
| **Features page** | SaaSPO (121 section examples) | SaaSFrame (70 examples) | — |
| **About page** | SaaSPO (180 examples) | SaaSFrame | — |
| **Notifications** | SaaS UI Design | SaaS Interface | — |
| **Search interface** | SaaS UI Design | SaaS Interface | — |
| **Profile page** | SaaS UI Design (accounts, avatars) | SaaSFrame | — |
| **Changelog** | SaaSFrame | SaaS UI Design | — |

### Additional Design Libraries
| Resource | URL | What to Study |
|----------|-----|---------------|
| **Mobbin** | https://mobbin.com | Mobile + web app design patterns from real products. |
| **Page Flows** | https://pageflows.com | User flow recordings from real SaaS apps (onboarding, checkout, settings). |
| **Screenlane** | https://screenlane.com | Latest mobile & web UI design inspiration. |

### Gold Standard SaaS Apps (Study These UIs)
| App | URL | What to Study |
|-----|-----|---------------|
| **Linear** | https://linear.app | Best-in-class SaaS UI. Study: keyboard shortcuts, sidebar navigation, issue detail layout, animations, dark mode, command palette. |
| **Vercel** | https://vercel.com/dashboard | Study: deployment dashboard, project cards, settings layout, minimal design, dark theme. |
| **Notion** | https://notion.so | Study: empty states, onboarding, sidebar, page layouts, collaborative editing UI. |
| **Clerk** | https://clerk.com | Study: auth components, user management dashboard, developer-friendly design. |
| **Stripe Dashboard** | https://dashboard.stripe.com | Study: billing UI, payment tables, analytics charts, settings organization. |
| **Resend** | https://resend.com | Study: minimal SaaS design, email dashboard, API-first developer UX. |
| **Cal.com** | https://cal.com | Study: scheduling UI, settings layout, booking flow, admin panel. |
| **Supabase** | https://supabase.com/dashboard | Study: database UI, table editor, auth settings, project settings organization. |

---

## Niche-Specific References

### HR / Recruiting / Resume Tools
| App | URL | What to Study |
|-----|-----|---------------|
| **Lever** | https://lever.co | ATS UI, candidate pipeline, interview scheduling |
| **Greenhouse** | https://greenhouse.io | Recruiting dashboard, scorecards, structured hiring |
| **Ashby** | https://ashbyhq.com | Modern ATS, analytics dashboard, clean data tables |
| **BambooHR** | https://bamboohr.com | HR dashboard, employee directory, time-off tracking |

### E-commerce / Shopify
| App | URL | What to Study |
|-----|-----|---------------|
| **Shopify Admin** | https://admin.shopify.com | Study the gold standard for commerce admin: products, orders, analytics, settings |
| **Gorgias** | https://gorgias.com | Customer support + commerce dashboard |
| **Klaviyo** | https://klaviyo.com | Email marketing dashboard, flow builder UI, analytics |

### Project Management
| App | URL | What to Study |
|-----|-----|---------------|
| **Linear** | https://linear.app | Issue tracking, roadmaps, cycles |
| **Height** | https://height.app | Modern project management, AI features |
| **Plane** | https://plane.so | Open-source project management, clean UI |

### AI / Developer Tools
| App | URL | What to Study |
|-----|-----|---------------|
| **v0.dev** | https://v0.dev | AI-generated UI components, prompt-to-code |
| **Cursor** | https://cursor.com | AI code editor, settings, subscription management |
| **Anthropic Console** | https://console.anthropic.com | API dashboard, usage charts, key management |

### Finance / Analytics
| App | URL | What to Study |
|-----|-----|---------------|
| **Plausible** | https://plausible.io | Analytics dashboard, minimal, fast, clean charts |
| **Mercury** | https://mercury.com | Banking dashboard, transaction tables, clean financial UI |
| **Fathom** | https://usefathom.com | Privacy-focused analytics, simple dashboard design |

---

## Figma Resources

### Free Figma UI Kits
| Resource | URL | Notes |
|----------|-----|-------|
| **shadcn/ui Figma** | https://www.figma.com/community/file/1203061493325953101 | Official shadcn/ui component library for Figma |
| **Untitled UI** | https://www.untitledui.com | 10,000+ components, comprehensive design system |
| **Nucleus UI** | https://nucleusui.com | Figma UI kit built on Tailwind CSS tokens |

### How to Use Figma References
When Yash provides a Figma link:
1. Use the Figma MCP tool (`mcp__figma__use_figma`) to inspect the design
2. Extract: colors, spacing, typography, component structure, layout grid
3. Map Figma tokens to Tailwind classes
4. Build components that match the design pixel-perfect

---

## How Agents Use This Library

### Nova (Research Phase)
1. Read this file first
2. Identify the project niche from Yash's brief
3. Study the niche-specific references above
4. Web-search competitors' live UIs for the specific niche
5. Screenshot/describe the best patterns found
6. Add new references to this file under the niche section
7. Hand UI intelligence to Arya alongside market research

### Arya (Architecture Phase)
1. Read this file
2. Reference the gold standard SaaS apps for layout patterns
3. Specify which component libraries to use per page
4. Include UI reference links in the architecture doc for Koda

### Koda (Build Phase)
1. Read this file before building ANY page
2. Check shadcn/ui blocks first — don't reinvent what already exists
3. For landing pages: use Aceternity UI or Magic UI for animated sections
4. For dashboards: use Tremor or Recharts for charts
5. For admin panels: follow the project patterns from admin-panel-standards.md
6. Match the niche — a recruiting tool should look like Ashby, not like Notion

### Quill (Copy Phase)
1. Reference the niche competitors' copy style
2. Study how top SaaS apps word their CTAs, empty states, error messages

---

## Adding New References

Yash can add references anytime by saying:
- "Add [URL] to the design references for [niche]"
- "This is a good example of [feature type]: [URL]"
- "Study how [app name] does [feature]"

Nova adds references automatically during research by appending to the niche section.

Format for new entries:
```
| **[App Name]** | [URL] | [What specifically to study about this app] |
```
