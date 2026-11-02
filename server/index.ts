// In dev, Vite serves the UI and proxies /api here; `pnpm start` after
// `pnpm build` serves the built UI from dist/ as well.

import { createApp, hasBuiltUi } from './app.ts';
import { migrateLegacy } from './store.ts';

const PORT = Number(process.env.JP_CHATTING_PORT ?? 5174);

await migrateLegacy();

createApp().listen(PORT, '127.0.0.1', () => {
  console.log(`jp-chatting API on http://127.0.0.1:${PORT}${hasBuiltUi() ? ' (serving the built UI too)' : ''}`);
});
