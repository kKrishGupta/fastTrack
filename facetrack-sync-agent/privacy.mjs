export const SAFE_POLICY = Object.freeze({ enabled: true, includeTitles: false, browserEnabled: false,
  browserUrlMode: 'domain', browserTitleEnabled: false,
  approvedBrowserBuckets: [], excludedApps: [], excludedDomains: [], retentionDays: 30 });
function redactBrowser(event, policy) {
  const { url, title, ...rest } = event;
  let sharedUrl;
  if (policy.browserUrlMode !== 'domain' && url) try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return rest;
    parsed.hash = '';
    if (policy.browserUrlMode === 'origin') sharedUrl = parsed.origin;
    else if (policy.browserUrlMode === 'path') { parsed.search = ''; sharedUrl = `${parsed.origin}${parsed.pathname}`; }
    else if (policy.browserUrlMode === 'full') sharedUrl = parsed.href;
  } catch { /* Domain-only data remains valid. */ }
  return { ...rest, ...(sharedUrl && { url: sharedUrl.slice(0, 2048) }), ...(policy.browserTitleEnabled && title && { title }) };
}
export function filterForPolicy(events, policy = SAFE_POLICY, includeTitles = false) {
  if (!policy.enabled) return [];
  return events.flatMap((event) => {
    if (event.type === 'currentwindow' && (policy.excludedApps || []).some((app) => app.toLowerCase() === event.app?.toLowerCase())) return [];
    if (event.type === 'web.tab.current') {
      if (!policy.browserEnabled || !(policy.approvedBrowserBuckets || []).includes(event.bucketId)
        || (policy.excludedDomains || []).some((domain) => event.domain === domain || event.domain.endsWith(`.${domain}`))) return [];
      return [redactBrowser(event, policy)];
    }
    const { title, ...rest } = event;
    // Window watcher cannot distinguish personal/private browser profiles: never upload browser captions.
    const browser = /^(chrome|msedge|firefox|brave|opera|vivaldi)\.exe$/i.test(event.app || '');
    return [{ ...rest, ...(policy.includeTitles && includeTitles && !browser && title && { title }) }];
  });
}
