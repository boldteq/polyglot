# Shopify Mastery pack

The training material that gives the Shopify website team the knowledge a 15-year
practitioner would have, sourced from published material rather than from model memory.

**This directory is additive.** Nothing here overwrites an existing file, no gate reads it,
and adding it cannot break a build. The two changes that *do* touch existing files —
`CLAUDE.md` and `.mcp.json` — are supplied below as patch blocks for you to apply, not
applied automatically.

```
docs/shopify-mastery/
  README.md         this file: what to install, in what order, and the two patches
  sources.json      41 vetted sources + 13 named rejects, each with licence and verify date
  taste-rubric.json the machine-checkable half of the design layer
  install.sh        idempotent installer for the parts a shell can install
  rules/
    01-platform-truth-2026.md      dated corrections that override stale rules
    02-liquid-and-css-standard.md  the code standard
    03-quality-bar.md              the numeric acceptance bar
    04-design-taste.md             what makes a store look designed rather than assembled
    05-ai-tells.md                 the concrete tells of AI-generated design, and how to detect them
    06-dogfood-protocol.md         how to *prove* a build, on a real store, with an evidence bundle
```

Files 01–03 answer *is it correct*. Files 04–05 answer *is it good*. File 06 is the only file
in the pack that proves anything — the rest teach.

---

## The finding that matters most

Polyglot has **zero skills installed**. `.agents/skills/` is empty, and `.agents/.skill-lock.json`
still lists two Supabase skills whose folders no longer exist — so the lockfile has drifted from
disk. Meanwhile Shopify now publishes **three official skill packages** written by its own
engineers, covering exactly the work this team does.

The highest-leverage move is not building more machinery. It is installing Shopify's own skills
and wiring Shopify's own MCP server, then letting the existing gate stack enforce the standard.

---

## Install order

Run these on the Mac, in Claude Code, from the repo root. The `/plugin` lines are Claude Code
commands, not shell commands — they cannot be scripted.

### Tier 0.1 — Shopify Dev MCP (do this first)

Patch `.mcp.json`. **Also fix the hardcoded path while you are in there** — the existing
`boldteq-memory` entry hardcodes `/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot`,
which breaks on any other machine.

```json
{
  "mcpServers": {
    "boldteq-memory": {
      "command": "node",
      "args": ["./src/intelligence/mcp-server.mjs"],
      "env": {
        "INTEL_STORE": "local",
        "INTEL_EMBED_PROVIDER": "ollama"
      }
    },
    "shopify-dev": {
      "command": "npx",
      "args": ["-y", "@shopify/dev-mcp@latest"],
      "env": {
        "LIQUID_VALIDATION_MODE": "full",
        "OPT_OUT_INSTRUMENTATION": "true"
      }
    }
  }
}
```

`LIQUID_VALIDATION_MODE=full` is the strict setting and is the one we want — partial validation
is what lets stale Liquid through. Licence ISC. Distribution is npm; the GitHub path 404s, so
cite npm.

Agents must call `learn_shopify_api` first in any Shopify task — it returns a `conversationId`
the other five tools require.

### Tier 0.2 — Shopify's Liquid skills

```
npm install -g @shopify/cli
/plugin marketplace add Shopify/liquid-skills
/plugin install liquid-lsp@liquid-skills
/plugin install liquid-skills@liquid-skills
```

Installs three skills: `shopify-liquid-themes`, `liquid-theme-standards`, `liquid-theme-a11y`,
plus a Liquid language server for live diagnostics in VS Code. `liquid-theme-standards` is
Shopify's own answer to the clean-code complaint.

### Tier 0.3 — the three theme-relevant agent skills

```
npx skill install shopify-liquid
npx skill install shopify-custom-data
npx skill install shopify-dev
```

`Shopify/agent-skills` ships 15 skills. Twelve of them are app, Hydrogen, POS and Admin
extension skills that this team does not build. Installing all 15 is clutter and dilutes
skill selection — install the three above and nothing else until a real need appears.

### Tier 0.4 — Shopify AI Toolkit (optional, measure first)

```
/plugin marketplace add Shopify/shopify-ai-toolkit
/plugin install shopify-plugin@shopify-ai-toolkit
```

This overlaps Tier 0.1 heavily — both give docs search and validation. Running both gives the
agent two doc-search paths and it will pick inconsistently. Install 0.1, work for a week,
then decide.

---

## The design layer (04, 05, `taste-rubric.json`)

This is the half of the pack that closes the *taste* gap rather than the correctness gap, and
it is built to be enforced, not admired.

`taste-rubric.json` holds the 15 checks a machine can run: DOM-duplication thresholds, thin
copy, credibility gaps, manufactured urgency, LLM vocabulary, cross-store copy homogenisation,
the Tailwind-default accent-hue band, emoji-as-icons, elevation flatness, hierarchy inversion.
Every check carries `sourceIds` that must resolve against `sources.json`, and a `tag` that caps
how hard it is allowed to bite:

- **`E`** — backed by a named study or a binding platform rule. May **reject**. Nine checks.
- **`P`** — practitioner consensus, no measurement behind the specific number. May **warn** at
  most. Six checks.
- **`H`** — house taste. **Note** only, and never described to a client as best practice.

That cap is enforced mechanically, not by convention: `install.sh` step 7 fails if any check's
`action` exceeds its tag's `maxAction`, or if `action` is anything outside
`reject | warn | note`. It caught one already — AT-10 was tagged `P` but set to `regenerate`,
letting an unmeasured opinion hard-stop a build. Fixed, and the correction is recorded in the
check. Remediation wording now lives in `remediation`, never in `action`.

Four checks are marked `calibrationRequired` (AT-1, AT-9, AT-11, AT-15). Those thresholds are
starting points, not measurements — calibrate against genuinely distinct human-built themes
before letting them block, or they will either never fire or always fire.

**The one thing to unlearn.** The intuition that "conventional-looking = bad" is backwards for
ecommerce. Prototypicality outweighs visual complexity in the published data, so a clean,
familiar store layout is a *feature*. What actually reads as AI-generated is duplication,
thin content, missing institutional signals and borrowed assets — never restraint. Penalising
a plain layout is an explicit named reject in `sources.json`; it must not creep back in.

**Two licence landmines**, both encoded as machine-readable entries rather than prose warnings:

- **Dawn is not MIT.** Its `LICENSE.md` is a restricted Shopify licence; the string "MIT License"
  does not appear in it. Rights may only be exercised to build themes that interoperate with
  Shopify. `Shopify/Skeleton` is the **only** Shopify codebase approved as a Theme Store
  submission base — submissions derived from Dawn or Horizon are ineligible.
- **Refactoring UI is `DO-NOT-USE`.** It is paid material. Neither its prose nor anything derived
  from it may enter memory. It is listed in `sources.json` specifically so the gate rejects it
  by name instead of rediscovering it.

Also binding: **APCA must never ship** in client code (commercial use needs a signed agreement),
**Baymard forbids paraphrase as well as copying**, and **MDN prose is ShareAlike-viral** while its
code samples are CC0.

---

## The dogfood protocol (06)

Everything above is knowledge. `06-dogfood-protocol.md` is the runbook that converts knowledge
into evidence: a fresh dev store per run, Shopify's own hostile fixture data, thirteen gates run
against **rendered** output, and a run-scoped evidence bundle on disk.

Its `RESULT.md` must list skipped gates. A bundle showing twelve greens and hiding the thirteenth
is worse than one showing eleven greens and two honest skips — the second is evidence, the first
is marketing.

It is brand-agnostic by construction: the store name derives from the brand slug and run id,
and no fixture, path or threshold in it names a client.

**Running it is the only thing that closes the last gap.** Reading it does not.

---

## The CLAUDE.md patch

The repo's `CLAUDE.md` contains **zero** Shopify rules, zero code-standard rules and zero honesty
rules. Append this block. It is deliberately short — it points at the sources instead of restating
them, so it cannot drift.

```markdown
## Shopify work

Before any Shopify theme task, call `learn_shopify_api` on the `shopify-dev` MCP. It returns the
`conversationId` the other tools need.

Binding references, in precedence order:

1. `docs/shopify-mastery/rules/01-platform-truth-2026.md` — dated platform facts. Where any
   other rule, skill or memory disagrees with this file, this file wins.
2. `docs/shopify-mastery/rules/02-liquid-and-css-standard.md` — the code standard.
3. `docs/shopify-mastery/rules/03-quality-bar.md` — the numeric acceptance bar.
4. `docs/shopify-mastery/rules/04-design-taste.md` + `docs/shopify-mastery/taste-rubric.json` —
   the design bar. Block on `E`-rated checks, warn on `P`, note on `H`. Never block on `H`.
5. `docs/shopify-mastery/rules/05-ai-tells.md` — the tells to detect before handover.
6. `docs/shopify-mastery/rules/06-dogfood-protocol.md` — how a build is proven. No build is
   called proven without an evidence bundle.
7. The installed `liquid-theme-standards` and `liquid-theme-a11y` skills.

Non-negotiable:

- A file's `{% stylesheet %}` styles only that file's own markup. Cross-file class dependencies
  now break at runtime because Shopify subsets CSS per rendered file.
- One `{% stylesheet %}` and one `{% javascript %}` per file. No Liquid inside either.
- No `checkout.liquid` customisation. Non-Plus auto-upgrade lands 2026-08-26.
- No merchant-specific literal in shared code — no store name, domain, product handle, currency
  symbol or locale string.
- Do not vendor Dawn or Horizon. Skeleton is the only approved Theme Store submission base.
- Never ship APCA. Never ingest Refactoring UI. Never paraphrase Baymard.
- Validate through `validate_theme` before claiming a build is clean. Do not assert cleanliness
  from reading the code.

Honesty: if a check was not run, say it was not run. A gate that was skipped is reported as
skipped, never as passed. A green taste rubric means "no known failure mode detected", never
"this is beautiful".
```

---

## How this feeds the memory system

The pack is built to satisfy the standing rule that **only validated knowledge enters memory**.

`sources.json` is the provenance feed. Every entry carries a live URL, a publisher, a licence, a
licence class, an evidence rating and a `verifiedOn` date. It is the input the provenance gate
needs in order to stop being a formality:

- A rule derived from an entry in `sources.json` inherits that entry's citation and passes provenance.
- A rule with no matching entry does not enter memory. It goes to quarantine.
- The `rejected` array is as load-bearing as `sources`. It names thirteen patterns that must never
  enter, including the unverifiable 48% shipping-abandonment figure, the Dawn-is-MIT claim, and
  em-dash density as an AI detector.

The three licence classes are what the gate enforces at ingest time:

- **`INGESTIBLE`** — the licence permits copying the text into memory with attribution.
- **`FACTS-ONLY`** — the *finding* may be stored, with attribution and a link. The publisher's
  prose may not be copied, stored or paraphrased.
- **`DO-NOT-USE`** — neither prose nor derived text may enter, ever.

Current split: 14 `INGESTIBLE`, 26 `FACTS-ONLY`, 1 `DO-NOT-USE`.

That gives a concrete way to work through the roughly 5,253 uncited legacy rules: any rule that
cannot be matched to a `sources.json` entry is quarantined rather than trusted. That is a
mechanical sort, not a research project.

**Licence discipline for the skills themselves.** `Shopify/liquid-skills` and
`Shopify/agent-skills` publish no LICENSE file, which means all rights reserved. They are publicly
readable, so we install them and distil their conventions in our own words. We never paste their
prose into our rule packs.

---

## Re-verification

Rules 01–03 and the original 18 sources were fetched on **2026-07-24**. Rules 04–06, the taste
rubric and the 23 sources added for the design and legal layers were fetched and licence-checked
on **2026-07-25**. Shelf life is 30 days.

The maintenance job is small: diff https://shopify.dev/changelog?filter=dev_themes against
`rules/01-platform-truth-2026.md`, append new entries with their own dates, and bump `verifiedOn`
in `sources.json`. Append, never rewrite — each fact keeps the date it was true.

Corrections are recorded in place, not silently patched. Three are live in this pack: the Dawn
licence, the AT-5 Fogg credibility figures, and the AT-12 Tailwind accent-hue band. Each carries
a `correction` field naming the superseded values, so a reader can tell what we used to believe.

One provenance weakness is flagged rather than hidden: `fogg-credibility-2001` was verified
against a single copy (the authors' own lab PDF), because the one independent mirror is
robots-disallowed. It carries a `provenanceNote` saying so.

One claim in `06` could not be closed and is written as open: the X Card Validator's *retirement
date*. Its behaviour is confirmed — it cannot be used anonymously — but no primary source gives a
retirement date, and archived crawls show it has redirected to login since 2015, so the redirect
alone does not prove retirement. The file says that rather than picking a plausible date.
