// PagePilot share pages to ingest — single source of truth.
//
// RE-RUN PROTOCOL: to bank more PagePilot pages, add a row here (id from the share URL,
// a kebab slug, the page name, an inferred niche) and re-run:
//   node scripts/pagepilot/fetch-all.mjs && node scripts/pagepilot/screenshot.mjs
//   then run the .claude/wf-pagepilot-library-ingest.mjs workflow.
// `niche` is a first guess — the Analyze stage corrects it from gallery/copy evidence.

export const PAGES = [
  { id: 'f3ff9c56-d2e4-4e4d-9958-a4a00fce59ae', slug: 'pagepilot-greens',  name: 'Greens',  niche: 'unknown (infer at analyze)', newNiche: true },
  { id: '28e4802a-6387-4e32-9136-8f22ac908b2e', slug: 'pagepilot-bloom',   name: 'Bloom',   niche: 'unknown (infer at analyze)', newNiche: true },
  { id: 'fdc18673-49c8-4800-be96-87e616d72ba4', slug: 'pagepilot-honey',   name: 'Honey',   niche: 'unknown (infer at analyze)', newNiche: true },
  { id: '928848e8-cd7d-4b5a-ad98-34e76dda12ad', slug: 'pagepilot-clarity', name: 'Clarity', niche: 'unknown (infer at analyze)', newNiche: true },
  { id: 'f8786732-cff5-4623-9613-a5a066924d49', slug: 'pagepilot-aura',    name: 'Aura',    niche: 'unknown (infer at analyze)', newNiche: true },
  { id: 'a63aef8a-8f88-425e-9c6b-6aa701ca2efd', slug: 'pagepilot-legacy',  name: 'Legacy',  niche: 'unknown (infer at analyze)', newNiche: true },
  { id: '9a91937a-2072-4c9b-b5eb-e8c08949702a', slug: 'pagepilot-stone',   name: 'Stone',   niche: 'unknown (infer at analyze)', newNiche: true },
  { id: '0fbf2b84-cf0f-48f2-9115-62b106f63bb5', slug: 'pagepilot-cotton',  name: 'Cotton',  niche: 'unknown (infer at analyze)', newNiche: true },
];

export const shareUrl = (id) => `https://app.pagepilot.ai/share/${id}`;
export const dataUrl = (id) => `https://app.pagepilot.ai/share/${id}.data`;
