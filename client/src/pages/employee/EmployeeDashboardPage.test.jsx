/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmployeeDashboardPage } from './EmployeeDashboardPage';

const mocks = vi.hoisted(() => ({
  checkOut: { isPending: false, mutate: vi.fn() },
  checkIn: { isPending: false, mutate: vi.fn() },
  today: vi.fn(),
  history: vi.fn(),
  offices: vi.fn(),
  policy: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'employee-1', name: 'Test Employee', enrollmentStatus: 'complete' }, setUser: vi.fn() }),
}));
vi.mock('../../hooks/useAttendanceFlow', () => ({
  useAttendanceFlow: () => ({ checkIn: mocks.checkIn, checkOut: mocks.checkOut, progress: '', error: '' }),
}));
vi.mock('../../services/attendanceService', () => ({
  attendanceService: {
    today: mocks.today,
    history: mocks.history,
    assignedOffices: mocks.offices,
    policy: mocks.policy,
  },
}));
vi.mock('../../services/enrollmentService', () => ({ enrollmentService: { requestReplacement: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('employee checkout', () => {
  it('shows checkout for an active session carried over from the previous date', async () => {
    const active = {
      _id: 'attendance-1', attendanceDate: '2026-11-22', sessionStatus: 'working',
      checkInAt: '2026-11-22T18:29:00.000Z', workMode: 'OFFICE', officeId: { name: 'Flat' },
    };
    mocks.today.mockResolvedValue(active);
    mocks.history.mockResolvedValue({ items: [active] });
    mocks.offices.mockResolvedValue([{ _id: 'office-1', name: 'Flat' }]);
    mocks.policy.mockResolvedValue({
      today: { date: '2026-11-23', currentTime: '02:30', canCheckIn: false, message: 'Check-in opens later' },
      policy: { checkInWindowStart: '09:00', checkInWindowEnd: '09:30', expectedCheckOutTime: '18:00', overtimeEnabled: true, overtimeAfterMinutes: 480 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><MemoryRouter><EmployeeDashboardPage /></MemoryRouter></QueryClientProvider>);

    const button = await screen.findByRole('button', { name: 'Check out' }, { timeout: 5000 });
    expect(screen.getAllByText('Working').length).toBeGreaterThan(0);
    await userEvent.click(button);
    expect(mocks.checkOut.mutate).toHaveBeenCalledOnce();
  });
});
