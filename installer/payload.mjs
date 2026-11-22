import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const staticImport = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.\.?\/[^'"]+\.mjs)['"]/g;
const dynamicImport = /import\(\s*['"](\.\.?\/[^'"]+\.mjs)['"]\s*\)/g;

function inside(root, path) {
  const value = relative(root, path);
  return value && !value.startsWith(`..${sep}`) && value !== '..' && !value.includes(`${sep}..${sep}`);
}

export async function runtimeModuleClosure(sourceDirectory, entries = ['index.mjs', 'launch.mjs']) {
  const root = resolve(sourceDirectory);
  const pending = entries.map((entry) => resolve(root, entry));
  const found = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (found.has(path)) continue;
    if (!inside(root, path) || !path.endsWith('.mjs')) throw new Error(`Runtime module escapes bridge root: ${path}`);
    const contents = await readFile(path, 'utf8');
    found.add(path);
    for (const expression of [staticImport, dynamicImport]) {
      expression.lastIndex = 0;
      for (const match of contents.matchAll(expression)) {
        const dependency = resolve(dirname(path), match[1]);
        if (!inside(root, dependency)) throw new Error(`Runtime import escapes bridge root: ${match[1]}`);
        if (!found.has(dependency)) pending.push(dependency);
      }
    }
  }
  return [...found].map((path) => relative(root, path)).sort();
}

export async function copyRuntimeClosure(sourceDirectory, destinationDirectory, entries) {
  const modules = await runtimeModuleClosure(sourceDirectory, entries);
  for (const module of modules) {
    const destination = resolve(destinationDirectory, module);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(sourceDirectory, module), destination);
  }
  return modules;
}

export async function assertRuntimeClosure(payloadDirectory, entries) {
  return runtimeModuleClosure(payloadDirectory, entries);
}
