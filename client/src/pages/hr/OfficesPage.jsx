import { useState } from 'react';
import { Crosshair, Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OfficeMapPicker, OfficeMapPreview } from '../../components/maps/OfficeMapPicker';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { hrService } from '../../services/hrService';

const emptyOffice = { name: '', address: '', latitude: '', longitude: '', radiusMeters: '150' };

export function OfficesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyOffice);
  const queryClient = useQueryClient();
  const offices = useQuery({ queryKey: ['hr', 'offices'], queryFn: hrService.offices });
  const createOffice = useMutation({
    mutationFn: hrService.createOffice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'offices'] });
      setDialogOpen(false);
      setForm(emptyOffice);
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setForm(emptyOffice);
    createOffice.reset();
  };

  const submit = (event) => {
    event.preventDefault();
    createOffice.mutate({
      ...form,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      radiusMeters: Number(form.radiusMeters),
    });
  };

  const hasLocation = form.latitude !== '' && form.longitude !== '';

  return (
    <div className="page-enter">
      <PageHeader eyebrow="Presence rules" title="Office geofences" description="Choose real office locations on the map and define the allowed attendance boundary." action={<Button onClick={() => setDialogOpen(true)}><Plus size={17} />Add office</Button>} />
      {offices.isLoading && <LoadingState rows={2} />}
      {offices.isError && <ErrorState error={offices.error} onRetry={offices.refetch} />}
      {!offices.isLoading && !offices.isError && !offices.data?.length && <EmptyState title="No offices configured" description="Add an office by searching or selecting its location on the map." action={<Button onClick={() => setDialogOpen(true)}><Plus size={16} />Add office</Button>} />}
      <div className="office-grid">
        {offices.data?.map((office) => (
          <article className="office-card" key={office._id}>
            <div className="office-card__map">
              <OfficeMapPreview office={office} />
              <Badge className="map-preview__badge" tone="surface">{office.radiusMeters} m radius</Badge>
            </div>
            <div className="office-card__body">
              <div><h2>{office.name}</h2><p>{office.address || 'Map-selected office location'}</p></div>
              <Badge tone={office.active ? 'success' : 'neutral'} dot>{office.active ? 'Active' : 'Inactive'}</Badge>
              <div className="office-card__meta"><Crosshair size={15} /><span>{office.location.coordinates[1].toFixed(6)}, {office.location.coordinates[0].toFixed(6)}</span></div>
            </div>
          </article>
        ))}
      </div>

      {dialogOpen && (
        <Modal className="modal--map" title="Add office geofence" description="Search for a place or select the exact entrance directly on the live map." onClose={closeDialog}>
          <form className="modal-form" onSubmit={submit}>
            <div className="office-form-heading">
              <label className="form-field"><span>Office name</span><input autoFocus required minLength={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Bengaluru HQ" /></label>
              <label className="form-field"><span>Allowed radius</span><select value={form.radiusMeters} onChange={(event) => setForm((current) => ({ ...current, radiusMeters: event.target.value }))}>{[25, 50, 100, 150, 200, 300, 500, 1000].map((radius) => <option key={radius} value={radius}>{radius} metres</option>)}</select></label>
            </div>
            <OfficeMapPicker
              value={form}
              onChange={(location) => setForm((current) => ({ ...current, ...location }))}
            />
            {createOffice.isError && <div className="form-alert">{createOffice.error.message}</div>}
            <div className="modal-actions"><Button type="button" variant="secondary" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={createOffice.isPending || !hasLocation}>{createOffice.isPending ? 'Saving…' : 'Save office'}</Button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
