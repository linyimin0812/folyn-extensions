// Self-check for the pure logic in src/logic.ts (capture/dedupe rules,
// history-file validation, size trimming, and list formatting).
// Run: node check.mjs (Node ≥ 23.6 for native TS type stripping)
import assert from 'node:assert/strict';
import {
  MAX_ITEMS,
  MAX_IMAGE_B64,
  shouldCapture,
  isNoTextError,
  isNoFileError,
  isUnknownMethodError,
  normalizeItem,
  trim,
  formatTime,
  previewText,
} from './src/logic.ts';

// shouldCapture — empty/null ignored, consecutive duplicates skipped
assert.equal(shouldCapture(null, null), false);
assert.equal(shouldCapture('', 'x'), false);
assert.equal(shouldCapture('x', 'x'), false);
assert.equal(shouldCapture('x', null), true, 'first sighting of text is captured');
assert.equal(shouldCapture('x', 'y'), true, 'changed clipboard text is captured');

// isNoTextError — arboard ContentNotAvailable means "image or empty", not failure
assert.equal(isNoTextError('The clipboard contents were not available in the requested format or the clipboard is empty.'), true);
assert.equal(isNoTextError('clipboard permission not granted'), false);
assert.equal(isNoTextError(''), false);

// isUnknownMethodError — older host without clipboard:read-image
assert.equal(isUnknownMethodError('unknown RPC method: clipboard:read-image'), true);
assert.equal(isUnknownMethodError('fs:read denied: path out of scope'), false);

// isNoFileError — ENOENT from the host fs plugin means FIRST RUN, not a
// load failure (the session may save; there is nothing on disk to lose)
assert.equal(isNoFileError('No such file or directory (os error 2)'), true);
assert.equal(isNoFileError('The system cannot find the file specified. (os error 2)'), true);
assert.equal(isNoFileError('rpc timeout'), false, 'listener race timeout is a real failure');
assert.equal(isNoFileError('fs:read denied: path out of scope'), false);
assert.equal(isNoFileError('permission denied (os error 13)'), false, 'EACCES is a real failure, not first-run');

// normalizeItem — history.json is a trust boundary: junk drops, valid passes
assert.deepEqual(normalizeItem({ id: 'a', kind: 'text', ts: 5, text: 'hi' }), {
  id: 'a',
  kind: 'text',
  ts: 5,
  text: 'hi',
});
assert.equal(normalizeItem(null), null);
assert.equal(normalizeItem('text'), null);
assert.equal(normalizeItem({ kind: 'text' }), null, 'text item without text field drops');
assert.equal(normalizeItem({ kind: 'image', mime: 'image/png' }), null, 'image without data drops');
assert.equal(normalizeItem({ kind: 'image', mime: 'video/mp4', data: 'x' }), null, 'non-image mime drops');
assert.equal(normalizeItem({ kind: 'file' }), null, 'unknown kind drops');
const ok = normalizeItem({ id: 'b', kind: 'image', ts: 9, mime: 'image/png', data: 'QUJD', w: 8, h: 9 });
assert.ok(ok && ok.kind === 'image' && ok.data === 'QUJD' && ok.w === 8);
const big = normalizeItem({ kind: 'image', mime: 'image/png', data: 'A'.repeat(MAX_IMAGE_B64 + 1) });
assert.equal(big, null, 'oversized image data drops');
const noId = normalizeItem({ kind: 'text', text: 'hi' });
assert.ok(noId && typeof noId.id === 'string' && noId.id.length > 0, 'missing id gets generated');
const noTs = normalizeItem({ id: 'c', kind: 'text', text: 'hi' });
assert.ok(noTs && Number.isFinite(noTs.ts), 'missing ts defaults to now');

// trim — newest-first cap + whole-file size bound
const mk = (i) => ({ id: `i${i}`, kind: 'text', ts: 1000 - i, text: `t${i}` });
const capped = trim(Array.from({ length: MAX_ITEMS + 50 }, (_, i) => mk(i)));
assert.equal(capped.length, MAX_ITEMS, 'caps at MAX_ITEMS');
assert.equal(capped[0].id, 'i0', 'keeps the newest');
assert.equal(capped[capped.length - 1].id, `i${MAX_ITEMS - 1}`, 'drops the oldest');
const bigItem = (id) => ({ id, kind: 'text', ts: 1, text: 'A'.repeat(15_000_000) });
const bounded = trim([bigItem('new'), bigItem('old')]);
assert.equal(bounded.length, 1, 'size bound drops oldest oversized entries');
assert.equal(bounded[0].id, 'new', 'size bound keeps the newest');

// formatTime — HH:MM today, M/D HH:MM otherwise
const now = new Date(2026, 0, 15, 10, 30).getTime();
assert.equal(formatTime(new Date(2026, 0, 15, 9, 5).getTime(), now), '09:05');
assert.equal(formatTime(new Date(2025, 11, 31, 23, 59).getTime(), now), '12/31 23:59');

// previewText — first non-empty line, collapsed, truncated at 60 chars
assert.equal(previewText('first\nsecond'), 'first');
assert.equal(previewText('\n\n  spaced   out  \nrest'), 'spaced out');
assert.equal(previewText('a'.repeat(70)), 'a'.repeat(60) + '…');
assert.equal(previewText('\n \n'), '(空白)');

console.log('✓ paste-history logic check passed');
