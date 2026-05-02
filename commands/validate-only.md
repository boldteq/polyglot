Market and business model validation for a Scout-approved idea. Takes ~1 week.

Usage: /validate-only [idea description + reference to Scout approval]

Examples:
- /validate-only AI compliance doc generator (Scout approved, pain 8/10)
- /validate-only Shopify size chart recommender (Scout approved, pain 7/10)

Prerequisites: Must have passed /shape-only first (Scout Card required).

Pipeline (4 agents):
  1. Atlas — TAM/SAM/SOM with real sources, growth rate, feature-or-company verdict
     Kill gate: SAM <$50M OR market shrinking
  2. Arya — Architecture plan + sprint breakdown + data model
     Gate: Yash approval before proceeding to scaffold
  3. Riko — Project scaffold (creates the repo, installs deps, configures env)
  4. Ledger — Pricing tiers + unit economics + LTV/CAC projection
     Kill gate: LTV/CAC <3 OR payback >18 months

Output: Market Card + Architecture Plan + Scaffolded Project + Pricing Card
If all pass → project is ready for BUILD phase. Run /saas-cycle or start building directly.
If Kill → documented reasoning. Idea shelved with lessons stored via Mira.

$ARGUMENTS
