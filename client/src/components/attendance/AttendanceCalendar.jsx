import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, MapPin } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { formatDateTime, formatDuration, formatTime } from '../../utils/formatters';

const dateKey = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const minutesFor = (record, now) => record.sessionStatus === 'working'
  ? Math.max(0, Math.floor((now - new Date(record.checkInAt).getTime()) / 60_000))
  : record.workedMinutes;

export function AttendanceCalendar({ records = [], now = Date.now() }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(() => dateKey(new Date()));
  const byDate = useMemo(() => new Map(records.map((record) => [record.attendanceDate || dateKey(record.checkInAt), record])), [records]);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const cells = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const selected = byDate.get(selectedKey);

  const changeMonth = (amount) => {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1);
    setMonth(next);
    setSelectedKey(dateKey(next));
  };

  return (
    <div className="attendance-calendar">
      <div className="attendance-calendar__toolbar"><button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={17} /></button><strong>{new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(month)}</strong><button type="button" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={17} /></button></div>
      <div className="attendance-calendar__weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="attendance-calendar__grid">{cells.map((day, index) => {
        if (!day) return <span className="calendar-day calendar-day--empty" key={`empty-${index}`} />;
        const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const record = byDate.get(key);
        return <button type="button" className={`calendar-day ${record ? 'calendar-day--worked' : ''} ${selectedKey === key ? 'calendar-day--selected' : ''}`} onClick={() => setSelectedKey(key)} key={key}><span>{day}</span>{record && <i className={record.sessionStatus === 'working' ? 'is-working' : ''} />}</button>;
      })}</div>
      <div className="calendar-detail">
        {selected ? <><div><Badge tone={selected.sessionStatus === 'working' ? 'success' : 'neutral'} dot>{selected.workMode === 'WFH' ? 'WFH' : selected.sessionStatus === 'working' ? 'Working now' : 'Completed'}</Badge><strong>{formatDateTime(selected.checkInAt)}</strong></div><div className="calendar-detail__facts"><span><Clock3 size={15} />{formatTime(selected.checkInAt)} → {formatTime(selected.checkOutAt)} · {formatDuration(minutesFor(selected, now))}</span><span><MapPin size={15} />{selected.workMode === 'WFH' ? 'Approved WFH location' : selected.officeId?.name || 'Office'}{Number.isFinite(selected.locationVerification?.distanceMeters) ? ` · ${Math.round(selected.locationVerification.distanceMeters)} m from center` : ''}{Number.isFinite(selected.locationVerification?.accuracyMeters) ? ` · ±${Math.round(selected.locationVerification.accuracyMeters)} m GPS` : ''}</span></div></> : <p>Select a marked day to view its check-in, check-out, working time and location verification.</p>}
      </div>
    </div>
  );
}

export { dateKey, minutesFor };
