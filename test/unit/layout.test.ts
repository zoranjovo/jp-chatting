import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { NARROW } from '../../src/layout.ts';

test('the drawer breakpoint in code is the one in styles.css', () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'src', 'styles.css'), 'utf8');
  const widths = [...css.matchAll(/@media \((max-width: \d+px)\)/g)].map((m) => `(${m[1]})`);
  assert.deepEqual(widths, [NARROW]);
});
