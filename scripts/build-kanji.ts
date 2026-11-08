// Builds shared/wanikani-kanji.json -- every kanji WaniKani teaches, with its
// level, meanings and readings -- from davidluzgouveia/kanji-data (MIT). The
// file isn't committed; this runs on `pnpm install` when it's missing or was
// built by an older version of this script, or by hand with `pnpm kanji`.
//
//   pnpm kanji                 # rebuild
//   tsx scripts/build-kanji.ts --if-missing   # what postinstall runs

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hasMarkers, type KanjiRow, type SourceKanji, toRow } from './kanji-source.ts';

/** Pinned so a rebuild gives the same levels every time. */
const SOURCE = 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/00fd7079c3890f430759536f91aa5e854ec0ca4f/kanji.json';
/** SHA-256 of that file. The commit pin already fixes the content; this checks it ourselves rather than trusting the host. */
const SOURCE_SHA256 = '561b72ea9df703c58fae0c68585812e172aaa7611d2fcee6719d55fd2dfd4fa4';
const OUT = path.join(import.meta.dirname, '..', 'shared', 'wanikani-kanji.json');

/** Built, and not by a version of this script that kept the dataset's answer markers. */
function upToDate(): boolean {
  try {
    return !(JSON.parse(fs.readFileSync(OUT, 'utf8')) as KanjiRow[]).some(hasMarkers);
  } catch {
    return false;
  }
}

async function main() {
  if (process.argv.includes('--if-missing') && upToDate()) return;

  let bytes: Buffer;
  try {
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.warn(`[kanji] could not download the kanji data (${(err as Error).message}). Run \`pnpm kanji\` once you are online.`);
    process.exitCode = process.argv.includes('--if-missing') ? 0 : 1;
    return;
  }

  // Nothing from a mismatched download is used. Under --if-missing it doesn't fail the install, as when offline:
  // a captive portal or proxy answering with its own page is far likelier than tampering.
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== SOURCE_SHA256) {
    console.warn(
      `[kanji] the downloaded kanji data has SHA-256 ${hash}, expected ${SOURCE_SHA256}, so it was not used. ` +
        'A proxy or Wi-Fi login page can cause this: run `pnpm kanji` again on a normal connection.',
    );
    process.exitCode = process.argv.includes('--if-missing') ? 0 : 1;
    return;
  }
  const raw = JSON.parse(bytes.toString('utf8')) as Record<string, SourceKanji>;

  const rows = Object.entries(raw)
    .map(([kanji, k]) => toRow(kanji, k))
    .filter((r): r is KanjiRow => !!r)
    .sort((a, b) => a[1] - b[1]);

  fs.writeFileSync(OUT, `[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);
  console.log(`[kanji] wrote ${rows.length} kanji across ${new Set(rows.map((r) => r[1])).size} WaniKani levels to ${path.relative(process.cwd(), OUT)}`);
}

await main();
