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
