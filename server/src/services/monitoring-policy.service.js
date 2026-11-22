import { MonitoringPolicy } from '../models/MonitoringPolicy.js';
import { ProductivityRule } from '../models/ProductivityRule.js';
import { ApiError } from '../utils/api-error.js';
import { filterForPolicy } from '../../../facetrack-sync-agent/privacy.mjs';

export const DEFAULT_POLICY = Object.freeze({
  version: 1, enabled: true, includeTitles: false, browserEnabled: false,
  browserUrlMode: 'domain', browserTitleEnabled: false,
  approvedBrowserBuckets: [], excludedApps: [], excludedDomains: [], requireAttendance: false,
  retentionDays: 30, screenshotsEnabled: false, screenshotIntervalSeconds: 300, screenshotRetentionDays: 7,
  screenshotDisplayMode: 'primary', screenshotExcludedApps: [],
});
export async function getPolicy(organizationId) {
  const stored = await MonitoringPolicy.findOne({ organizationId }).lean();
  return { ...DEFAULT_POLICY, ...stored, organizationId };
}
export async function updatePolicy(organizationId, data) {
  const { version, ...settings } = data;
  let item;
  try {
    item = await MonitoringPolicy.findOneAndUpdate({ organizationId, version }, {
      $set: settings, $inc: { version: 1 }, $setOnInsert: { organizationId },
    }, { new: true, upsert: version === 1, runValidators: true, setDefaultsOnInsert: false });
  } catch (error) { if (error.code !== 11000) throw error; }
  if (!item) throw new ApiError(409, 'POLICY_CONFLICT', 'Policy changed. Reload before saving.');
  return item;
}
export async function listRules(organizationId) {
  return ProductivityRule.find({ organizationId }).sort({ kind: 1, match: 1 }).limit(500).lean();
}
export async function saveRule(organizationId, data) {
  return ProductivityRule.findOneAndUpdate({ organizationId, kind: data.kind, match: data.match.toLowerCase() },
    { $set: { classification: data.classification } }, { upsert: true, new: true, runValidators: true });
}
export async function deleteRule(organizationId, id) {
  const result = await ProductivityRule.deleteOne({ organizationId, _id: id });
  if (!result.deletedCount) throw new ApiError(404, 'RULE_NOT_FOUND', 'Rule not found');
}
export function domainMatches(domain, pattern) {
  return domain === pattern || domain.endsWith(`.${pattern}`);
}
export function filterEvents(events, policy) {
  return filterForPolicy(events, policy, true);
}
export function effectivePolicy(policy, device, { screenshotsAvailable = true } = {}) {
  const value = device.browserDetailsConsentAt ? policy : { ...policy, browserUrlMode: 'domain', browserTitleEnabled: false };
  return device.screenshotConsentAt && screenshotsAvailable ? value : { ...value, screenshotsEnabled: false };
}
