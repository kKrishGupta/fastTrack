import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, domainMatches, effectivePolicy, filterEvents } from '../src/services/monitoring-policy.service.js';
import { policySchema, ruleSchema } from '../src/validators/monitoring.schemas.js';

describe('monitoring policy privacy boundaries', () => {
  const browser = { type: 'web.tab.current', domain: 'work.example.com', bucketId: 'work-profile', title: 'Private title' };
  it('defaults to no browser collection, no titles and no screenshots', () => {
    expect(DEFAULT_POLICY.screenshotsEnabled).toBe(false);
    expect(filterEvents([browser], DEFAULT_POLICY)).toEqual([]);
    expect(filterEvents([{ type: 'currentwindow', app: 'Code.exe', title: 'secret' }], DEFAULT_POLICY)).toEqual([{ type: 'currentwindow', app: 'Code.exe' }]);
  });
  it('requires exact approved work bucket and respects domain boundaries', () => {
    const policy = { ...DEFAULT_POLICY, browserEnabled: true, approvedBrowserBuckets: ['work-profile'] };
    expect(filterEvents([browser, { ...browser, bucketId: 'personal-profile' }], policy)).toHaveLength(1);
    expect(filterEvents([browser], { ...policy, excludedDomains: ['example.com'] })).toEqual([]);
    expect(domainMatches('notexample.com', 'example.com')).toBe(false);
  });
  it('requires separate device consent before URL details or browser titles are effective', () => {
    const policy = { ...DEFAULT_POLICY, browserEnabled: true, browserUrlMode: 'full', browserTitleEnabled: true, approvedBrowserBuckets: ['work-profile'] };
    const event = { ...browser, url: 'https://work.example.com/path?secret=yes' };
    expect(filterEvents([event], effectivePolicy(policy, {}))[0]).toEqual({ type: 'web.tab.current', domain: 'work.example.com', bucketId: 'work-profile' });
    expect(filterEvents([event], effectivePolicy(policy, { browserDetailsConsentAt: new Date() }))[0]).toMatchObject({ url: 'https://work.example.com/path?secret=yes', title: 'Private title' });
  });
  it('requires device screenshot consent and configured private storage', () => {
    const policy = { ...DEFAULT_POLICY, screenshotsEnabled: true };
    expect(effectivePolicy(policy, {}).screenshotsEnabled).toBe(false);
    expect(effectivePolicy(policy, { screenshotConsentAt: new Date() }, { screenshotsAvailable: false }).screenshotsEnabled).toBe(false);
    expect(effectivePolicy(policy, { screenshotConsentAt: new Date() }).screenshotsEnabled).toBe(true);
  });
  it('suppresses excluded apps and all collection when disabled', () => {
    expect(filterEvents([{ type: 'currentwindow', app: 'Secret.EXE' }], { ...DEFAULT_POLICY, excludedApps: ['secret.exe'] })).toEqual([]);
    expect(filterEvents([{ type: 'afkstatus', status: 'not-afk' }], { ...DEFAULT_POLICY, enabled: false })).toEqual([]);
  });
  it('bounds retention, interval, matchers and rejects URL paths', () => {
    expect(policySchema.safeParse({ ...DEFAULT_POLICY, retentionDays: 91 }).success).toBe(false);
    expect(ruleSchema.safeParse({ kind: 'domain', match: 'https://example.com/path', classification: 'productive' }).success).toBe(false);
    expect(policySchema.safeParse(DEFAULT_POLICY).success).toBe(true);
  });
});
