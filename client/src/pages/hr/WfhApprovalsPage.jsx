import { useState } from 'react';
import { Check, Home, MapPin, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';
import { wfhService } from '../../services/wfhService';
import { titleCase } from '../../utils/formatters';

export function WfhApprovalsPage() {
  const [filter, setFilter] = useState('pending');
  const [notes, setNotes] = useState({});
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ['hr', 'wfh-requests', filter], queryFn: () => wfhService.organizationRequests({ limit: 100, ...(filter && { status: filter }) }) });
  const review = useMutation({ mutationFn: wfhService.reviewRequest, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hr', 'wfh-requests'] }) });
  return <div className="page-enter"><PageHeader eyebrow="Hybrid work" title="WFH approvals" description="Approve a specific employee, date and work location before remote attendance is permitted." /><div className="approval-filters">{['pending', 'approved', 'rejected', ''].map((status) => <Button size="sm" variant={filter === status ? 'primary' : 'secondary'} onClick={() => setFilter(status)} key={status || 'all'}>{status ? titleCase(status) : 'All'}</Button>)}</div><Card className="wfh-approval-card">{requests.isLoading && <LoadingState />}{requests.isError && <ErrorState error={requests.error} onRetry={requests.refetch} />}{!requests.isLoading && !requests.data?.items?.length && <EmptyState title="No WFH requests" description={`There are no ${filter || ''} requests to review.`} />}<div className="wfh-approval-list">{requests.data?.items?.map((item) => <article className="wfh-approval" key={item._id}><span className="wfh-card-icon"><Home size={20} /></span><div className="wfh-approval__body"><div><strong>{item.employeeId?.name}</strong><Badge tone={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}>{titleCase(item.status)}</Badge></div><h3>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(new Date(`${item.requestDate}T00:00:00`))}</h3><p>{item.reason}</p><span><MapPin size={14} />{item.locationLabel || 'Captured WFH location'} · requested accuracy ±{Math.round(item.requestedAccuracyMeters)} m · allowed check-in radius {item.radiusMeters} m</span>{item.status === 'pending' && <><textarea rows={2} maxLength={500} value={notes[item._id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [item._id]: event.target.value }))} placeholder="Optional HR review note" /><div className="wfh-approval__actions"><Button variant="secondary" onClick={() => review.mutate({ id: item._id, decision: 'rejected', reviewNote: notes[item._id] })} disabled={review.isPending}><X size={15} />Reject</Button><Button onClick={() => review.mutate({ id: item._id, decision: 'approved', reviewNote: notes[item._id] })} disabled={review.isPending}><Check size={15} />Approve WFH</Button></div></>}</div></article>)}</div></Card></div>;
}
