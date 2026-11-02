import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import type { spawn } from 'node:child_process';

/** Points the store at a fresh temp dir. Each test file runs in its own process, so this is per file. */
export async function useTempData(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jp-chatting-test-'));
  process.env.JP_CHATTING_DATA = dir;
  return dir;
}

export async function clearTempData(): Promise<void> {
  const dir = process.env.JP_CHATTING_DATA;
  if (dir) await fs.rm(dir, { recursive: true, force: true });
}

export interface Listening {
  url: string;
  close: () => Promise<void>;
}

export async function listen(handler: http.RequestListener): Promise<Listening> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

/** A tiny HTTP server whose answers come from `respond`; every request is recorded. */
export async function mockServer(respond: (req: RecordedRequest) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>) {
  const requests: RecordedRequest[] = [];
  const server = await listen((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const recorded: RecordedRequest = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: raw ? JSON.parse(raw) : undefined };
      requests.push(recorded);
      const { status = 200, body } = await respond(recorded);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
  });
  return { ...server, requests };
}

export function chatCompletion(content: string) {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

export interface FakeRun {
  command: string;
  args: string[];
  options: Record<string, unknown>;
  stdin: string;
  /** The system prompt file's contents while the run was live. */
  systemPrompt: string | null;
  systemPromptFile: string | null;
  killed: boolean;
}

export interface FakeSpawnScript {
  /** stream-json events printed to stdout, one per line; a string is printed as is. */
  events?: (Record<string, unknown> | string)[];
  stderr?: string;
  /** Emit a spawn error (e.g. ENOENT) instead of running. */
  error?: NodeJS.ErrnoException;
  /** Never exit on its own: only kill() ends it. */
  hang?: boolean;
}

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin: Writable;
  killed = false;
  private closed = false;

  constructor(private readonly run: FakeRun, private readonly script: FakeSpawnScript) {
    super();
    let input = '';
    this.stdin = new Writable({
      write: (chunk, _enc, cb) => {
        input += chunk.toString();
        cb();
      },
      final: (cb) => {
        run.stdin = input;
        cb();
        setImmediate(() => this.play());
      },
    });
  }

  private async play() {
    if (this.script.error) return this.emit('error', this.script.error);
    if (this.script.stderr) this.stderr.write(this.script.stderr);
    for (const event of this.script.events ?? []) {
      if (this.killed) return;
      this.stdout.write(`${typeof event === 'string' ? event : JSON.stringify(event)}\n`);
      await new Promise((r) => setImmediate(r));
    }
    if (!this.script.hang) this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stdout.end();
    this.stderr.end();
    setImmediate(() => this.emit('close', this.killed ? null : 0));
  }

  kill() {
    this.killed = true;
    this.run.killed = true;
    this.close();
    return true;
  }
}

/** A stand-in for child_process.spawn that plays back a scripted Claude CLI run. */
export function fakeSpawn(script: FakeSpawnScript) {
  const runs: FakeRun[] = [];
  const fn = (command: string, args: string[], options: Record<string, unknown>) => {
    const i = args.indexOf('--system-prompt-file');
    const systemPromptFile = i >= 0 ? args[i + 1] : null;
    let systemPrompt: string | null = null;
    try {
      systemPrompt = systemPromptFile ? readFileSync(systemPromptFile, 'utf8') : null;
    } catch {
      systemPrompt = null;
    }
    const run: FakeRun = { command, args, options, stdin: '', systemPrompt, systemPromptFile, killed: false };
    runs.push(run);
    return new FakeChild(run, script);
  };
  return { spawn: fn as unknown as typeof spawn, runs };
}

export const INIT_OK = { type: 'system', subtype: 'init', model: 'claude-haiku-5-5', apiKeySource: 'none', session_id: 's1' };

export function resultEvent(fields: Record<string, unknown>) {
  return { type: 'result', subtype: 'success', is_error: false, session_id: 's1', ...fields };
}
