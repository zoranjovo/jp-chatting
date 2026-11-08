// In dev, Vite serves the UI and proxies /api here; `pnpm start` after
// `pnpm build` serves the built UI from dist/ as well.

import { createSocket } from 'node:dgram';
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
// 0.0.0.0/:: listen on every interface but aren't reachable as URLs.
const wildcard = HOST === '0.0.0.0' || HOST === '::';
// As it appears in a URL, and so in the Host and Origin headers: an IPv6 literal in brackets.
const urlHost = HOST.includes(':') ? `[${HOST}]` : HOST.toLowerCase();

// IPv4 addresses of this machine's network interfaces, virtual ones (WSL, VirtualBox, …) included.
function lanAddresses(): string[] {
  const addrs: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const i of iface ?? []) {
      if (i.family === 'IPv4' && !i.internal) addrs.push(i.address);
    }
  }
  return addrs;
}

// The address this machine reaches the network through, which is the one the phone can use: connecting a
// UDP socket only looks up the route, nothing is sent. 192.0.2.1 is a documentation address (TEST-NET-1),
// so the lookup lands on the default route. Undefined when there is none.
function primaryAddress(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    const done = (address?: string) => {
      try {
        socket.close();
      } catch {}
      resolve(address);
    };
    socket.on('error', () => done());
    socket.connect(9, '192.0.2.1', () => done(socket.address().address));
  });
}

await migrateLegacy();

const app = loopbackOnly ? createApp() : createApp({ lanHosts: wildcard ? lanAddresses : () => [urlHost] });

app.listen(PORT, HOST, async () => {
  const builtUi = hasBuiltUi() ? ' (serving the built UI too)' : '';
  console.log(`jp-chatting API on http://${wildcard ? '127.0.0.1' : urlHost}:${PORT}${builtUi}`);
  if (!wildcard) return;
  const all = lanAddresses();
  const primary = await primaryAddress();
  // Every address answers; only the routed one is worth printing. Without a route, list them all.
  const shown = primary && all.includes(primary) ? [primary] : all;
  if (shown.length === 0) console.log('  (no network address found to open on the phone)');
  for (const ip of shown) console.log(`  On your phone (same network): http://${ip}:${PORT}`);
});
