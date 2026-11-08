// Runs one headless Claude Code turn: `claude -p`, stream-json out.
//
// It runs on the subscription the CLI is signed in with, never on API credits:
// every variable that would switch the CLI to an API key or another provider
// is removed from its environment, and a run whose init message reports an API
// key anyway is killed before it makes a request (apiKeySource is "none" for a
// claude.ai sign-in). A run the CLI reports as drawing on extra usage is killed
// too. --bare is not used -- it only accepts API keys.
//
// Everything else a normal session loads is switched off: CLAUDE.md, skills,
// plugins, hooks, MCP servers, slash commands, Chrome, and every tool. A schema
// request still gets the StructuredOutput tool the schema adds.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types.ts';
import { AiError, type AiRequest } from './types.ts';

type ClaudeConfig = Settings['claude'];

/**
 * The CLI has no command that lists models, so this is the list offered.
 * Full ids, not aliases like "sonnet", so a CLI update never quietly swaps the model.
 */
export const CLAUDE_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'];

/** An empty directory, so no project CLAUDE.md or git status reaches the session. */
const WORK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.cache', 'claude');

/**
 * Every ANTHROPIC_* and CLAUDE_* variable goes: the API-key and provider
 * switches, and the session wiring a parent Claude Code session (the desktop
 * app, an IDE) hands its children -- with those the CLI expects the parent to
 * supply auth instead of using its own sign-in. Only the config dir is kept.
 */
const STRIPPED_ENV = /^(ANTHROPIC_|CLAUDE_|CLAUDECODE$)/;
const KEPT_ENV = new Set(['CLAUDE_CONFIG_DIR']);

export function claudeEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const key of Object.keys(out)) if (STRIPPED_ENV.test(key) && !KEPT_ENV.has(key)) delete out[key];
  out.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  return out;
}

/** The command comes from settings, which the API can change, so nothing but a claude executable is run. */
export const isClaudeCommand = (command: string) => /^claude(\.exe)?$/i.test(path.win32.basename(command.trim()));

export const AUTH_PROBLEM =/authenticat|log ?in|oauth|not logged/i;

export function claudeArgs(request: AiRequest, config: ClaudeConfig, systemPromptFile: string): string[] {
  return [
    '-p',
    '--model', config.model || DEFAULT_SETTINGS.claude.model,
    '--output-format', 'stream-json',
    '--verbose',
    '--safe-mode',
    '--setting-sources', '',
    '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}',
    '--disable-slash-commands',
    '--no-chrome',
    '--no-session-persistence',
    '--tools', '',
    '--permission-mode', 'dontAsk',
    '--system-prompt-file', systemPromptFile,
    '--max-turns', request.schema ? '3' : '1',
    ...(request.schema ? ['--json-schema', JSON.stringify(request.schema)] : []),
    ...(config.effort ? ['--effort', config.effort] : []),
  ];
}

/** `claude -p` takes one prompt, so earlier turns are written out as a transcript. */
export function promptOf(request: AiRequest): string {
  const last = request.turns.at(-1);
  if (request.turns.length === 1 && last) return last.content;
  const history = request.turns
    .slice(0, -1)
    .map((t) => `${t.role === 'assistant' ? 'You' : 'Learner'}: ${t.content}`)
    .join('\n\n');
  return `The conversation so far:\n\n${history}\n\n---\n\n${last?.role === 'user' ? `Learner: ${last.content}` : ''}`.trim();
}

export function billingProblem(apiKeySource: string | null, rateLimit: Record<string, unknown> | null): string | null {
  if (apiKeySource !== null && apiKeySource !== 'none') {
    return `the Claude CLI is using an API key (apiKeySource=${apiKeySource}), not your subscription -- remove it and sign in with "claude auth login"`;
  }
  if (rateLimit?.isUsingOverage === true) return "your plan's usage limit is reached and this would be billed as extra usage -- stopped";
  if (rateLimit && rateLimit.status !== 'allowed' && rateLimit.status !== 'allowed_warning') {
    const resets = typeof rateLimit.resetsAt === 'number' ? ` (resets ${new Date(rateLimit.resetsAt * 1000).toLocaleString()})` : '';
    return `your plan's usage limit is reached${resets}`;
  }
  return null;
}

export function callClaude(request: AiRequest, config: ClaudeConfig, spawnProcess: typeof spawn = spawn): Promise<unknown> {
  const command = config.command.trim() || 'claude';
  if (!isClaudeCommand(command)) {
    return Promise.reject(new AiError(`"${command}" is not the claude executable -- set the CLI command in Settings to claude or a path ending in claude.exe`));
  }
  fs.mkdirSync(WORK_DIR, { recursive: true });
  // A file, not an argument: a long kanji list can pass Windows' command-line limit.
  const systemPromptFile = path.join(WORK_DIR, `system-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(systemPromptFile, request.system);

  return new Promise((resolve, reject) => {
    let failure: string | null = null;
    let result: Record<string, unknown> | null = null;
    let apiKeySource: string | null = null;
    let rateLimit: Record<string, unknown> | null = null;
    let stderr = '';
    let buffered = '';
    let settled = false;

    const child = spawnProcess(command, claudeArgs(request, config, systemPromptFile), {
      cwd: WORK_DIR,
      env: claudeEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const timeoutMs = request.timeoutMs ?? config.timeoutMs;
    const timer = setTimeout(() => {
      failure = `timed out after ${Math.round(timeoutMs / 1000)}s`;
      child.kill();
    }, timeoutMs);

    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.rmSync(systemPromptFile, { force: true });
      if (failure) return reject(new AiError(failure));
      if (!result) return reject(new AiError(stderr.trim().slice(0, 500) || 'the Claude CLI exited without a result'));
      const text = typeof result.result === 'string' ? result.result : '';
      if (result.is_error === true || result.subtype !== 'success') {
        const detail = text || String(result.subtype ?? 'error');
        const hint = AUTH_PROBLEM.test(detail) ? ' -- sign the CLI in by running "claude auth login" in a terminal' : '';
        return reject(new AiError(`Claude: ${detail.slice(0, 300)}${hint}`));
      }
      if (request.schema) {
        if (result.structured_output == null) return reject(new AiError(`Claude gave no structured output${text ? `: "${text.slice(0, 300)}"` : ''}`));
        return resolve(result.structured_output);
      }
      resolve(text.trim());
    };

    const onLine = (line: string) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === 'system' && event.subtype === 'init') {
        apiKeySource = typeof event.apiKeySource === 'string' ? event.apiKeySource : null;
      } else if (event.type === 'rate_limit_event') {
        rateLimit = (event.rate_limit_info as Record<string, unknown> | undefined) ?? null;
      } else if (event.type === 'result') {
        result = event;
      }
      const problem = billingProblem(apiKeySource, rateLimit);
      if (problem && !failure) {
        failure = problem;
        child.kill();
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffered += chunk;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) onLine(line);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      failure = `could not run "${command}": ${err.message}`;
      done();
    });
    child.on('close', () => {
      if (buffered.trim()) onLine(buffered);
      done();
    });

    child.stdin.end(promptOf(request));
  });
}
