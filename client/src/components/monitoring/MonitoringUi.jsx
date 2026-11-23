import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { MONITORING_PERIODS, durationLabel } from './monitoring-data';

export function MonitoringFilters({ employees = [], employeeId, onEmployeeChange, hours, onHoursChange, onRefresh, refreshing, lastUpdated }) {
  return <div className="monitoring-page-filters">
    <label>Employee<select aria-label="Employee filter" value={employeeId} onChange={(event) => onEmployeeChange(event.target.value)}><option value="">All employees</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}</select></label>
    <label>Date range<select aria-label="Date range" value={hours} onChange={(event) => onHoursChange(Number(event.target.value))}>{MONITORING_PERIODS.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}</select></label>
    <Button variant="secondary" onClick={onRefresh} disabled={refreshing} aria-label="Refresh monitoring data"><RefreshCw size={16} />Refresh</Button>
    <span className="monitoring-last-updated">Updated {lastUpdated ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</span>
  </div>;
}

export function MonitoringKpi({ icon: Icon, label, value, detail, tone = 'green' }) {
  return <article className={`monitoring-kpi monitoring-kpi--${tone}`}><span className="monitoring-kpi__icon"><Icon size={19} /></span><div><small>{label}</small><strong>{value}</strong>{detail && <p>{detail}</p>}</div></article>;
}

export function UsageBars({ items = [], limit = items.length, empty = 'No recorded usage in this period.' }) {
  const visible = items.slice(0, limit);
  const max = Math.max(1, ...visible.map((item) => Number(item.seconds) || 0));
  if (!visible.length) return <p className="monitoring-empty-copy">{empty}</p>;
  return <div className="monitoring-usage-list">{visible.map((item) => <div key={item._id || item.label}><div><strong>{item._id || item.label || 'Unknown'}</strong><span>{durationLabel(item.seconds)}</span></div><div className="monitoring-usage-bar"><span style={{ width: `${Math.max(2, (Number(item.seconds) || 0) / max * 100)}%` }} /></div></div>)}</div>;
}
