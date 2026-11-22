import { spawn } from 'node:child_process';
import { open, readFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function protect(bytes, mode) {
  return new Promise((resolve, reject) => {
    const operation = mode === 'protect' ? 'Protect' : 'Unprotect';
    const script = `Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0
      ? resolve(Buffer.from(output.trim(), 'base64'))
      : reject(new Error(`Windows credential protection failed; state was not saved. ${error.trim() || `PowerShell exited with code ${code}`}`)));
    child.stdin.on('error', () => {});
    child.stdin.end(bytes.toString('base64'));
  });
}
export async function readState(path) {
  const contents = await readFile(path, 'utf8');
  if (contents.startsWith('DPAPI:')) {
    if (process.platform !== 'win32') throw new Error('This device state belongs to a Windows account');
    return JSON.parse((await protect(Buffer.from(contents.slice(6), 'base64'), 'unprotect')).toString('utf8'));
  }
  return JSON.parse(contents); // Existing prototype state migrates to DPAPI on the next successful save.
}
export async function writeState(path, state) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(JSON.stringify(state));
  const contents = process.platform === 'win32' ? `DPAPI:${(await protect(bytes, 'protect')).toString('base64')}` : bytes;
  const file = await open(`${path}.tmp`, 'w', 0o600);
  try { await file.writeFile(contents); await file.sync(); } finally { await file.close(); }
  await rename(`${path}.tmp`, path);
}
