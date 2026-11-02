# jp-chatting

A local-only app for practising Japanese typing and conversation with an LLM of your choice.

Yes, it is 100% vibecoded.

There are a lot of Japanese specific features in the app, but you should be able to strip that out and adapt the basic premise of it to learn and practise any language, feel free to fork.

- **Chats** — multiple chats, each optionally with a topic or scenario ("ordering at a café"). The partner sends the first message.
- **Breakdown** — on any partner message: line-by-line English translation, a short explanation of how each line is built, and a word-by-word gloss.
- **Check** — on any of your messages: what you seem to mean, whether it's right, a natural Japanese version, and line-by-line notes. Works on English input too (you get the translation).
- **Kanji limit** — set your WaniKani level; the partner only uses kanji up to that level and writes everything else in kana. Replies are checked, and any slip is rewritten once; anything left over is highlighted (hover any kanji for its level, meaning and readings).
- **Furigana** toggle, **polite/casual** speech style, **romaji → kana** typing (lowercase → hiragana, CAPS → katakana, `nn` → ん, `-` → ー).
- **UI in English or Japanese** — switch in the sidebar.

## Run

```bash
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. The API runs on port 5174 (`JP_CHATTING_PORT` to change it).

`pnpm build && pnpm start` serves the built UI from the API server instead (http://127.0.0.1:5174).

## AI providers

Pick one in Settings:

- **Model endpoint** — any OpenAI-compatible server. LM Studio: `http://localhost:1234/v1` (start its server first). Ollama: `http://localhost:11434/v1`. Models are listed from the endpoint's `/models`.
- **Claude Code CLI** — runs `claude -p` on the subscription the CLI is signed in to, never an API key (API-key variables are stripped, and a run that reports an API key or extra usage is stopped). Tools, MCP, CLAUDE.md, skills and hooks are all switched off. Sign the CLI in once with `claude auth login`.

  **Personal use only.** Running this on your own computer with your own Claude subscription signed in to the official Claude Code CLI is ordinary personal use of Claude Code. Don't host it for other people or let anyone else use it through your account — Anthropic's terms don't allow sharing your account or routing other people's requests through your subscription ([Consumer Terms](https://www.anthropic.com/legal/consumer-terms) §2–3, [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)). Checked November 2026; not legal advice.

## Data

Everything is plain JSON under `data/` (git-ignored): `data/settings.json` and one `data/chats/<id>.json` per chat, with any breakdowns and feedback cached on their messages.

## Kanji data

The kanji-by-WaniKani-level list (`shared/wanikani-kanji.json`) isn't in the repo. `pnpm install` builds it from [davidluzgouveia/kanji-data](https://github.com/davidluzgouveia/kanji-data) (MIT), pinned to one commit; run `pnpm kanji` to rebuild it, or if the install was offline. Its WaniKani levels date from when that dataset was compiled, so a few kanji may sit a level off from today's WaniKani.

## Scripts

- `pnpm test` — unit tests (server, AI runners with fakes, prompts, store, romaji, kanji, i18n, components)
- `pnpm test:ui` — Playwright UI tests against the built app and a scripted mock model (first time: `pnpm exec playwright install chromium`)
- `pnpm test:all` — typecheck + both
- `pnpm check:claude` — tries every listed Claude model through the CLI

See [AGENTS.md](AGENTS.md) for how the code fits together.

## License

[MIT](LICENSE). The kanji data downloaded on install comes from [davidluzgouveia/kanji-data](https://github.com/davidluzgouveia/kanji-data), also MIT.
