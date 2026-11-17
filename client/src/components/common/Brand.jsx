import { Fingerprint } from 'lucide-react';

export function Brand({ inverse = false, compact = false }) {
  return (
    <div className={`brand ${inverse ? 'brand--inverse' : ''}`}>
      <span className="brand__mark"><Fingerprint size={22} strokeWidth={2.2} /></span>
      {!compact && <span className="brand__name">FaceTrack <strong>Pro</strong></span>}
    </div>
  );
}
