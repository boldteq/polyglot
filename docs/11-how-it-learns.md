# 🧠 How Your AI Team Learns & Remembers

> The thing that makes this team special: it gets smarter every single project — on its own. This page explains how, in plain English. No tech background needed.

---

## The shared notebook

Imagine your whole team shares **one giant notebook**. Every time anyone solves a problem, makes a decision, or finds a great example, they write a note in it. Before starting any new job, they flip through the notebook first to see what's already known.

That's the heart of the system. We call it **memory**.

Two notes-worth of detail make it powerful:

1. **It's searched by *meaning*, not exact words.** If you wrote a note about *"product options"* and later search for *"size chart,"* it still finds the note — because it understands the two are related. (A normal keyword search would miss it.)
2. **Everyone shares the same notebook.** A lesson the backend builder learns is instantly available to the designer, the copywriter, everyone.

> **In plain English:** The "search by meaning" trick is powered by a small free program on your Mac called **Ollama**. Think of Ollama as the librarian who knows where every related idea sits — so when an agent asks a question, the right notes come back even if the wording is different. Ollama is the one thing you keep running.

---

## The learning loop (4 steps)

Every job an agent does follows the same simple loop:

### 1. Check the notebook
Before writing any code or copy, the agent searches memory: *"Has anyone dealt with this before?"* It pulls the most relevant past lessons.

### 2. Do the work
It builds the feature, fixes the bug, writes the page — now armed with everything the team already knew.

### 3. Write down what it learned
When it discovers something — a fix, a gotcha, a good pattern — it **captures** a new note into the shared notebook.

### 4. Everyone starts smarter next time
That note is searchable within a minute. The next agent (on any project) automatically benefits.

> **Note:** This is why nobody has to manually "train" the team. The training happens automatically, as a side effect of doing the work. Every project quietly teaches the next one.

---

## The behind-the-scenes helpers

A handful of agents have one job: keep the team improving. They run **automatically on a schedule** (mostly overnight), so you never have to trigger them. Here they are in human terms:

| Helper | Think of them as… | What they do |
|---|---|---|
| **Witness** | The daily reviewer | Each night, looks at yesterday's work and grades it: did it go well, or did something go wrong? |
| **Cadence** | The weekly manager | Every Monday, reviews each agent's track record and decides who's doing great, who needs coaching. |
| **Tutor** | The coach | Turns lessons into actual updates to an agent's instructions, so the improvement sticks. |
| **Mira** | The note-taker | After a big project, writes up the key takeaways into the shared notebook. |
| **Roster** | The record-keeper | Keeps the official list of who's on the team and what each one is good at. |
| **Forge** | The recruiter | When there's a gap nobody covers, drafts a brand-new specialist to fill it. |

> **In plain English:** You don't manage any of these. They're the "HR department" for your AI staff — they run on autopilot and quietly keep everyone sharp.

---

## Two more automatic housekeepers

Beyond the helpers above, two scheduled jobs keep the notebook itself healthy:

- **Re-filing the notebook** *(reindex)* — every so often the system re-reads the whole brain and re-files it so search stays fast and complete. Like re-alphabetizing the library after new books arrive.
- **The quality inspector** *(eval)* — a separate check that grades how good the team's answers are over time, so we can spot if quality ever slips.

You can see both of these — and trigger them by hand if you ever want — on the **System** page.

---

## Does this work everywhere, or only in Polyglot?

**Everywhere.** The shared notebook is wired into your whole setup, so when you're coding in VS Code and ask an agent for help, it searches the same notebook and writes lessons back to it. Polyglot is just the window where you *watch* it all happen.

> **Tip:** When you finish a real piece of work in VS Code, it gets quietly recorded too — so even your day-to-day coding feeds the team's learning. Nothing for you to do; it's automatic.

---

## How your VS Code projects auto-learn (the Learning Inbox)

Here's the newest part, in plain English. **Every night, the system reads back over the projects you worked on that day and pulls out anything worth remembering** — a lesson, a bug and its fix, a decision you made, or a correction you gave the agent.

Then it sorts what it found into two piles:

1. **Clear, high-confidence lessons → saved to memory automatically.** ("Learn on their way.")
2. **Everything it's unsure about — and *every* correction meant for your `feedback.md` — → waits in the Learning Inbox** for you to **Approve**, **Edit**, or **Reject** with one click.

> **In plain English:** It's like an assistant who reviews your day, files the obvious takeaways, and leaves the judgment calls on your desk. You stay in control of what enters the brain — and your most important file, `feedback.md`, is **never** written without your approval.

**Where:** the **Learning** page in Polyglot's sidebar. When something's waiting, you'll see a small amber number on it.

**Two things you can set (your choice, change anytime):**

| Setting | Options | You picked |
|---|---|---|
| How much it saves on its own | Smart-auto · Review-everything · Off | **Smart-auto** |
| When it checks | Each night (cheap) · Right after each project | **Each night** |

> **Tip:** It's built to be cheap — one small batched pass per night, and a day with no real coding costs nothing. If a lesson is already in the notebook, it's skipped so nothing piles up twice.

**Built to be reliable** (so it actually works the way you work):

- **You never have to close VS Code.** It reads your work straight from the session files on your Mac — it does not wait for you to quit anything.
- **Your PC can be off at night.** If your Mac is asleep at the scheduled time, the run is simply done **the next time your Mac is on** — nothing is missed or lost.
- **It learns from your fix-it loops.** When you ask for something, it's not right, you correct it, and it gets fixed — the system saves that as a lesson (*what was wrong → what finally worked*) so the same mistake doesn't repeat.
- **It won't bloat your files.** A lesson that's basically the same as one already saved is skipped before it's ever written, so your memory stays small and your token cost stays low.

---

## How to watch it — the Learning page

Open **Learning** in the sidebar (the 📥 icon). It has three tabs:

### 1. Overview

The visual dashboard — your one place to see the loop working:

- **Four numbers at a glance:** lessons learned, items pending your review, sessions digested this week, duplicates skipped.
- **Nightly digest history:** a little bar chart of recent runs (green = saved, amber = waiting for you, red = a run that failed) with the last run + next run time.
- **What your team has learned:** the most recent lessons captured from your real work.

### 2. Pending review

The lessons waiting for your one-click decision: **Approve** (saves it to memory), **Edit** (tweak it first), or **Reject** (discard). Every correction headed for your `feedback.md` shows up here — nothing is written there without your approval.

### 3. Auto-captured

The high-confidence lessons that saved themselves automatically — a record of what the system learned on its own.

> **Tip:** Anything ever go wrong with a run? It shows on the **Logs** page and the **System** page too, and the Overview's history bar turns red for that run.

---

## Every build teaches the team

You don't have to do anything for this — **finishing real work is the training.** Each build's lessons get captured automatically and show up in the Learning page.

> **In plain English:** If you ever want to capture lessons *right now* instead of waiting for the nightly pass, you can run the **`/train`** command in VS Code (see *Slash Commands*) — it asks the memory-keeper agent to write up the session's lessons immediately. But you don't need to; the nightly loop has you covered.

---

## The one-sentence version

> Your AI team shares a notebook that's searched by meaning, writes a new lesson after every job, and has a small "HR crew" of helpers that run on autopilot to keep everyone improving — so the next project always starts smarter than the last.

**Next →** see **"✨ What's New"** for the plain-English tour of everything we just built.
