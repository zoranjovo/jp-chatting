import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { NARROW } from '../../src/layout.ts';

test('the drawer breakpoint in code is the one in styles.css', () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'src', 'styles.css'), 'utf8');
  const queries = [...css.matchAll(/@media (\(max-(?:width|height): \d+px\)(?:(?:, | and )\(max-(?:width|height): \d+px\))*)/g)].map((m) => m[1]);
  // Every query with a width in it is the drawer's; the height-only ones (short screens) are CSS alone,
  // but one of them is the drawer's short-screen height, so the two stay in step.
  assert.deepEqual(
    queries.filter((q) => q.includes('max-width')),
    [NARROW],
  );
  const short = NARROW.match(/\(max-height: \d+px\)/)?.[0];
  assert.ok(short && queries.includes(short), `styles.css has no ${short} rules for short screens`);
});

test('the page asks to be resized for the on-screen keyboard', () => {
  // Without it Android Chrome lays the keyboard over the page instead, and the short-screen rules never apply.
  const html = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');
  assert.match(html, /<meta name="viewport" content="[^"]*interactive-widget=resizes-content/);
});
