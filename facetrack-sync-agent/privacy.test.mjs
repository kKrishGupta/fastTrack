import test from 'node:test';
import assert from 'node:assert/strict';
import { filterForPolicy, SAFE_POLICY } from './privacy.mjs';
test('titles require employee opt-in and organization permission; browser captions are always removed', () => {
  const events = [{ type: 'currentwindow', app: 'chrome.exe', title: 'personal profile' }, { type: 'currentwindow', app: 'Code.exe', title: 'work' }];
  const policy = { ...SAFE_POLICY, includeTitles: true };
  assert.ok(filterForPolicy(events, policy, false).every((event) => !event.title));
  const result = filterForPolicy(events, policy, true);
  assert.equal(result[0].title, undefined); assert.equal(result[1].title, 'work');
});
test('only approved work browser buckets pass and exclusions match domain boundaries', () => {
  const event = { type: 'web.tab.current', bucketId: 'work', domain: 'docs.example.com', url: 'https://docs.example.com/work/item?token=secret#section', title: 'Work item' };
  const policy = { ...SAFE_POLICY, browserEnabled: true, approvedBrowserBuckets: ['work'] };
  const domainOnly = filterForPolicy([event, { ...event, bucketId: 'personal' }], policy);
  assert.equal(domainOnly.length, 1); assert.equal(domainOnly[0].url, undefined); assert.equal(domainOnly[0].title, undefined);
  assert.equal(filterForPolicy([event], { ...policy, browserUrlMode: 'origin' })[0].url, 'https://docs.example.com');
  assert.equal(filterForPolicy([event], { ...policy, browserUrlMode: 'path' })[0].url, 'https://docs.example.com/work/item');
  const full = filterForPolicy([event], { ...policy, browserUrlMode: 'full', browserTitleEnabled: true })[0];
  assert.equal(full.url, 'https://docs.example.com/work/item?token=secret'); assert.equal(full.title, 'Work item');
  assert.equal(filterForPolicy([event], { ...policy, excludedDomains: ['example.com'] }).length, 0);
  assert.equal(filterForPolicy([{ ...event, domain: 'notexample.com' }], { ...policy, excludedDomains: ['example.com'] }).length, 1);
});
