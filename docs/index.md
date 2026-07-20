---
layout: default
title: eNNvironment — cogNNitive Ecosystem Gateway
description: Bootstrap entry point for the cogNNitive ecosystem. Install skills, discover workflows, and navigate the cogNNitive universe.
---

# eNNvironment — cogNNitive Ecosystem Gateway

Your **gateway** to the cogNNitive ecosystem. eNNvironment bootstraps AI agents with the right skills, connects you to every cogNNitive repo, and gets you productive in seconds — not hours.

Tell your agent: `"I want to use eNNvironment https://cognitive.com"`

---

## Ecosystem

| Repo | Role | Description |
|------|------|-------------|
| **eNNvironment** | Gateway | Bootstrap entry point — you are here |
| **cogNNitive** | Engine | iNNfo specs, parser, validator, MCP server, Vue editor |
| **actioNN** | Skills | Modular OpenCode agent skills |
| **accountiNNg** | Invoicing | Invoice and accounting workflows |
| **eventovery** | Events | Event management and orchestration |
| **educacióNN** | Learning | Educational content and training materials |

---

## How the integration works

1. **Agent bootstraps** — Fetches eNNvironment, parses YAML frontmatter, discovers skills + workflows + MCP servers.
2. **Skills installed** — Each skill downloaded from actioNN, validated, registered. MCP bundles from cogNNitive wired into opencode.json.
3. **Workflows ready** — Agent presents a menu. Pick one and go.

```
AI Agent → eNNvironment (manifest) → actioNN (skills) → cogNNitive (MCP + specs)
```

---

## Getting started

Tell your OpenCode agent:

```
"I want to use eNNvironment https://cognitive.com"
```

The agent will:
1. Fetch README.md → parse YAML frontmatter
2. Download skills from actioNN
3. Register innfo-mcp from cogNNitive
4. Present workflow menu
