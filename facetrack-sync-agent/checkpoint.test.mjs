import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledged, reconcileCheckpoint, retryDelay } from './checkpoint.mjs';

test('repeated restarts preserve boundary and successful checkpoint', () => {
  const state = { collectAfter: '2026-01-01T00:00:00Z', cursors: { window: '2026-01-01T02:00:00Z' } };
  for (let i = 0; i < 10; i++) assert.equal(reconcileCheckpoint(state, { collectAfter: '2026-01-01T00:00:00.000Z' }), false);
  assert.equal(state.cursors.window, '2026-01-01T02:00:00Z');
  assert.equal(reconcileCheckpoint(state, { collectAfter: '2026-01-01T03:00:00Z' }), true);
  assert.deepEqual(state.cursors, {});
});
test('partial, malformed and negative acknowledgments never advance checkpoints', () => {
  for (const result of [{}, { accepted: 1, skipped: 0 }, { accepted: -1, skipped: 3 }, { accepted: 2.5, skipped: 0.5 }]) assert.throws(() => acknowledged(result, 2));
  acknowledged({ accepted: 1, skipped: 1 }, 2);
});
test('retries back off, remain bounded and honor Retry-After', () => {
  assert.equal(retryDelay(1, 0, () => 0.5), 2000);
  assert.equal(retryDelay(20, 600_000, () => 0.5), 600_000);
  assert.ok(retryDelay(20) <= 375_000);
});
