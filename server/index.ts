// In dev, Vite serves the UI and proxies /api here; `pnpm start` after
// `pnpm build` serves the built UI from dist/ as well.

import { networkInterfaces } from 'node:os';
import { createApp, hasBuiltUi } from './app.ts';
import { migrateLegacy } from './store.ts';

const PORT = Number(process.env.JP_CHATTING_PORT ?? 5174);

// Loopback-only by default (single-user, local app). `--host` (or `pnpm start:lan`)
// binds every interface so a phone on the same network can reach it; the app has no
// auth, so this is opt-in. JP_CHATTING_HOST overrides both for scripted setups.
const exposed = process.argv.includes('--host');
const HOST = process.env.JP_CHATTING_HOST ?? (exposed ? '0.0.0.0' : '127.0.0.1');

// IPv4 addresses of this machine's real network interfaces, for the LAN hint.
function lanAddresses(): string[] {
  const addrs: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const i of iface ?? []) {
      if (i.family === 'IPv4' && !i.internal) addrs.push(i.address);
    }
  }
  return addrs;
}

await migrateLegacy();

createApp().listen(PORT, HOST, () => {
  const builtUi = hasBuiltUi() ? ' (serving the built UI too)' : '';
  console.log(`jp-chatting API on http://127.0.0.1:${PORT}${builtUi}`);
  if (HOST !== '127.0.0.1') {
    for (const ip of lanAddresses()) console.log(`  LAN: http://${ip}:${PORT}  ← open this on your phone`);
  }
});
