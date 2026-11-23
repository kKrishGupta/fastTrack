import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorState, LoadingState } from '../ui/DataState';

const fields = ['version','enabled','includeTitles','browserEnabled','browserUrlMode','browserTitleEnabled','approvedBrowserBuckets','excludedApps','excludedDomains','requireAttendance','retentionDays','screenshotsEnabled','screenshotIntervalSeconds','screenshotRetentionDays','screenshotDisplayMode','screenshotExcludedApps'];
const lines = (value) => value.split('\n').map((line) => line.trim()).filter(Boolean);

export function MonitoringPolicyEditor({ userId, screenshotsAvailable, screenshotStorage }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(null);
  const [rule, setRule] = useState({ kind: 'app', match: '', classification: 'neutral' });
  const policy = useQuery({ queryKey: ['monitoring', 'policy', userId], queryFn: async () => (await api.get('/monitoring/policy')).data.item });
  const rules = useQuery({ queryKey: ['monitoring', 'rules', userId], queryFn: async () => (await api.get('/monitoring/rules')).data.items });
  const refresh = () => client.invalidateQueries({ queryKey: ['monitoring'] });
  const save = useMutation({ mutationFn: async (candidate) => (await api.put('/monitoring/policy', Object.fromEntries(fields.map((field) => [field, candidate[field]])))).data.item,
    onSuccess: (item) => { client.setQueryData(['monitoring', 'policy', userId], item); setDraft(null); refresh(); } });
  const add = useMutation({ mutationFn: async () => api.post('/monitoring/rules', rule), onSuccess: () => { setRule((current) => ({ ...current, match: '' })); refresh(); } });
  const remove = useMutation({ mutationFn: async (id) => api.delete(`/monitoring/rules/${id}`), onSuccess: refresh });
  const value = draft || policy.data;
  const edit = (field, next) => { save.reset(); setDraft((current) => ({ ...(current || policy.data), [field]: next })); };
  useEffect(() => {
    if (!draft) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);

  return <Card className="monitoring-policy-card">
    <div className="monitoring-policy-header"><div><h2>Organization monitoring policy</h2>{value && <p>Revision {value.version} · Activity retained {value.retentionDays} days · Screenshots {screenshotsAvailable ? (value.screenshotsEnabled ? `every ${value.screenshotIntervalSeconds} seconds` : 'disabled') : 'unavailable'}</p>}</div>{draft && <span className="monitoring-unsaved" role="status">Unsaved changes</span>}</div>
    {policy.isLoading && <LoadingState rows={3} />}{policy.isError && <ErrorState error={policy.error} onRetry={policy.refetch} />}
    {value && <form className="monitoring-policy-form" onSubmit={(event) => { event.preventDefault(); save.mutate(value); }}>
      <details className="monitoring-policy-section" open><summary><span>Activity collection</span><small>Applications, titles, browser buckets and attendance restrictions</small></summary><div className="monitoring-policy-section__body">
        {[['enabled','Allow activity sharing'],['includeTitles','Allow optional non-browser window titles'],['browserEnabled','Allow separately authorized work browser buckets'],['browserTitleEnabled','Allow page titles for separately consenting devices'],['requireAttendance','Accept only checked-in attendance sessions']].map(([field,label]) => <label className="monitoring-checkbox" key={field}><input type="checkbox" checked={value[field]} onChange={(event) => edit(field,event.target.checked)} />{label}</label>)}
        <div className="monitoring-policy-grid"><label>Browser URL detail<select value={value.browserUrlMode} onChange={(event) => edit('browserUrlMode',event.target.value)}><option value="domain">Domain only</option><option value="origin">Scheme and domain</option><option value="path">URL path, no query or fragment</option><option value="full">Full URL including query</option></select></label><label>Approved work browser bucket IDs<textarea rows="4" value={value.approvedBrowserBuckets.join('\n')} onChange={(event) => edit('approvedBrowserBuckets', lines(event.target.value))} placeholder="One verified bucket ID per line" /></label></div>
        <p className="monitoring-muted">A bucket ID does not prove which browser profile produced it. Verify a work-only source before approval.</p>
      </div></details>

      <details className="monitoring-policy-section" open><summary><span>Screenshot policy</span><small>Consent requirement, interval, displays and exclusions</small></summary><div className="monitoring-policy-section__body">
        {!screenshotsAvailable && <div className="form-alert" role="alert"><strong>Screenshot storage is unavailable.</strong> {screenshotStorage?.message || 'Configure the private Cloudinary environment on the connected API, then restart or redeploy it.'}</div>}
        <label className="monitoring-checkbox"><input type="checkbox" disabled={!screenshotsAvailable && !value.screenshotsEnabled} checked={value.screenshotsEnabled} onChange={(event) => edit('screenshotsEnabled',event.target.checked)} />Enable screenshots only for separately consenting devices</label>
        <div className="monitoring-policy-grid monitoring-policy-grid--three"><label>Interval (seconds)<input type="number" min="60" max="3600" disabled={!screenshotsAvailable} value={value.screenshotIntervalSeconds} onChange={(event) => edit('screenshotIntervalSeconds',Number(event.target.value))} /></label><label>Retention days<input type="number" min="1" max="30" disabled={!screenshotsAvailable} value={value.screenshotRetentionDays} onChange={(event) => edit('screenshotRetentionDays',Number(event.target.value))} /></label><label>Displays<select disabled={!screenshotsAvailable} value={value.screenshotDisplayMode} onChange={(event) => edit('screenshotDisplayMode',event.target.value)}><option value="primary">Primary display only</option><option value="all">All displays</option></select></label></div>
        <label>Screenshot excluded application EXE names<textarea rows="4" disabled={!screenshotsAvailable} value={value.screenshotExcludedApps.join('\n')} onChange={(event) => edit('screenshotExcludedApps',lines(event.target.value))} placeholder="One executable name per line" /></label>
      </div></details>

      <details className="monitoring-policy-section"><summary><span>Privacy and exclusions</span><small>Sensitive applications and website domains that must not be uploaded</small></summary><div className="monitoring-policy-section__body monitoring-policy-grid"><label>Excluded application EXE names<textarea rows="5" value={value.excludedApps.join('\n')} onChange={(event) => edit('excludedApps',lines(event.target.value))} /></label><label>Excluded website domains<textarea rows="5" value={value.excludedDomains.join('\n')} onChange={(event) => edit('excludedDomains',lines(event.target.value))} /></label></div></details>

      <details className="monitoring-policy-section"><summary><span>Data retention</span><small>Expiry applied to new observations and captures</small></summary><div className="monitoring-policy-section__body"><div className="monitoring-policy-grid"><label>Activity retention days<input type="number" min="1" max="90" value={value.retentionDays} onChange={(event) => edit('retentionDays',Number(event.target.value))} /></label><label>Screenshot retention days<input type="number" min="1" max="30" disabled={!screenshotsAvailable} value={value.screenshotRetentionDays} onChange={(event) => edit('screenshotRetentionDays',Number(event.target.value))} /></label></div><p className="monitoring-muted">Changes apply to new uploads. Existing records keep their original expiry time.</p></div></details>

      <div className="monitoring-policy-actions"><div>{save.isError && <div role="alert" className="form-alert">{save.error.message}</div>}{save.isSuccess && <p className="form-success" role="status">Policy saved.</p>}</div><Button type="button" variant="secondary" disabled={!draft || save.isPending} onClick={() => { setDraft(null); save.reset(); }}>Discard changes</Button><Button type="submit" disabled={save.isPending || !draft}>{save.isPending ? 'Saving…' : 'Save policy'}</Button></div>
    </form>}

    <details className="monitoring-policy-section monitoring-rules-section" open><summary><span>Productivity classification rules</span><small>Unmatched activity remains neutral; rules do not determine attendance or payroll</small></summary><div className="monitoring-policy-section__body">
      {rules.isLoading && <LoadingState rows={2} />}{rules.isError && <ErrorState error={rules.error} onRetry={rules.refetch} />}
      <div className="monitoring-rule-list">{rules.data?.map((item) => <div key={item._id}><span><strong>{item.match}</strong><small>{item.kind} · {item.classification}</small></span><Button size="sm" variant="secondary" disabled={remove.isPending} onClick={() => remove.mutate(item._id)}>Remove</Button></div>)}</div>{!rules.isLoading && !rules.data?.length && <p className="monitoring-empty-copy">No classification rules. Unmatched activity is neutral.</p>}{remove.isError && <div role="alert" className="form-alert">{remove.error.message}</div>}
      <form className="monitoring-rule-form" onSubmit={(event) => { event.preventDefault(); add.mutate(); }}><label>Rule type<select value={rule.kind} onChange={(event) => setRule({ ...rule, kind:event.target.value })}><option value="app">Application EXE</option><option value="domain">Website domain</option></select></label><label>Exact EXE or domain<input required maxLength={300} value={rule.match} onChange={(event) => setRule({ ...rule, match:event.target.value })} /></label><label>Classification<select value={rule.classification} onChange={(event) => setRule({ ...rule, classification:event.target.value })}>{['neutral','productive','unproductive'].map((item) => <option key={item}>{item}</option>)}</select></label><Button type="submit" disabled={add.isPending}>Save rule</Button>{add.isError && <div role="alert" className="form-alert">{add.error.message}</div>}</form>
    </div></details>
  </Card>;
}
