# MCP + skill distribution

The canonical skill is `.agents/skills/av-schematic/`. Vercel skills supports this repository layout directly. `scripts/build-agent-pack.mjs` copies that same skill into `skills/av-schematic/` in the standalone pack; do not maintain another independent skill body.

The pack contains:

- `mcp/server.mjs`: esbuild ESM bundle of the MCP stdio server and dependencies, with dependency notices preserved.
- `scripts/setup-agent.mjs`: Node-only installer and dry-run/generic configuration modes.
- `scripts/mcp-check.mjs`: bundled read-only live connection check.
- `skills/av-schematic/`: self-contained instructions with relative setup/tool references.
- `package.json` and `README.md`: runtime requirement and user commands. No npm runtime dependencies are required by the pack.

`npm run agents:pack` writes `.desktop/agent-pack/iconic-agent-pack/`, `release/agent-pack/iconic-agent-pack-<version>.zip`, and `public/downloads/iconic-agent-pack.zip`. ZIP generation uses fflate and works across build hosts. The archive contains no machine-specific paths or node_modules tree. The installer calculates absolute paths at the user's installation location. Never move/delete the extracted pack after registering it.

`npm run dev`, `npm run build`, and both desktop dev/build flows generate the pack before serving/bundling, so the app's download link works without a separate upload service. Generated ZIPs are ignored by Git.

## Setup behavior

- Requires Node.js 22.20+ and npm, matching the skills CLI requirement.
- `--agent codex`: inspects registrations through Codex CLI and registers using argument arrays.
- `--agent claude-code`: inspects only the named MCP entry in Claude's user config, writes through Claude CLI, and restores the previous entry if an explicitly requested replacement fails.
- `--agent generic`: prints MCP JSON without changing settings.
- `--dry-run`: prints the registration/skill plan without executing it.
- `--with-skill`: uses `npx --yes skills@1.7.4 add <local folder> --skill av-schematic --agent <client> --global --copy --yes`. The fixed version is intentional; update it with verification when upgrading.
- `--replace`: permits replacing the named MCP entry if it points elsewhere. Unrelated entries are never rewritten by this script. Disabled Codex entries require intentional re-enabling.
- `--url`: permits loopback HTTP origins only.
- `--no-check`: skips the read-only app connection check. Otherwise exit code 2 distinguishes saved settings from a verified connection.

No shell is used to launch client commands. Windows npm `.cmd` shims are resolved to JavaScript entry points where possible. Native Windows installer execution still needs a real Windows verification pass.

## Publishing

Local ZIP and local-source skill installation work before publishing. To enable GitHub installation, publish a matching repository version first and verify:

```sh
npx skills@1.7.4 add mantou-fw/iconic --list
npx skills@1.7.4 add mantou-fw/iconic --skill av-schematic -a codex -a claude-code -g --copy
```

Do not advertise the remote command as verified until that publication exists. Upload the generated ZIP beside DMG/EXE releases when publishing a release. This task does not publish a marketplace plugin or npm package; separate Codex/Claude plugin manifests can reuse the same server/skill later.
