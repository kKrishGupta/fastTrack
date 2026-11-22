import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { acknowledged } from './checkpoint.mjs';

// Event payloads are encrypted before entering SQLite, including WAL/journal pages.
export class Outbox {
  constructor(path, key, { maxBytes = 100 * 1024 * 1024, maxAgeMs = 72 * 3600_000 } = {}) {
    this.key = Buffer.from(key, 'base64');
    if (this.key.length !== 32) throw new Error('Invalid outbox encryption key');
    this.maxBytes = maxBytes; this.maxAgeMs = maxAgeMs;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS metadata (name TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS checkpoints (bucket TEXT PRIMARY KEY, end TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pending (id INTEGER PRIMARY KEY, bucket TEXT NOT NULL, start TEXT NOT NULL,
        end TEXT NOT NULL, payload BLOB NOT NULL, created INTEGER NOT NULL, UNIQUE(bucket,start));`);
  }
  encode(events) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(events)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  }
  decode(bytes) {
    const value = Buffer.from(bytes), decipher = createDecipheriv('aes-256-gcm', this.key, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8'));
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  reconcile(epoch) {
    if (!Number.isFinite(Date.parse(epoch))) throw new Error('Invalid collection epoch');
    const value = new Date(epoch).toISOString();
    const previous = this.db.prepare("SELECT value FROM metadata WHERE name='epoch'").get()?.value;
    if (previous === value) return 0;
    return this.transaction(() => {
      const dropped = this.stats().count;
      this.db.exec('DELETE FROM pending; DELETE FROM checkpoints;');
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES ('epoch',?)").run(value);
      return dropped;
    });
  }
  cursor(bucket, floor) { return this.db.prepare('SELECT end FROM checkpoints WHERE bucket=?').get(bucket)?.end || floor; }
  stage(bucket, start, end, events, now = Date.now()) {
    if (!(Date.parse(end) > Date.parse(start))) throw new Error('Invalid checkpoint interval');
    const payload = this.encode(events);
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT id FROM pending WHERE bucket=? AND start=?').get(bucket, start);
      if (existing) return existing.id;
      if (this.stats().bytes + payload.length > this.maxBytes) throw new Error('Offline queue is full; polling stopped without advancing checkpoint');
      const result = this.db.prepare('INSERT INTO pending(bucket,start,end,payload,created) VALUES (?,?,?,?,?)').run(bucket, start, end, payload, now);
      this.db.prepare('INSERT OR REPLACE INTO checkpoints VALUES (?,?)').run(bucket, end);
      return result.lastInsertRowid;
    });
  }
  stats() { return this.db.prepare('SELECT count(*) AS count, coalesce(sum(length(payload)),0) AS bytes FROM pending').get(); }
  expire(now = Date.now()) { return this.db.prepare('DELETE FROM pending WHERE created < ?').run(now - this.maxAgeMs).changes; }
  async flush(upload, canSend = () => true) {
    let total = 0;
    for (const row of this.db.prepare('SELECT * FROM pending ORDER BY id LIMIT 36').all()) {
      if (!canSend()) break;
      const events = this.decode(row.payload);
      for (let offset = 0; offset < events.length; offset += 500) {
        if (!canSend()) return total;
        const batch = events.slice(offset, offset + 500);
        acknowledged(await upload(batch), batch.length);
      }
      if (!canSend()) break;
      this.db.prepare('DELETE FROM pending WHERE id=?').run(row.id);
      total += events.length;
    }
    return total;
  }
  close() { this.db.close(); }
}
