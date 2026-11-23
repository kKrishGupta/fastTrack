import { stat } from 'node:fs/promises';
import { delimiter, join, resolve } from 'node:path';

const compilerNames = Object.freeze({ nsis: 'makensis.exe', inno: 'ISCC.exe' });

async function isFile(path) {
  try { return (await stat(path)).isFile(); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => resolve(value)))];
}

export async function findInstallerCompiler({ kind = 'nsis', explicit, env = process.env } = {}) {
  const executable = compilerNames[kind];
  if (!executable) throw new Error(`Unsupported installer compiler kind: ${kind}`);

  if (explicit) {
    const requested = resolve(explicit);
    if (await isFile(requested)) return requested;
    throw new Error(`${kind === 'nsis' ? 'NSIS' : 'Inno Setup'} compiler was not found at the requested path: ${requested}`);
  }

  const pathCandidates = (env.PATH || env.Path || env.path || '')
    .split(delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
    .map((entry) => join(entry, executable));
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || env.ProgramFilesX86 || 'C:\\Program Files (x86)';
  const localPrograms = env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Programs') : undefined;
  const standardCandidates = kind === 'nsis'
    ? [join(programFilesX86, 'NSIS', executable), join(programFiles, 'NSIS', executable), localPrograms && join(localPrograms, 'NSIS', executable)]
    : [join(programFilesX86, 'Inno Setup 6', executable), join(programFiles, 'Inno Setup 6', executable), localPrograms && join(localPrograms, 'Inno Setup 6', executable)];
  const candidates = unique([...pathCandidates, ...standardCandidates]);
  for (const candidate of candidates) if (await isFile(candidate)) return candidate;

  const product = kind === 'nsis' ? 'NSIS 3.x' : 'Inno Setup 6';
  const download = kind === 'nsis' ? 'https://nsis.sourceforge.io/Download' : 'https://jrsoftware.org/isdl.php';
  throw new Error(`${product} compiler (${executable}) was not found. Install it from ${download}, add it to PATH, or pass --compiler <absolute-path>. Searched: ${candidates.join(', ')}`);
}
