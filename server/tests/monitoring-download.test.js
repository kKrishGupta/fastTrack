import { describe, expect, it } from 'vitest';
import { createTextZip } from '../../client/src/utils/zip.js';
import { createAgentArchive } from '../../client/src/utils/agent-download.js';

function unzipStored(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    expect(view.getUint16(offset + 8, true)).toBe(0);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const from = offset + 30 + nameLength + extraLength;
    files[name] = new TextDecoder().decode(bytes.subarray(from, from + size));
    offset = from + size;
  }
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  expect(view.getUint16(end + 10, true)).toBe(Object.keys(files).length);
  expect(view.getUint32(end + 16, true)).toBe(offset);
  expect(view.getUint32(offset, true)).toBe(0x02014b50);
  return files;
}

describe('downloadable FaceTrack agent', () => {
  it('uses correct ZIP CRC-32 checksums and preserves UTF-8 text', () => {
    const zip = createTextZip([{ name: 'check.txt', contents: '123456789' }, { name: 'readme.txt', contents: 'FaceTrack – monitoring' }]);
    expect(new DataView(zip.buffer).getUint32(14, true)).toBe(0xcbf43926);
    expect(unzipStored(zip)['readme.txt']).toBe('FaceTrack – monitoring');
  });
  it('blocks duplicate names and archive path traversal', () => {
    expect(() => createTextZip([{ name: '../.env', contents: 'secret' }])).toThrow();
    expect(() => createTextZip([{ name: 'x', contents: '' }, { name: 'x', contents: '' }])).toThrow();
  });
  it('contains exactly the runnable agent and selected server configuration, without credentials', () => {
    const files = unzipStored(createAgentArchive('https://fast-track-gules.vercel.app'));
    expect(Object.keys(files).sort()).toEqual(['Connect.cmd', 'README.txt', 'Start.cmd', 'activitywatch.mjs', 'checkpoint.mjs', 'outbox.mjs', 'privacy.mjs', 'screenshot-outbox.mjs', 'state-store.mjs', 'connection.json', 'index.mjs'].sort());
    expect(JSON.parse(files['connection.json'])).toEqual({ server: 'https://fast-track-gules.vercel.app' });
    expect(files['Connect.cmd']).toContain('"%~dp0index.mjs" connect');
    expect(files['Start.cmd']).toContain('"%~dp0index.mjs" run');
    expect(files['Connect.cmd'].replace(/\r\n/g, '')).not.toContain('\n');
    expect(files['index.mjs']).toContain("command === 'connect'");
    const runtimeImports = [...Object.values(files).join('\n').matchAll(/from ['"]\.\/(.+?\.mjs)['"]/g)].map((match) => match[1]);
    expect(runtimeImports.length).toBeGreaterThan(0);
    expect(runtimeImports.filter((name) => !files[name])).toEqual([]);
    expect(files).not.toHaveProperty('.state.json');
    expect(files).not.toHaveProperty('.env');
  });
  it('rejects server URLs containing credentials or a path', () => {
    expect(() => createAgentArchive('https://user:password@example.com')).toThrow();
    expect(() => createAgentArchive('https://example.com/api')).toThrow();
  });
});
