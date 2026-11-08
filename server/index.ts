// In dev, Vite serves the UI and proxies /api here; `pnpm start` after
// `pnpm build` serves the built UI from dist/ as well.

import { networkInterfaces } from 'node:os';
import { createApp, hasBuiltUi } from './app.ts';
import { migrateLegacy } from './store.ts';

const PORT = Number(process.env.JP_CHATTING_PORT ?? 5174);

// Loopback-only by default (single-user, local app). `--host` (or `pnpm start:lan`)
// binds every interface so a phone on the same network can reach it; the app has no
// auth, so this is opt-in. JP_CHATTING_HOST pins a specific address for scripted
// setups. `||` (not `??`) so an empty/blank JP_CHATTING_HOST falls back to the safe
// default rather than binding every interface (Node treats '' as 0.0.0.0).
const exposed = process.argv.includes('--host');
const HOST = process.env.JP_CHATTING_HOST?.trim() || (exposed ? '0.0.0.0' : '127.0.0.1');
const loopbackOnly = HOST === '127.0.0.1' || HOST === '::1';

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
  // 0.0.0.0/:: listen on every interface but aren't reachable as URLs, so show loopback;
  // a pinned address is shown as-is. Bracket an IPv6 literal for the URL.
  const wildcard = HOST === '0.0.0.0' || HOST === '::';
  const shown = wildcard ? '127.0.0.1' : HOST.includes(':') ? `[${HOST}]` : HOST;
  console.log(`jp-chatting API on http://${shown}:${PORT}${builtUi}`);
  if (!loopbackOnly) {
    const ips = lanAddresses();
    if (ips.length === 0) console.log('  (no external IPv4 address found to share on the LAN)');
    for (const ip of ips) console.log(`  LAN: http://${ip}:${PORT}  ← open this on your phone`);
  }
});
