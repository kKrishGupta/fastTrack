import { beforeEach, describe, expect, it, vi } from 'vitest';

const models = vi.hoisted(() => ({
  Office: {
    findOneAndUpdate: vi.fn(),
  },
  OfficeAssignment: {},
  User: {},
}));

vi.mock('../src/models.js', () => models);

import { updateOffice } from '../src/services/office.service.js';

describe('office geofence updates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the office only inside the HR organization and stores GeoJSON longitude first', async () => {
    const updated = { id: 'office-1', radiusMeters: 350 };
    models.Office.findOneAndUpdate.mockResolvedValue(updated);

    await expect(updateOffice(
      { organizationId: 'org-1' },
      'office-1',
      { name: 'New HQ', latitude: 28.61, longitude: 77.21, radiusMeters: 350, active: true },
    )).resolves.toBe(updated);

    expect(models.Office.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'office-1', organizationId: 'org-1' },
      { $set: {
        name: 'New HQ',
        radiusMeters: 350,
        active: true,
        location: { type: 'Point', coordinates: [77.21, 28.61] },
      } },
      { new: true, runValidators: true },
    );
  });

  it('does not allow updating an office from another organization', async () => {
    models.Office.findOneAndUpdate.mockResolvedValue(null);

    await expect(updateOffice(
      { organizationId: 'org-1' },
      'office-from-org-2',
      { radiusMeters: 500 },
    )).rejects.toMatchObject({ code: 'OFFICE_NOT_FOUND', status: 404 });
  });
});
