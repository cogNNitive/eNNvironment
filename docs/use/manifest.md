---
title: "cogNNitive — Bootstrap manifest"
description: "Canonical agent-bootstrap manifest served raw (Jekyll-safe) for https://cognnitive.com/use."
agent-bootstrap:
  version: "1.1"
  skills:
    - name: agent-web-bootstrap
      repo: cogNNitive/actioNN
      path: skills/agent-web-bootstrap
      description: One-shot ecosystem bootstrap from this manifest.
    - name: nn-router
      repo: cogNNitive/actioNN
      path: skills/nn-router
      description: Entry point — tells you which skill to use for what.
    - name: nn-trannsform
      repo: cogNNitive/actioNN
      path: skills/nn-trannsform
      description: Ingest and normalize documents (PDF, DOCX, XLSX) to Markdown; HTML export.
    - name: nn-innfo
      repo: cogNNitive/actioNN
      path: skills/nn-innfo
      description: Author and validate iNNfo models and specializations.
      mcp:
        - name: innfo-mcp
          url: https://raw.githubusercontent.com/cogNNitive/actioNN/main/scripts/bin/innfo-mcp.bundle.js
    - name: nn-onboarding-wizard
      repo: cogNNitive/actioNN
      path: skills/nn-onboarding-wizard
      description: Conversational wizard to create an iNNfo model from scratch.
    - name: nn-workflow-orchestrator
      repo: cogNNitive/actioNN
      path: skills/nn-workflow-orchestrator
      description: Run, create, or discover multi-skill workflows.
    - name: nn-site-generator
      repo: cogNNitive/actioNN
      path: skills/nn-site-generator
      description: Create or edit websites, add analytics, add contact forms.
    - name: nn-design-presets
      repo: cogNNitive/actioNN
      path: skills/nn-design-presets
      description: cogNNitive visual design presets — palettes, typography, spacing.
    - name: nn-skills-lifecycle
      repo: cogNNitive/actioNN
      path: skills/nn-skills-lifecycle
      description: Install, create, audit, and maintain cogNNitive skills.
    - name: nn-preflight
      repo: cogNNitive/actioNN
      path: skills/nn-preflight
      description: Preflight checks (Node.js, deps, MCP health) before running skills.
    - name: nn-dev-opencode-model-router
      repo: cogNNitive/actioNN
      path: skills/nn-dev-opencode-model-router
      description: Route a task to the right OpenCode model.
  workflows:
    - id: model
      label: Create an iNNfo model
      description: Turn an idea, document, or dataset into a validated structured model.
      skill: nn-innfo
    - id: transform
      label: Transform a document
      description: Normalize a PDF/DOCX/XLSX into clean Markdown, or export to HTML.
      skill: nn-trannsform
    - id: pdf-to-innfo-dashboard
      label: PDF to iNNfo dashboard
      description: Normalize a PDF, model it with iNNfo, and export an interactive dashboard.
      skill: nn-workflow-orchestrator
---

# cogNNitive — bootstrap manifest

This file is the machine-readable entry point for the cogNNitive ecosystem. It is served
**raw** (via GitHub) so the `agent-bootstrap:` frontmatter above stays fetchable even though
the site is built with Jekyll. The human page at `https://cognnitive.com/use` links here.

## For a fresh agent with no cogNNitive skills yet (self-bootstrap)

1. Read the `agent-bootstrap:` block in the frontmatter above.
2. For each skill, download the repo tarball over HTTPS — **no git needed**:
   `https://codeload.github.com/{repo}/tar.gz/refs/heads/main` (retry `master` on 404),
   extract it, and copy `{path}` into `~/.agents/skills/{name}/`.
3. For each skill that declares `mcp[]`, download the bundle `url` into
   `~/.agents/mcp/{name}.bundle.js` and register it in your workspace MCP config.
4. Present the `workflows[]` as a menu and hand over to the chosen skill.

Installs are idempotent: skip anything already present, then continue.

## For an agent that already has `agent-web-bootstrap`

Invoke it with the canonical URL — it performs all of the above and hands over to a workflow:

```
I want to use https://cognnitive.com/use
```
