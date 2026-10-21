#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, readFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export const SKILLS_PACKAGE = 'skills@1.7.4';

export function parseOptions(args) {
  const options = { agent: '', url: 'http://localhost:4321', name: 'av-schematic', withSkill: false, replace: false, dryRun: false, check: true, help: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (['--agent','--url','--name'].includes(flag)) {
      const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
      options[flag.slice(2)] = value;
    } else if (flag === '--with-skill') options.withSkill = true;
    else if (flag === '--replace') options.replace = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--no-check') options.check = false;
    else if (['--help','-h'].includes(flag)) options.help = true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (options.help) return options;
  if (!['codex','claude-code','generic'].includes(options.agent)) throw new Error('Choose --agent codex, claude-code or generic');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(options.name)) throw new Error('Invalid MCP server name');
  const url = new URL(options.url);
  if (url.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('--url must be a loopback HTTP origin, such as http://localhost:4321');
  options.url = url.origin;
  if (options.agent === 'generic' && options.withSkill) throw new Error('Generic configuration requires choosing a supported agent separately for skill installation');
  return options;
}
export function setupPlan(options, directory = root, node = process.execPath) {
  const server = { command: node, args: [path.join(directory, 'mcp', 'server.mjs')], env: { AV_CANVAS_URL: options.url } };
  const registration = options.agent === 'codex'
    ? { command: 'codex', args: ['mcp','add',options.name,'--env',`AV_CANVAS_URL=${options.url}`,'--',server.command,...server.args] }
    : options.agent === 'claude-code'
      ? { command: 'claude', args: ['mcp','add-json','--scope','user',options.name,JSON.stringify({ type: 'stdio', ...server })] }
      : null;
  return {
    config: { mcpServers: { [options.name]: server } }, registration,
    skill: { command: 'npx', args: ['--yes',SKILLS_PACKAGE,'add',directory,'--skill','av-schematic','--agent',options.agent,'--global','--copy','--yes'] },
  };
}

/** Resolve npm Windows shims to JavaScript rather than interpolating a shell. */
export async function findLauncher(name, env = process.env, platform = process.platform) {
  for (const base of (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : path.delimiter).filter(Boolean)) {
    for (const extension of platform === 'win32' ? ['.exe','.cmd',''] : ['']) {
      const candidate = path.join(base, name + extension);
      try {
        await access(candidate, platform === 'win32' ? constants.R_OK : constants.X_OK);
        if (extension !== '.cmd') return { command: candidate, prefix: [] };
        const wrapper = await readFile(candidate, 'utf8');
        const relative = wrapper.match(/%dp0%[\\/]([^"\r\n]+\.[cm]?js)/i)?.[1];
        if (relative) {
          const script = path.resolve(base, relative.replaceAll('\\', '/'));
          await access(script, constants.R_OK);
          return { command: process.execPath, prefix: [script] };
        }
        // Standard Node.js npx.cmd uses %dp0% or %~dp0, depending on release.
        if (name === 'npx') {
          const script = path.join(base, 'node_modules', 'npm', 'bin', 'npx-cli.js');
          await access(script, constants.R_OK);
          return { command: process.execPath, prefix: [script] };
        }
      } catch { /* Try the next installation. */ }
    }
  }
  throw new Error(`Cannot find ${name}. Install it first and reopen your terminal, or use --agent generic.`);
}
export async function run(command, args, { capture = false, env = process.env } = {}) {
  const launcher = path.isAbsolute(command) ? { command, prefix: [] } : await findLauncher(command, env);
  return new Promise((resolve, reject) => {
    const child = spawn(launcher.command, [...launcher.prefix, ...args], { cwd: root, env, windowsHide: true, shell: false, stdio: capture ? ['ignore','pipe','pipe'] : 'inherit' });
    let stdout = '', stderr = '';
    if (capture) {
      child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-1024 * 1024); });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
    }
    child.once('error', reject);
    child.once('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
export async function existingRegistration(options, execute = run) {
  if (options.agent === 'codex') {
    const result = await execute('codex', ['mcp','list','--json'], { capture: true });
    if (result.code !== 0) throw new Error('Could not read Codex MCP registrations; no settings were changed.');
    const entries = JSON.parse(result.stdout);
    const existing = entries.find(entry => entry.name === options.name);
    if (existing && existing.enabled === false) throw new Error(`${options.name} is disabled in Codex. Enable it intentionally before running setup.`);
    return existing?.transport ?? null;
  }
  // Claude's user-scope JSON is read only to inspect our named MCP entry;
  // all writes are delegated to Claude's CLI, preserving unrelated settings.
  try { return JSON.parse(await readFile(path.join(homedir(), '.claude.json'), 'utf8')).mcpServers?.[options.name] ?? null; }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Could not read Claude Code settings; no settings were changed.'); }
}
export async function sameRegistration(existing, desired) {
  if (!existing || existing.args?.length !== desired.args.length) return false;
  const canonical = filename => realpath(filename).catch(() => filename);
  const commandPath = async value => path.isAbsolute(value) ? canonical(value) : findLauncher(value).then(launcher => canonical(launcher.command)).catch(() => value);
  const desiredArgs = await Promise.all(desired.args.map(canonical));
  return await commandPath(existing.command ?? '') === await commandPath(desired.command)
    && (await Promise.all(existing.args.map(canonical))).every((arg, index) => arg === desiredArgs[index])
    && (existing.env?.AV_CANVAS_URL ?? 'http://localhost:4321').replace(/\/$/, '') === desired.env.AV_CANVAS_URL;
}
export async function registerAgent(options, plan, { execute = run, inspect = existingRegistration, log = console.log } = {}) {
  const previous = await inspect(options, execute);
  if (await sameRegistration(previous, plan.config.mcpServers[options.name])) { log(`${options.name} is already registered with this server.`); return; }
  if (previous && !options.replace) throw new Error(`${options.name} already points to another server. Review it first, then rerun with --replace to replace only this named entry.`);
  if (previous && options.agent === 'claude-code') {
    const removed = await execute('claude', ['mcp','remove',options.name,'--scope','user']);
    if (removed.code !== 0) throw new Error('Could not replace the existing Claude MCP entry.');
  }
  const result = await execute(plan.registration.command, plan.registration.args);
  if (result.code !== 0) {
    if (previous && options.agent === 'claude-code') {
      const restored = await execute('claude', ['mcp','add-json','--scope','user',options.name,JSON.stringify(previous)]);
      if (restored.code !== 0) throw new Error('Registration failed and the previous Claude MCP entry could not be restored. Re-register your previous server manually.');
    }
    throw new Error('MCP registration failed. Skill installation was not started.');
  }
}
export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.help) {
    console.log('Usage: node scripts/setup-agent.mjs --agent codex|claude-code|generic [--url http://localhost:4321] [--with-skill] [--dry-run] [--replace] [--no-check]\n\nRegisters MCP for the chosen client. --with-skill installs av-schematic via the Vercel skills CLI globally. --dry-run prints a plan without changing settings. Existing different registrations require --replace. Generic prints JSON only.'); return;
  }
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 20)) throw new Error('Use Node.js 22.20+ (required by the skills CLI).');
  const plan = setupPlan(options);
  await access(plan.config.mcpServers[options.name].args[0]);
  if (options.dryRun) { console.log(JSON.stringify({ ...plan, installSkill: options.withSkill, verifyCanvas: options.check }, null, 2)); return; }
  if (options.agent === 'generic') { console.log(JSON.stringify(plan.config, null, 2)); return; }
  // Resolve dependencies before modifying the user's MCP registration.
  await findLauncher(plan.registration.command);
  if (options.withSkill) await findLauncher('npx');
  await registerAgent(options, plan);
  if (options.withSkill) {
    const result = await run(plan.skill.command, plan.skill.args);
    if (result.code !== 0) throw new Error('MCP is registered, but skill installation failed. Retry the skills command separately.');
  }
  console.log('MCP setup complete. Reload your AI client to load the tools and skill. Keep this folder at its current location.');
  if (options.check) {
    const result = await run(process.execPath, [path.join(root,'scripts','mcp-check.mjs')], { env: { ...process.env, AV_CANVAS_URL: options.url } });
    if (result.code !== 0) { console.error('Registration is saved, but the canvas connection is not verified. Open iconic and rerun scripts/mcp-check.mjs with the same AV_CANVAS_URL.'); process.exitCode = 2; }
  }
}
if (process.argv[1] && pathToFileURL(await realpath(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
