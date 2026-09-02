---
title: "cogNNitive — Bootstrap manifest (preview)"
description: "Canonical agent-bootstrap manifest served raw (Jekyll-safe) for https://cognnitive.com/use."
channel: "preview"
agent-bootstrap:
  version: "2.0"
  entrypoint: "workspace_NN.md"
  skills:
    - name: nn-router
      repo: cogNNitive/actioNN
      path: skills/nn-router
      version: "3.2"
      ref: "main"
      commit: "d1cfde4277a5003a830b82dd2b904e6679cce3b3"
      description: Central system governance, setup, environment readiness gate (Preflight), and skill router.
    - name: nn-trannsform
      repo: cogNNitive/actioNN
      path: skills/nn-trannsform
      version: "2.0"
      ref: "main"
      commit: "d1cfde4277a5003a830b82dd2b904e6679cce3b3"
      requires: [nn-innfo, nn-preflight]
      description: Ingest documents (PDF, DOCX, XLSX), transform using templates, and execute multi-step procedures (procedures_V_0-1-0_NN.md).
    - name: nn-innfo
      repo: cogNNitive/actioNN
      path: skills/nn-innfo
      version: "V_0-1-0"
      ref: "main"
      commit: "d1cfde4277a5003a830b82dd2b904e6679cce3b3"
      description: Author, edit, and validate iNNfo models with built-in step-by-step Model Creation Wizard.
      templates: [workspace_spec_NN]
      mcp:
        - name: innfo-mcp
          repo: cogNNitive/iNNfo
          path: packages/innfo-mcp/bin/innfo-mcp.bundle.js
          version: "0.2.2"
          ref: "main"
          commit: "25dbf8ac1b34dbc406e28a7bc7a08f66304e1353"
          url: https://raw.githubusercontent.com/cogNNitive/iNNfo/25dbf8ac1b34dbc406e28a7bc7a08f66304e1353/packages/innfo-mcp/bin/innfo-mcp.bundle.js
    - name: nn-preflight
      repo: cogNNitive/actioNN
      path: skills/nn-preflight
      version: "V_0-1-0"
      ref: "main"
      commit: "d1cfde4277a5003a830b82dd2b904e6679cce3b3"
      description: Environment readiness gate (Tier 1/Tier 2) and canonical skill-location reference.
    - name: nn-site-generator
      repo: cogNNitive/actioNN
      path: skills/nn-site-generator
      version: "V_0-1-0"
      ref: "main"
      commit: "d1cfde4277a5003a830b82dd2b904e6679cce3b3"
      description: Create or edit websites, add analytics, add contact forms.
    - name: nn-design-presets
      repo: cogNNitive/actioNN
      path: skills/nn-design-presets
      version: "V_1-2-0"
      ref: "main"
      commit: "d1cfde4277a5003a830b82dd2b904e6679cce3b3"
      description: cogNNitive visual design presets — palettes, typography, spacing.
    - name: nn-skills-lifecycle
      repo: cogNNitive/actioNN
      path: skills/nn-skills-lifecycle
      version: "1.2"
      ref: "main"
      commit: "d1cfde4277a5003a830b82dd2b904e6679cce3b3"
      requires: [nn-preflight]
      description: Audit, update, and maintain cogNNitive skills.
  templates:
    - name: workspace_spec_NN
      repo: cogNNitive/iNNfo
      path: specs/templates/workspace_spec_NN.md
      version: "V_0-2-0"
      ref: "main"
      commit: "25dbf8ac1b34dbc406e28a7bc7a08f66304e1353"
    - name: projects
      repo: cogNNitive/iNNfo
      path: specs/templates/projects/projects_V_0-2-0_NN.md
      version: "V_0-2-0"
      ref: "main"
      commit: "25dbf8ac1b34dbc406e28a7bc7a08f66304e1353"
  workflows:
    - id: model
      label: Create an iNNfo model
      description: Turn an idea, document, or dataset into a validated structured model.
      skill: nn-innfo
      template: workspace_spec_NN
    - id: transform
      label: Transform a document
      description: Normalize a PDF/DOCX/XLSX into clean Markdown, or export to HTML.
      skill: nn-trannsform
    - id: pdf-to-innfo-dashboard
      label: PDF to iNNfo dashboard
      description: Normalize a PDF, model it with iNNfo, and export an interactive deliverable.
      skill: nn-trannsform
---

> **PREVIEW — not for production.** This channel renders from the current branch tips
> in each source repo (not tags) and can change or break without notice. For the
> canonical, tag-pinned manifest, use
> [`docs/use/manifest.md`](https://raw.githubusercontent.com/cogNNitive/eNNvironment/main/docs/use/manifest.md)
> instead.

# cogNNitive — bootstrap manifest

This file is the machine-readable entry point for the cogNNitive ecosystem. It is served
**raw** (via GitHub) so the `agent-bootstrap:` frontmatter above stays fetchable even though
the site is built with Jekyll. The human page at `https://cognnitive.com/use` links here.

## For a fresh agent with no cogNNitive skills yet (self-bootstrap)

The manifest frontmatter above is the source of truth for **desired pins**: every skill
carries a pinned `commit` (full 40-char sha — the integrity anchor) and a `version`
(display string that must match the SKILL.md frontmatter). What is actually installed
on a machine is recorded per-machine in `~/.agents/skills-state.json` (like lazy.nvim's
`lazy-lock.json`).

1. Fetch the manifest — each skill carries a pinned `commit` and `version`.
2. Run the check: `node scripts/skills-manager.js status` from a cogNNitive checkout
   (or ask the agent to run it) to compare installed commits (recorded in
   `~/.agents/skills-state.json`) against the pins.
3. Install missing skills with explicit consent:
   `node scripts/skills-manager.js install`.
4. If any skill is outdated, show the diff preview and ask before updating:
   `node scripts/skills-manager.js update`. Never silently update, and never report
   "installed and up to date" without having run the check.
5. For each skill that declares `mcp[]`, download the bundle `url` into `~/.agents/mcp/{name}.bundle.js` and register it in your workspace MCP config.
6. For each template declared in `templates:`, `innfo-mcp` resolves and hydrates versioned packages using 4-tier lookup:
   - Workspace Package Directory: `./specs/templates/<name>/<version>/`
   - Workspace Flat Fallback: `./templates/<name>_V_<version>_NN.md` or `./specs/`
   - Global User Cache: `~/.agents/templates/<name>/<version>/`
   - Installed Skills Directory: `~/.agents/skills/*/templates/<name>/<version>/`
   Hydration into workspace `./specs/templates/<name>/<version>/` is atomic and write-once immutable.
7. Attached SOP procedures (`procedures/`) and agent skills (`skills/`) declared in template frontmatter are dynamically discovered up to depth 10 via `list_template_procedures` and `list_template_skills`.
8. Present the `workflows[]` as a menu and hand over to the chosen skill.

## For an agent that already has `agent-web-bootstrap`

Invoke it with the canonical URL — it performs all of the above and hands over to a workflow:

```
I want to use https://cognnitive.com/use
```

## For opencode CLI / agents without `agent-web-bootstrap`

If your agent does not have `agent-web-bootstrap` built in (e.g. opencode CLI, opencode TUI):

1. Your `AGENTS.md` or `opencode.json` `instructions` field should include a rule like this:

   ```
   ## Bootstrap Rule
   When user says "I want to use https://cognnitive.com/use":
   1. Fetch this manifest (In Windows, use `curl.exe`, Node.js native `fetch`, or git into `$env:TEMP` / `~/.agents/tmp/` to avoid PowerShell `curl` SSL alias issues and workspace pollution).
   2. Parse agent-bootstrap block for skills to install
   3. Download/extract each skill tarball to ~/.agents/skills/{name}/
   4. For skills with mcp[]: download bundle to ~/.agents/mcp/ and register in opencode.jsonc
   5. Show workflow menu
   ```

2. The canonical reference implementation lives in `cogNNitive/actioNN`'s `AGENTS.md` and `.opencode/opencode.json`.

3. Without the rule above, the agent will not recognize the phrase — paste it into your `AGENTS.md` or global `~/.config/opencode/AGENTS.md`.
