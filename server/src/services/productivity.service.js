import { domainMatches } from './monitoring-policy.service.js';

const browsers = new Set(['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe']);
const key = (value) => String(value);
const classification = (app, domain, rules) => {
  const domains = domain ? rules.filter((rule) => rule.kind === 'domain' && domainMatches(domain, rule.match))
    .sort((a, b) => b.match.length - a.match.length) : [];
  return domains[0]?.classification || rules.find((rule) => rule.kind === 'app' && rule.match === app.toLowerCase())?.classification || 'neutral';
};

// Sweep disjoint intervals per employee. Concurrent devices never add extra employee time.
export function summarizeActivity(events, { start, end, rules = [], attendance = [], requireAttendance = false, timezone = 'UTC' }) {
  const from = +new Date(start), to = +new Date(end);
  const totals = { active: 0, idle: 0, unknown: 0, productive: 0, unproductive: 0, neutral: 0 };
  const apps = new Map(), sites = new Map(), days = new Map(), employees = new Map();
  const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayKey = (timestamp) => dayFormat.format(timestamp);
  for (const event of events) {
    const a = Math.max(from, +new Date(event.timestamp)), b = Math.min(to, +new Date(event.timestamp) + event.duration * 1000);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    const employee = key(event.employeeId);
    if (!employees.has(employee)) employees.set(employee, []);
    employees.get(employee).push({ ...event, a, b, device: key(event.deviceId) });
  }
  function addDays(a, b, metric) {
    while (a < b) {
      let until = b;
      if (dayKey(a) !== dayKey(b - 1)) {
        let lo = a + 1, hi = b;
        while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (dayKey(mid) === dayKey(a)) lo = mid + 1; else hi = mid; }
        until = lo;
      }
      const day = dayKey(a);
      if (!days.has(day)) days.set(day, { date: day, active: 0, idle: 0, unknown: 0, productive: 0, unproductive: 0, neutral: 0 });
      days.get(day)[metric] += (until - a) / 1000;
      a = until;
    }
  }
  for (const [employee, observations] of employees) {
    const boundaries = new Map();
    const edge = (at, action) => { if (!boundaries.has(at)) boundaries.set(at, []); boundaries.get(at).push(action); };
    observations.forEach((event, i) => { edge(event.a, { i, add: true }); edge(event.b, { i, add: false }); });
    const sessions = attendance.filter((session) => key(session.employeeId) === employee);
    if (requireAttendance) for (const session of sessions) {
      edge(Math.max(from, +new Date(session.checkInAt)), null);
      edge(Math.min(to, session.checkOutAt ? +new Date(session.checkOutAt) : to), null);
    }
    const points = [...boundaries.keys()].filter((point) => point >= from && point <= to).sort((a, b) => a - b);
    const current = new Map();
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], seconds = (b - a) / 1000;
      for (const action of boundaries.get(a)) if (action) { if (action.add) current.set(action.i, observations[action.i]); else current.delete(action.i); }
      const values = [...current.values()];
      if (!values.length || seconds <= 0) continue;
      if (requireAttendance && !sessions.some((session) => +new Date(session.checkInAt) <= a && (session.checkOutAt ? +new Date(session.checkOutAt) : to) >= b)) continue;
      const activeDevices = new Set(values.filter((event) => event.type === 'afkstatus' && event.status === 'not-afk').map((event) => event.device));
      const activeApps = values.filter((event) => event.type === 'currentwindow' && activeDevices.has(event.device));
      const distinct = [...new Set(activeApps.map((event) => event.app))];
      if (!activeDevices.size) {
        const metric = values.some((event) => event.type === 'afkstatus' && event.status === 'afk') ? 'idle' : 'unknown';
        totals[metric] += seconds; addDays(a, b, metric); continue;
      }
      totals.active += seconds; addDays(a, b, 'active');
      if (distinct.length !== 1) { totals.unknown += seconds; addDays(a, b, 'unknown'); continue; }
      const app = distinct[0];
      apps.set(app, (apps.get(app) || 0) + seconds);
      const browserDevices = new Set(activeApps.filter((event) => browsers.has(event.app.toLowerCase())).map((event) => event.device));
      const domains = [...new Set(values.filter((event) => event.type === 'web.tab.current' && browserDevices.has(event.device)).map((event) => event.domain))];
      const domain = domains.length === 1 ? domains[0] : null;
      if (domain) sites.set(domain, (sites.get(domain) || 0) + seconds);
      const metric = classification(app, domain, rules);
      totals[metric] += seconds; addDays(a, b, metric);
    }
  }
  const rankings = (map) => [...map].map(([_id, seconds]) => ({ _id, seconds })).sort((a, b) => b.seconds - a.seconds);
  return { totals, applications: rankings(apps), websites: rankings(sites), days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), timezone,
    semantics: 'Union per employee; non-AFK intersection; overlapping conflicting apps are unknown. Unknown may be part of active time. Current rules apply; monitoring does not change attendance.' };
}
