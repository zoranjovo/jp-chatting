# jp-chatting — agent guide

A local-only web app for an English speaker to practise Japanese conversation and typing with an AI partner. Single user, runs on `127.0.0.1`, no accounts, no cloud. Everything persists as JSON under `data/` (git-ignored).

## Commands

| | |
|---|---|
| `pnpm dev` | API (tsx watch, port 5174) + Vite UI (port 5173, proxies `/api`) |
| `pnpm build && pnpm start` | built UI served by the API on 5174 |
| `pnpm typecheck` | `tsc --noEmit` over everything, tests included (strict, plus no unused locals/parameters) |
| `pnpm lint` | Biome, React hooks rules only, `src/` only — a few ms |
| `pnpm test` | unit tests (`node:test` via tsx), ~1s |
| `pnpm test:ui` | Playwright UI tests, ~20s; builds the UI first |
| `pnpm test:all` | typecheck, lint, unit and UI tests — run this before calling work done |
| `pnpm kanji` | rebuild the git-ignored `shared/wanikani-kanji.json` (also runs on install when missing) |
| `pnpm check:claude [models…]` | live check of the Claude CLI models (needs `claude auth login`) |
| `pnpm eval --label X <provider:model>…` | prompt eval on real models — see Prompt changes |
| `pnpm eval --compare A B` | compare two eval runs; side by side in `.cache/eval/A-vs-B.md` |

Package manager is **pnpm** (lockfile, `pnpm-workspace.yaml` allows esbuild's build). Node ≥ 20 (dev machine has 24). Windows 11 is the primary platform — keep paths, spawning and file handling Windows-safe.

## Layout

```
shared/            used by both server and UI
  types.ts         Settings (+ DEFAULT_SETTINGS), Chat, Message, Breakdown, Feedback
  kanji.ts         WaniKani level lookups, furigana markup stripping, kanjiAboveLevel()
  genki.ts         grammar points per Genki lesson (1-23), fed to the prompts when settings.genkiLesson > 0
  quality.ts       checks on model-written Japanese (replyProblems) and the fixes needing no model (autoFix, salvageFromForeign)
  wanikani-kanji.json   [kanji, level, meaning, on, kun] rows, ~2k kanji, 60 levels — git-ignored, built by `pnpm kanji`
server/
  index.ts         listens on JP_CHATTING_PORT (default 5174)
  app.ts           createApp(deps) — every /api route; deps.callAi is injectable for tests
  generate.ts      generateReply/Breakdown/Feedback — prompt, model call, checks, fixes; used by the API and the eval
  store.ts         JSON persistence: data/settings.json, data/chats/<uuid>.json
  prompts.ts       system prompts, JSON schemas, and coercion of model answers (toBreakdown/toFeedback)
  ai/index.ts      callAi() / listModels() dispatch on settings.provider
  ai/endpoint.ts   OpenAI-compatible /chat/completions + /models (LM Studio, Ollama, …)
  ai/claude.ts     headless `claude -p` runner + CLAUDE_MODELS list
  ai/types.ts      AiRequest, AiError, parseJsonReply, stripThinking
src/               React 19 UI (no router, no state library)
  App.tsx          settings context + Shell (chat list, active chat, reply/send flow)
  i18n.tsx         en/ja string tables + useT()
  romaji.ts        romaji → kana conversion for the composer
  components/      Sidebar, ChatView, MessageBubble, Analysis (breakdown/feedback), Composer,
                   JpText (furigana + kanji highlighting), SettingsDialog, NewChatDialog, Dialog
scripts/check-claude-models.ts
scripts/eval-prompts.ts   fixed scenarios × models through generate.ts, scored; results in .cache/eval/
test/unit/         node:test — one file per module, helpers.ts has the fakes
test/ui/           Playwright specs, fixtures.ts, mock-llm.ts (scripted model server)
```

## How it works

- **Conversation.** `POST /api/chats` makes an empty chat; the UI then calls `POST /api/chats/:id/reply`, which generates the partner's message (the opener when empty). Sending is two calls: `POST …/messages` stores the learner's text, then `…/reply`. Keeping them apart lets a failed reply be retried without resending.
- **History to the model.** `conversationTurns()` sends every message as role/content. If the history starts with the partner, a synthetic user cue is prepended so chat templates that need a leading user turn work. The Claude CLI takes one prompt, so `promptOf()` writes earlier turns out as a "Learner:/You:" transcript.
- **Analysis rendering.** The AI's English (explanations, summaries, translations, "you meant") goes through `RichText`: inline markdown (`**bold**`, `*italic*`, `` `code` ``) and Japanese quoted in 「」 shown as a bracket-less `.jp-term`. The prompts ask for no 「」, but models still use them sometimes, so the renderer is what guarantees it. Breakdown sentences are shown once, interlinear (`glossSegments`), with the explanation in a shared right-hand column when the panel is ≥ 640px wide (container query).
- **Analysis.** `POST …/messages/:mid/analyze` → a `Breakdown` for partner messages, a `Feedback` for the learner's. The result is cached on the message in the chat file; `?refresh=1` regenerates. Model output goes through `toBreakdown`/`toFeedback`, which coerce wrong types, string-encoded arrays and missing fields — models get this wrong regularly, so don't remove it.
- **Genki lesson** (`settings.genkiLesson`, 0 = not using Genki). The conversation prompt lists the grammar of lessons 1..N from `shared/genki.ts` and forbids later grammar; feedback corrects within those lessons and names the lesson for anything later; breakdowns cite lessons ("te-form (Genki L6)"). With 0 the prompts are exactly as without the feature. The list is a summary written from Genki 3rd edition — fix it there if a point is in the wrong lesson.
- **Speech style is per chat** (`chat.politeness`), chosen in the New chat dialog and switchable from the top bar (`PATCH /api/chats/:id`). It used to be a setting: `migrateLegacy()` in `store.ts` runs at server start, gives chats without one the old setting's value and drops it from `settings.json`.
- **Kanji limit.** The allowed kanji (WaniKani levels 1..N) are listed in the system prompt. The UI highlights any kanji above the level (`.over-level`) and every kanji has a hover title with its level/meaning/readings. Level 0 means kana only. `々` is never counted.
- **Reply pipeline** (`generateReply` in `server/generate.ts`). Models break the rules regularly — Sonnet often writes notes to itself in English ("Wait, I must check kanji…"), local models put furigana on katakana or give romaji readings — so every reply goes through:
  1. `autoFix`, no model call: drop `<think>` blocks and empty `{}`, drop furigana from kana-only words, spell out out-of-level kanji from their reading (`{注文|ちゅうもん}` → `ちゅうもん`, only when the hiragana reading covers every kana in the base, so `{お願|ねが}` is left alone).
  2. `salvageFromForeign`, no model call: if English leaked in, keep the clean Japanese before or after it — only in the unambiguous shapes (message + note; broken draft + note + fix; the same message twice). English in the middle of a real message is left for step 3.
  3. Still not clean (`replyProblems`: kanji above level, bad furigana, English/romaji)? One rewrite request listing the problems. Still not clean, or the rewrite failed (Claude's safeguards occasionally refuse an edit request)? One fresh draft. The candidate with the fewest problems wins.
  Breakdowns get `dropKanaFurigana`; feedback's corrected Japanese gets `autoFix`.
- **Furigana markup.** All Japanese the model writes uses `{漢字|かんじ}` — braces around the kanji part only, okurigana outside. `JpText` renders it as `<ruby>`; the furigana setting only hides the `<rt>` client-side, so the markup is always requested. `stripFurigana()` before any check or before sending text back to the model for analysis.
- **Romaji input.** `romajiToKana()` runs on the text before the caret on every change (skipped while a real IME is composing). Lowercase → hiragana, CAPS → katakana (each syllable takes the case of its first letter), `nn`/`n'`/n+consonant → ん, doubled consonant → っ, `x`/`l` → small kana, `-` → ー. A lone trailing `n` waits for the next key; `final=true` on send turns it into ん. It is idempotent on already-converted text — tests rely on that.
- **Persistence.** `store.ts` writes via temp file + rename, serialised per file (`serial()`), retrying rename on Windows `EPERM`/`EBUSY`. Settings saves are read-modify-write inside the queue so concurrent patches don't clobber each other. The API additionally serialises per-chat updates (`updateChat`) because AI calls happen between read and write. Chat ids are validated (`isChatId`) before touching the filesystem.

## AI providers

**Endpoint** (`provider: 'endpoint'`): any OpenAI-compatible server. Schema requests send `response_format: json_schema` (strict) and fall back to a plain request on a 4xx, relying on the prompt + `parseJsonReply` (handles code fences, prose, `<think>` blocks). The models dropdown comes live from `GET {baseUrl}/models`.

**Claude Code CLI** (`provider: 'claude'`). Invariants — keep all of them:
- Runs on the **subscription** the CLI is signed in to, never API credits. `claudeEnv()` strips every `ANTHROPIC_*` / `CLAUDE_*` variable (except `CLAUDE_CONFIG_DIR`) — that also removes a parent Claude Code session's wiring, which otherwise makes the child expect the parent to supply auth.
- A run whose `system/init` reports `apiKeySource` other than `none`, or whose `rate_limit_event` shows overage or a rejected status, is **killed** (`billingProblem()`).
- Never add `--bare` (API keys only). Tools, MCP, CLAUDE.md, skills, hooks, slash commands, Chrome and session persistence are all off; cwd is the empty `.cache/claude/`.
- The system prompt goes in a temp file (`--system-prompt-file`) because the kanji list can exceed Windows' command-line limit; the user prompt goes on stdin.
- Schema requests use `--json-schema` and read `structured_output`; they need `--max-turns 3` for the StructuredOutput tool turn.
- The CLI has no model-listing command, so `CLAUDE_MODELS` is a fixed list: Haiku, Sonnet and Opus 5.5 by full id (aliases like `sonnet` can move to a newer model on a CLI update; old saved aliases are mapped to the 5.5 ids on load). When changing it, run `pnpm check:claude` and keep only models that pass.
- Auth errors get a hint to run `claude auth login`. The standalone CLI's sign-in is separate from the Claude desktop app's.

## Conventions

- **Comments:** only where the code is non-obvious — a hidden constraint, a workaround, an invariant. Don't narrate what the code says. Match the existing density (a short header comment per module, the occasional "why").
- TypeScript strict, ES modules, imports with explicit `.ts`/`.tsx` extensions. No linter is configured; follow the surrounding style (2 spaces, single quotes, semicolons, trailing commas, ~140 col).
- **i18n:** every UI string lives in `src/i18n.tsx` in **both** `en` and `ja`; `ja` is typed as `Strings`, so a missing key fails `tsc`, and `test/unit/i18n.test.ts` checks shape parity, emptiness and untranslated copies. Breakdown/feedback explanations from the model stay in English by design.
- **Styling:** plain CSS in `src/styles.css` with tokens on `:root` and a `prefers-color-scheme: dark` override; Japanese text uses `--font-jp`. Must work at phone width (sidebar slides over below 760px; the top bar has a menu button and a new-chat button there).
- **Linting is deliberately scarce.** TypeScript does the heavy lifting; `biome.json` enables only `useHookAtTopLevel` and `useExhaustiveDependencies` (unnecessary dependencies allowed — effects keyed on a trigger value are fine). The formatter is off. Add a rule only for a class of bug it would have caught, never for style. A deliberate hook-dependency omission gets a `// biome-ignore lint/correctness/useExhaustiveDependencies: <why>` comment.
- Keep dependencies minimal — no SDKs for the AI calls (plain `fetch` / `spawn`), no UI framework beyond React.
- Prompts are part of behaviour: if you change a prompt's wording that tests match on (e.g. "You edit Japanese", "Start the conversation"), update the tests and the UI mock (`test/ui/mock-llm.ts` routes on `response_format` and on the rewrite system prompt's opening words).

## Prompt changes

Unit tests can't tell whether a prompt change made the Japanese better or worse, so check prompt and pipeline changes against real models:

1. Before the change: `pnpm eval --label before claude:claude-haiku-5-5 claude:claude-sonnet-5-5 claude:claude-opus-5-5 endpoint:<lm-studio-model>` (an endpoint model needs LM Studio serving it on :1234).
2. Make the change, then `pnpm eval --label after …` with the same models.
3. `pnpm eval --compare before after` re-scores both runs with the current checks, prints a metrics table, and writes every output side by side to `.cache/eval/before-vs-after.md`. **Read the outputs**, not just the numbers: the checks catch rule-breaking (kanji, markup, English, style, length, breakdown coverage, feedback verdicts), not naturalness.

Replies are sampled twice per scenario at the model's normal temperature, so expect noise; look for patterns, not single cases. Claude runs use the subscription.

## Adding things

- **A setting:** add it to `Settings` and `DEFAULT_SETTINGS` (`shared/types.ts`) — `withDefaults()` fills it in for old settings files. Add a control in `SettingsDialog`, strings in both languages, and tests (store default/merge, a UI test that it saves).
- **An API route:** in `createApp()` in `server/app.ts`, wrapped in `route()`; throw `NotFound` for 404s, let `AiError` become a 502. Add a test in `test/unit/api.test.ts` using the fake AI.
- **A Claude model:** add to `CLAUDE_MODELS`, run `pnpm check:claude <model>`.

## Testing

- **Unit** (`test/unit/*.test.ts[x]`): `node:test` + `assert/strict`. Each file runs in its own process; `useTempData()` points `JP_CHATTING_DATA` at a temp dir — never let a test touch `data/`. `helpers.ts` provides `mockServer()` (HTTP fake for the endpoint), `fakeSpawn()` (scripted `claude` process: stream-json events, stderr, spawn error, hang), and the API tests run `createApp({ callAi: fake })` on port 0. Components are tested with `renderToStaticMarkup`.
- **UI** (`test/ui/*.spec.ts`): Playwright, Chromium, one worker. `playwright.config.ts` starts `test/ui/mock-llm.ts` on 5199 and the built app on 5198 with data in `.cache/ui-test-data`. The `app` fixture resets chats/settings and the mock before each test. Use `startChat()` from fixtures — it waits for the new chat to exist and the opener to land, avoiding races with the previous chat. `mockControl(request, { fail, delayMs })` simulates outages/latency; `mockCalls()` shows what the app asked the model.
- If Playwright says the browser executable is missing, run `pnpm exec playwright install chromium` (the version must match `@playwright/test`).
- **CI** (`.github/workflows/ci.yml`) runs on every push and PR: one Ubuntu job — typecheck, lint, unit tests. The Playwright UI tests are **local only**: run `pnpm test:ui` (or `pnpm test:all`) before pushing UI changes. Windows-specific behaviour (spawning `claude`, file renames) isn't covered in CI either, so check it locally.
- Run `pnpm test:all` before finishing. Unit tests should stay fast and deterministic; no test may call a real model.

## Gotchas

- Don't read `PORT` — preview tools set it to the Vite port. The API uses `JP_CHATTING_PORT`.
- The Claude desktop app's environment can't authenticate a child `claude -p`; for live Claude testing the standalone CLI must be signed in (`claude auth login` in a normal terminal).
- `shared/wanikani-kanji.json` is **not committed** — keep it that way. `scripts/build-kanji.ts` builds it from davidluzgouveia/kanji-data (MIT, pinned commit); `postinstall` runs it when the file is missing, `pnpm kanji` rebuilds. Without it the app, typecheck and tests fail on the import. It comes from kanji-data; its levels reflect WaniKani when that dataset was compiled, so a few kanji may be a level off today. Some common kanji (e.g. 薔) aren't on WaniKani at all and are always "above level".
- Replies are not streamed (the kanji check needs the whole reply first); the UI shows a typing indicator.
- The whole chat history is sent on every reply. Fine for practice-length chats; trim in `conversationTurns()` if long chats start hitting context limits.
