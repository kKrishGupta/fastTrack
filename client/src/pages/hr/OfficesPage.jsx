import { useState } from 'react';
import { Crosshair, Pencil, Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OfficeMapPicker, OfficeMapPreview } from '../../components/maps/OfficeMapPicker';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { hrService } from '../../services/hrService';

const emptyOffice = {
  name: '',
  description: '',
  address: '',
  latitude: '',
  longitude: '',
  radiusMeters: '150',
  active: true,
};

export function OfficesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState(null);
  const [form, setForm] = useState(emptyOffice);
  const queryClient = useQueryClient();
  const offices = useQuery({ queryKey: ['hr', 'offices'], queryFn: hrService.offices });

  const createOffice = useMutation({
    mutationFn: hrService.createOffice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'offices'] });
      closeDialog();
    },
  });
  const updateOffice = useMutation({
    mutationFn: hrService.updateOffice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'offices'] });
      queryClient.invalidateQueries({ queryKey: ['hr', 'employees'] });
      closeDialog();
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingOffice(null);
    setForm(emptyOffice);
    createOffice.reset();
    updateOffice.reset();
  };

  const openCreateDialog = () => {
    createOffice.reset();
    updateOffice.reset();
    setEditingOffice(null);
    setForm(emptyOffice);
    setDialogOpen(true);
  };

  const openEditDialog = (office) => {
    createOffice.reset();
    updateOffice.reset();
    setEditingOffice(office);
    setForm({
      name: office.name,
      description: office.description || '',
      address: office.address || '',
      latitude: String(office.location.coordinates[1]),
      longitude: String(office.location.coordinates[0]),
      radiusMeters: String(office.radiusMeters),
      active: office.active,
    });
    setDialogOpen(true);
  };

  const submit = (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      radiusMeters: Number(form.radiusMeters),
    };
    if (editingOffice) updateOffice.mutate({ id: editingOffice._id, ...payload });
    else createOffice.mutate(payload);
  };

  const hasLocation = form.latitude !== '' && form.longitude !== '';
  const savePending = createOffice.isPending || updateOffice.isPending;
  const saveError = createOffice.error || updateOffice.error;

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Presence rules"
        title="Office geofences"
        description="Choose real office locations on the map and define the allowed attendance boundary."
        action={<Button onClick={openCreateDialog}><Plus size={17} />Add office</Button>}
      />
      {offices.isLoading && <LoadingState rows={2} />}
      {offices.isError && <ErrorState error={offices.error} onRetry={offices.refetch} />}
      {!offices.isLoading && !offices.isError && !offices.data?.length && (
        <EmptyState
          title="No offices configured"
          description="Add an office by searching or selecting its location on the map."
          action={<Button onClick={openCreateDialog}><Plus size={16} />Add office</Button>}
        />
      )}
      <div className="office-grid">
        {offices.data?.map((office) => (
          <article className="office-card" key={office._id}>
            <div className="office-card__map">
              <OfficeMapPreview office={office} />
              <Badge className="map-preview__badge" tone="surface">{office.radiusMeters} m radius</Badge>
            </div>
            <div className="office-card__body">
              <div><h2>{office.name}</h2><p>{office.address || 'Map-selected office location'}</p></div>
              <div className="office-card__actions">
                <Badge tone={office.active ? 'success' : 'neutral'} dot>{office.active ? 'Active' : 'Inactive'}</Badge>
                <Button size="sm" variant="secondary" onClick={() => openEditDialog(office)}><Pencil size={14} />Edit</Button>
              </div>
              <div className="office-card__meta"><Crosshair size={15} /><span>{office.location.coordinates[1].toFixed(6)}, {office.location.coordinates[0].toFixed(6)}</span></div>
            </div>
          </article>
        ))}
      </div>

      {dialogOpen && (
        <Modal
          className="modal--map"
          title={editingOffice ? 'Edit office geofence' : 'Add office geofence'}
          description={editingOffice ? 'Update the location, attendance radius, details, or availability.' : 'Search for a place or select the exact entrance directly on the live map.'}
          onClose={closeDialog}
        >
          <form className="modal-form" onSubmit={submit}>
            <div className="office-form-heading">
              <label className="form-field"><span>Office name</span><input autoFocus required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Bengaluru HQ" /></label>
              <label className="form-field"><span>Allowed radius (metres)</span><input type="number" required min="25" max="5000" step="5" value={form.radiusMeters} onChange={(event) => setForm((current) => ({ ...current, radiusMeters: event.target.value }))} /></label>
            </div>
            <OfficeMapPicker
              value={form}
              onChange={(location) => setForm((current) => ({ ...current, ...location }))}
            />
            <div className="office-details-grid">
              <label className="form-field"><span>Address label</span><input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} maxLength={500} placeholder="Building, street, city" /></label>
              <label className="form-field"><span>Office status</span><select value={form.active ? 'active' : 'inactive'} onChange={(event) => setForm((current) => ({ ...current, active: event.target.value === 'active' }))}><option value="active">Active — attendance allowed</option><option value="inactive">Inactive — attendance blocked</option></select></label>
              <label className="form-field office-details-grid__wide"><span>Description</span><textarea rows={2} maxLength={500} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Optional office notes" /></label>
            </div>
            {saveError && <div className="form-alert">{saveError.message}</div>}
            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={savePending || !hasLocation}>{savePending ? 'Saving…' : editingOffice ? 'Update office' : 'Save office'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
