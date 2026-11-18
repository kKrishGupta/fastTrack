import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptBuffer, encryptBuffer, imageFromDataUrl } from '../src/services/biometric-crypto.service.js';

const config = {
  biometricKey: crypto.randomBytes(32).toString('base64'),
  jwtSecret: '12345678901234567890123456789012',
};

describe('biometric evidence encryption', () => {
  it('round-trips encrypted bytes without storing plaintext', () => {
    const source = crypto.randomBytes(12_000);
    const encrypted = encryptBuffer(source, config);
    expect(encrypted.encryptedData).not.toContain(source.toString('base64'));
    expect(decryptBuffer(encrypted, config)).toEqual(source);
  });

  it('accepts bounded JPEG data URLs and rejects invalid images', () => {
    const frame = `data:image/jpeg;base64,${crypto.randomBytes(12_000).toString('base64')}`;
    expect(imageFromDataUrl(frame)).toMatchObject({ mimeType: 'image/jpeg' });
    expect(() => imageFromDataUrl('data:image/png;base64,AAAA')).toThrow(/JPEG/);
  });
});
