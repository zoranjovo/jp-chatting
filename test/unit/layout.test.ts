import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { NARROW } from '../../src/layout.ts';

test('the drawer breakpoint in code is the one in styles.css', () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'src', 'styles.css'), 'utf8');
  const queries = [...css.matchAll(/@media (\(max-(?:width|height): \d+px\)(?:, \(max-(?:width|height): \d+px\))*)/g)].map((m) => m[1]);
  // Every query with a width in it is the drawer's; the height-only ones (short screens) are CSS alone.
  assert.deepEqual(
    queries.filter((q) => q.includes('max-width')),
    [NARROW],
  );
});
