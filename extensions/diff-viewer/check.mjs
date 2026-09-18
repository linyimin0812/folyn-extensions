// Self-check for the diff side-filtering logic (mirrors fillColumn in src/index.ts).
// Run: node check.mjs
import assert from 'node:assert/strict';
import { diffWords } from 'diff';

function filter(parts, side) {
  return parts.filter(
    (p) => !((side === 'left' && p.added) || (side === 'right' && p.removed)),
  );
}

const parts = diffWords('hello world foo', 'hello earth foo');
const left = filter(parts, 'left');
const right = filter(parts, 'right');

assert.ok(left.some((p) => p.removed && /world/.test(p.value)), 'left shows removed "world"');
assert.ok(!left.some((p) => p.added), 'left has no additions');
assert.ok(right.some((p) => p.added && /earth/.test(p.value)), 'right shows added "earth"');
assert.ok(!right.some((p) => p.removed), 'right has no removals');
assert.ok(left.some((p) => !p.added && !p.removed && /hello/.test(p.value)), 'left keeps shared "hello"');

console.log('✓ diff side-filter check passed');
