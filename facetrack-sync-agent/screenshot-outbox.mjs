import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class ScreenshotOutbox {
  constructor(path, key, { maxBytes = 500 * 1024 * 1024, maxAgeMs = 72 * 3600_000 } = {}) {
    this.key = Buffer.from(key, 'base64');
    if (this.key.length !== 32) throw new Error('Invalid screenshot queue encryption key');
    this.maxBytes = maxBytes; this.maxAgeMs = maxAgeMs;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS screenshots (captureId TEXT PRIMARY KEY, payload BLOB NOT NULL, created INTEGER NOT NULL);`);
  }
  encode(metadata, bytes) {
    const header = Buffer.from(JSON.stringify(metadata));
    const plain = Buffer.allocUnsafe(4 + header.length + bytes.length);
    plain.writeUInt32BE(header.length); header.copy(plain, 4); bytes.copy(plain, 4 + header.length);
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }
  decode(payload) {
    const value = Buffer.from(payload), decipher = createDecipheriv('aes-256-gcm', this.key, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]);
    const length = plain.readUInt32BE(0);
    if (length < 2 || length > plain.length - 4) throw new Error('Invalid encrypted screenshot queue item');
    return { metadata: JSON.parse(plain.subarray(4, 4 + length).toString('utf8')), bytes: plain.subarray(4 + length) };
  }
  enqueue(metadata, bytes, now = Date.now()) {
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('Screenshot bytes are required');
    const payload = this.encode(metadata, bytes);
    const existing = this.db.prepare('SELECT captureId FROM screenshots WHERE captureId=?').get(metadata.captureId);
    if (existing) return false;
    if (this.stats().bytes + payload.length > this.maxBytes) throw new Error('Encrypted screenshot queue is full; capture was skipped');
    this.db.prepare('INSERT INTO screenshots VALUES (?,?,?)').run(metadata.captureId, payload, now);
    return true;
  }
  pending(limit = 10) { return this.db.prepare('SELECT captureId,payload FROM screenshots ORDER BY created LIMIT ?').all(limit).map((row) => ({ captureId: row.captureId, ...this.decode(row.payload) })); }
  remove(captureId) { return this.db.prepare('DELETE FROM screenshots WHERE captureId=?').run(captureId).changes; }
  stats() { return this.db.prepare('SELECT count(*) AS count, coalesce(sum(length(payload)),0) AS bytes FROM screenshots').get(); }
  expire(now = Date.now()) { return this.db.prepare('DELETE FROM screenshots WHERE created < ?').run(now - this.maxAgeMs).changes; }
  close() { this.db.close(); }
}
