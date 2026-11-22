import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] || '.');
const manifestName = 'file-manifest.json';

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Payload contains a symbolic link: ${entry.name}`);
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(relative(root, path));
  }
  return result;
}

function safePath(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) return false;
  const path = resolve(root, value);
  const fromRoot = relative(root, path);
  return fromRoot && fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`);
}

const manifest = JSON.parse(await readFile(join(root, manifestName), 'utf8'));
if (!Array.isArray(manifest) || manifest.length === 0) throw new Error('Payload manifest is empty or invalid');

const expected = new Map();
for (const entry of manifest) {
  if (!safePath(entry?.path) || !/^[a-f0-9]{64}$/.test(entry?.sha256 || '')) throw new Error('Payload manifest contains an invalid entry');
  const key = entry.path.toLowerCase();
  if (expected.has(key)) throw new Error(`Payload manifest contains a duplicate path: ${entry.path}`);
  expected.set(key, entry);
}

const actual = (await files(root)).filter((path) => {
  const lower = path.toLowerCase();
  return lower !== manifestName && lower !== 'uninstall.exe';
});
if (actual.length !== expected.size) throw new Error(`Payload file count differs from the manifest (${actual.length} != ${expected.size})`);

for (const path of actual) {
  const entry = expected.get(path.toLowerCase());
  if (!entry) throw new Error(`Payload contains an unlisted file: ${path}`);
  const digest = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
  if (digest !== entry.sha256) throw new Error(`Payload checksum mismatch: ${path}`);
}

console.log(`Verified ${actual.length} installer payload files.`);
