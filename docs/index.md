---
layout: default
title: cogNNitive — Living Knowledge for Teams and AI
description: Turn scattered documentation into living knowledge that your human team and AI agents understand.
---

# Turn scattered documentation into living knowledge that your human team and AI agents understand.

→ [Start Modeling](#get-started) · [Explore Features](#features)

---

## The Problem: Documentation Is a Black Box for AI

Traditional documentation (Notion, Confluence, wikis, plain Markdown) is designed for human eyes only. AI agents cannot reliably extract structured knowledge — they hallucinate structure, miss cross-references, and cannot validate correctness.

**Five core problems cogNNitive solves:**

1. **Documents Are a Black Box for AI** — No deterministic way for AI to read structured knowledge.
2. **Vendor Lock-In** — Proprietary databases, APIs, rate limits. Your knowledge is trapped.
3. **Documentation Rots** — Manual maintenance is tedious. Without validation, outdated docs look identical to current ones.
4. **AI Workflows Are Ad-Hoc** — Every session starts from scratch. No reusable instructions.
5. **Knowledge Tools Don't Talk** — Documentation, project management, AI agents, and CI/CD are silos.

---

## Who It's For

### Knowledge Modeler (Business analysts & consultants)
- **Pain:** Current tools are silos with no AI-native access; spreadsheets go out of date; no validation.
- **Solution:** Structured templates with validation, Git-based versioning, AI-editable documents.

### AI Agent Developer (Custom AI workflow builders)
- **Pain:** LLMs hallucinate on unstructured docs; custom tools per domain are unsustainable.
- **Solution:** 7 deterministic MCP tools, spec chain for predictable structure, drop-in actioNN skills.

### Team Lead / Engineering Manager
- **Pain:** Knowledge scattered across wikis and people's heads; onboarding is manual; docs rot.
- **Solution:** AI agents maintain documentation; structured models are queryable; Git-native workflows.

### OpenCode / AI Tool User
- **Pain:** AI tools are great at code but poor at structured knowledge; each task needs new prompts.
- **Solution:** Pre-built actioNN skills; install once, use anywhere; nn-router handles discovery.

### Technical Writer / Documentalist
- **Pain:** Markdown has no schema; review cycles are manual; no cross-reference validation.
- **Solution:** Template enforcement; validation catches errors before review; wikilinks + resolver protocol.

---

## Features

### The iNNfo Specification Stack
A four-level specification hierarchy (Level 0–3) that structures knowledge from meta-specification to concrete data instances. Each level pins an immutable URL for reproducible validation.
→ **Any document is structurally guaranteed valid — engine-backed, never LLM-dependent.**

### The innfo-mcp Server
A deterministic MCP server exposing 7 tools for AI agents. Wraps the core parser and validator.
→ **AI agents don't need to understand iNNfo — they call deterministic tools with guaranteed correct results.**

### The actioNN Skill Collection
11+ modular, versioned skills that teach AI agents specific tasks via SKILL.md files with YAML frontmatter.
→ **Skills are reusable, versioned, and self-documenting. No more prompt crafting.**

### The iNNfo Modeler
Browser-based workspace editor built with Vue 3. Multiple editing views: Tree, Block Feed, Table, and Graph.
→ **What validates in the editor validates everywhere — instant feedback without a server.**

### The traNNsform Pipeline
Agent-driven document pipeline ingesting PDF, DOCX, XLSX, TXT, CSV, JSON, and Markdown — normalized and aligned to iNNfo templates.
→ **Convert years of accumulated documentation into validated, AI-readable models.**

---

## Value Propositions

| For Organizations | For AI Agent Developers |
|---|---|
| Zero vendor lock-in — plain Markdown in Git | 7 deterministic MCP tools — no LLM guesswork |
| Deterministic validation — AI never hallucinates | 4-level spec chain for reproducible validation |
| Reusable agent skills — install once, use everywhere | Engine-backed validation |
| OKF v0.1 compatible | Plug-and-play skills via actioNN |

| For Documentation Authors | For the AI Ecosystem |
|---|---|
| Plain Markdown — no new syntax | 100% open source (MIT) |
| Templates guide, not restrict | OKF v0.1 compatible |
| Automatic structural drift detection | MCP-native — works with any agent |
| Every change is Git-reviewable | No API keys or rate limits |

---

## Use Cases

- **Knowledge Documentation & Modeling** — Model business strategy, processes, and org structure with validated iNNfo templates.
- **AI-Assisted Document Transformation** — Convert PDFs, DOCX, spreadsheets, and Slack threads into structured models.
- **AI Agent Workflow Automation** — Chain multi-step pipelines: design → model → dashboard → publish.
- **AI-Native Knowledge Base Management** — A living handbook that humans AND AI agents maintain together.
- **Interactive Visual Dashboards** — Export models as self-contained HTML with Chart.js, no server needed.

---

## Comparison

| vs | Limitation | cogNNitive Advantage |
|---|---|---|
| **Obsidian** | No schema, no AI protocol, prompt-dependent plugins | Deterministic validation, spec chain, MCP tools |
| **Notion / Confluence** | Proprietary, vendor lock-in, API fees | File-based Markdown in Git, free, open source |
| **Plain Markdown** | No schema, no validation, no AI protocol | YAML frontmatter, typed concepts, template enforcement, MCP tools |
| **Google OKF (vanilla)** | No validation engine, no templates, no MCP | Adds templates, markers, matrices, spec chain, MCP |

---

## For Developers — Platform &amp; Architecture

### How the ecosystem co-operates

The ecosystem separates what the agent **knows** (iNNfo core engine) from how the agent **acts** (actioNN skills).

```
Human / Team → actioNN (SKILL.md + triggers) → innfo-mcp (MCP tools) → iNNfo Core (parser, validator, specs)
```

**Three-step bootstrap:**

1. **Agent bootstraps** — Fetches eNNvironment, parses YAML frontmatter, discovers skills and workflows.
2. **Skills installed** — Downloaded from actioNN, validated, registered with MCP bundle.
3. **Workflows ready** — Menu of available workflows, agent has domain knowledge and tools.

### Ecosystem Repositories

| Repo | Role | Description |
|---|---|---|
| **eNNvironment** | Gateway | Entry point and manifest. This site. |
| **iNNfo** | Engine | Parser, validator, MCP server, Vue 3 modeler |
| **actioNN** | Skills | Modular agent skills and workflows |

### Integration flow

```
AI Agent → actioNN (instructions) → innfo-mcp (MCP server) → @cognnitive/innfo-core
                                                                       ↓
                                                           Specs in GitHub RAW
                                                           (cogNNitive/specs/latest/)
```

---

## Getting Started

1. **Install OpenCode Desktop** — Download from [opencode.ai/download](https://opencode.ai/download)
2. **Tell your agent** — Say: `I want to use https://cognnitive.com/use`
3. **Choose & follow** — Pick what you want from the workflow menu
