// Consent boundaries change on explicit resume, never on process restart.
export function reconcileCheckpoint(state, device) {
  const floor = Date.parse(device.collectAfter);
  if (!Number.isFinite(floor)) throw new Error('Invalid collection boundary');
  const changed = Date.parse(state.collectAfter) !== floor;
  if (changed) {
    state.collectAfter = new Date(floor).toISOString();
    state.cursors = {};
  }
  state.cursors ||= {};
  return changed;
}

export function acknowledged(response, count) {
  if (!Number.isInteger(response?.accepted) || !Number.isInteger(response?.skipped)
    || response.accepted < 0 || response.skipped < 0
    || response.accepted + response.skipped !== count) {
    throw new Error('Incomplete upload acknowledgment; checkpoint retained');
  }
}

export function retryDelay(attempt, retryAfterMs = 0, random = Math.random) {
  return Math.max(retryAfterMs, Math.min(300_000, 1000 * 2 ** Math.min(attempt, 8)) * (0.75 + random() * 0.5));
}
