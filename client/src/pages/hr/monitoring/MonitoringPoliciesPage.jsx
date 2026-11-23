import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../../../components/ui/DataState';
import { MonitoringPolicyEditor } from '../../../components/monitoring/MonitoringPolicyEditor';

export function MonitoringPoliciesPage() {
  const { user } = useAuth();
  const info = useQuery({ queryKey: ['monitoring', 'info'], queryFn: async () => (await api.get('/monitoring/info')).data, retry: false, refetchInterval: 60_000 });
  return <div className="page-enter monitoring-policies-page">
    <PageHeader eyebrow="Organization configuration" title="Monitoring Policies" description="Control authorized collection, privacy exclusions, retention and productivity classification rules." />
    {info.isLoading && <LoadingState rows={3} />}
    {info.isError && <ErrorState error={info.error} onRetry={info.refetch} />}
    {info.data && <MonitoringPolicyEditor userId={user?.id} screenshotsAvailable={Boolean(info.data.capabilities?.screenshots)} screenshotStorage={info.data.screenshotStorage} />}
  </div>;
}
