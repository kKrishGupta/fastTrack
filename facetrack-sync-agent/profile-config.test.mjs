import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_FILES, PROFILE_PORT, PROFILE } from './profile-config.mjs';
test('official components share an isolated loopback endpoint, with titles/input watcher disabled', () => {
  assert.equal(PROFILE, 'facetrack'); assert.equal(PROFILE_PORT, 5600);
  assert.match(PROFILE_FILES['aw-server/aw-server.toml'], /host = "127.0.0.1"/);
  assert.match(PROFILE_FILES['aw-client/aw-client.toml'], /port = "5600"/);
  assert.match(PROFILE_FILES['aw-qt/aw-qt.toml'], /^\[aw-qt\]/);
  assert.doesNotMatch(PROFILE_FILES['aw-qt/aw-qt.toml'], /aw-watcher-input/);
  assert.match(PROFILE_FILES['aw-watcher-window/aw-watcher-window.toml'], /exclude_title = true/);
});
