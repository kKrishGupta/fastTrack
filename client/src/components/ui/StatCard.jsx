import { ArrowUpRight } from 'lucide-react';
import { Card } from './Card';

export function StatCard({ icon: Icon, label, value, detail, tone = 'green' }) {
  return (
    <Card className="stat-card">
      <div className={`stat-card__icon stat-card__icon--${tone}`}><Icon size={20} /></div>
      <div className="stat-card__trend"><ArrowUpRight size={14} /> Live</div>
      <strong>{value}</strong>
      <h3>{label}</h3>
      <p>{detail}</p>
    </Card>
  );
}
