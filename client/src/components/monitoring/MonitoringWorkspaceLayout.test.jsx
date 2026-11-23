// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MonitoringWorkspaceLayout } from './MonitoringWorkspaceLayout';

describe('MonitoringWorkspaceLayout', () => {
  it('renders the nested monitoring navigation and selected child route', () => {
    render(
      <MemoryRouter initialEntries={['/hr/monitoring/analytics']}>
        <Routes>
          <Route path="/hr/monitoring" element={<MonitoringWorkspaceLayout />}>
            <Route path="analytics" element={<h1>Analytics content</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: 'Activity monitoring sections' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('/hr/monitoring');
    expect(screen.getByRole('link', { name: 'Analytics' }).classList.contains('monitoring-subnav__link--active')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Analytics content' })).toBeTruthy();
  });
});
