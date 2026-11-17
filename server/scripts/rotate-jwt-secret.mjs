import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  throw new Error(`Environment file not found: ${envPath}`);
}

const current = fs.readFileSync(envPath, 'utf8');
const secret = crypto.randomBytes(48).toString('base64url');
const next = /^JWT_SECRET=.*$/m.test(current)
  ? current.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`)
  : `${current.replace(/\s*$/, '')}\nJWT_SECRET=${secret}\n`;

fs.writeFileSync(envPath, next, { encoding: 'utf8', mode: 0o600 });
console.log(`Rotated JWT_SECRET in ${envPath} (secret value hidden)`);
