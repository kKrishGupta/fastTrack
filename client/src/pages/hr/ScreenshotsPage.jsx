import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Camera, ChevronLeft, ChevronRight, Monitor, RefreshCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../../components/ui/DataState';
import '../../styles/screenshots.css';

const formatDateTime = (date) => {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (date) => {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const screenshotStorageLabel = (screenshot) => screenshot.format === 'jpg'
  ? `${formatFileSize(screenshot.byteLength)} compressed (30 KB max)`
  : formatFileSize(screenshot.byteLength);

const groupByDate = (items) => {
  const groups = {};
  items.forEach(item => {
    const date = formatDateTime(item.capturedAt);
    if (!groups[date]) groups[date] = [];
    groups[date].push(item);
  });
  return Object.entries(groups).sort((a, b) => new Date(b[1][0].capturedAt) - new Date(a[1][0].capturedAt));
};

function ScreenshotViewer({ screenshot, onClose, onNext, onPrev, hasNext, hasPrev }) {
  const [zoom, setZoom] = useState('fit');

  return (
    <div className="screenshot-viewer-overlay" onClick={onClose}>
      <div className="screenshot-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="screenshot-viewer-header">
          <div className="screenshot-viewer-info">
            <strong>{screenshot.item.employeeId?.name || 'Employee'}</strong>
            <span>{formatDateTime(screenshot.item.capturedAt)} at {formatTime(screenshot.item.capturedAt)}</span>
          </div>
          <div className="screenshot-viewer-controls">
            <Button variant="ghost" size="sm" onClick={() => setZoom(zoom === 'fit' ? 'full' : 'fit')}>
              {zoom === 'fit' ? <ZoomIn size={16} /> : <ZoomOut size={16} />}
              {zoom === 'fit' ? 'Zoom' : 'Fit'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onPrev} disabled={!hasPrev}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onNext} disabled={!hasNext}>
              <ChevronRight size={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>

        {screenshot.viewUrl ? (
          <div className={`screenshot-viewer-image-container ${zoom === 'full' ? 'screenshot-viewer-image--zoomed' : ''}`}>
            <img
              src={screenshot.viewUrl}
              alt={`Screenshot from ${screenshot.item.employeeId?.name || 'employee'}`}
              className="screenshot-viewer-image"
            />
          </div>
        ) : (
          <div className="screenshot-viewer-loading">Loading full image...</div>
        )}

        <div className="screenshot-viewer-meta">
          <span>{screenshot.item.width} × {screenshot.item.height}</span>
          <span>{screenshotStorageLabel(screenshot.item)}</span>
          <span>Expires {formatDateTime(screenshot.item.expiresAt)}</span>
        </div>
      </div>
    </div>
  );
}

export function ScreenshotsPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    employeeId: '',
    deviceId: '',
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  });
  const [page, setPage] = useState(1);
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  const [thumbnailCache, setThumbnailCache] = useState({});

  const employees = useQuery({
    queryKey: ['monitoring', 'employees', user?.id],
    queryFn: async () => (await api.get('/monitoring/employees')).data,
  });

  const devices = useQuery({
    queryKey: ['monitoring', 'devices', user?.id],
    queryFn: async () => (await api.get('/monitoring/devices')).data,
  });

  const screenshots = useQuery({
    queryKey: ['screenshots', user?.id, filters, page],
    queryFn: async () => {
      const params = {
        start: new Date(`${filters.startDate}T00:00:00`).toISOString(),
        end: new Date(`${filters.endDate}T23:59:59.999`).toISOString(),
        page,
        limit: 24,
      };
      if (filters.employeeId) params.employeeId = filters.employeeId;
      if (filters.deviceId) params.deviceId = filters.deviceId;
      return (await api.get('/monitoring/screenshots', { params })).data;
    },
    refetchInterval: 60000,
  });

  const loadThumbnail = useMutation({
    mutationFn: async (id) => (await api.get(`/monitoring/screenshots/${id}/view`)).data,
    onSuccess: (data, id) => {
      setThumbnailCache(prev => ({ ...prev, [id]: data.viewUrl }));
    },
  });

  const handleScreenshotClick = async (screenshot, index) => {
    try {
      const viewData = await api.get(`/monitoring/screenshots/${screenshot._id}/view`).then(res => res.data);
      setSelectedScreenshot({ item: screenshot, viewUrl: viewData.viewUrl, index });
    } catch (error) {
      console.error('Failed to load screenshot:', error);
    }
  };

  const handleNext = () => {
    const items = screenshots.data?.items || [];
    if (selectedScreenshot && selectedScreenshot.index < items.length - 1) {
      const nextScreenshot = items[selectedScreenshot.index + 1];
      handleScreenshotClick(nextScreenshot, selectedScreenshot.index + 1);
    }
  };

  const handlePrev = () => {
    const items = screenshots.data?.items || [];
    if (selectedScreenshot && selectedScreenshot.index > 0) {
      const prevScreenshot = items[selectedScreenshot.index - 1];
      handleScreenshotClick(prevScreenshot, selectedScreenshot.index - 1);
    }
  };

  const resetFilters = () => {
    setFilters({
      employeeId: '',
      deviceId: '',
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    });
    setPage(1);
  };

  const stats = {
    total: screenshots.data?.total || 0,
    employees: new Set((screenshots.data?.items || []).map(s => s.employeeId?._id).filter(Boolean)).size,
    devices: new Set((screenshots.data?.items || []).map(s => s.deviceId).filter(Boolean)).size,
    latest: screenshots.data?.items?.[0]?.capturedAt,
  };

  const groupedScreenshots = screenshots.data?.items ? groupByDate(screenshots.data.items) : [];

  return (
    <div className="page-enter screenshots-page">
      <PageHeader
        eyebrow="Employee Monitoring"
        title="Screenshots"
        description="View authorized screenshots captured from enrolled employee work devices"
        icon={<Camera size={24} />}
      />

      <Card className="screenshots-stats-card">
        <div className="screenshots-stats">
          <div>
            <span>Total Screenshots</span>
            <strong>{stats.total}</strong>
          </div>
          <div>
            <span>Employees</span>
            <strong>{stats.employees}</strong>
          </div>
          <div>
            <span>Devices</span>
            <strong>{stats.devices}</strong>
          </div>
          <div>
            <span>Latest Capture</span>
            <strong>{stats.latest ? formatTime(stats.latest) : 'N/A'}</strong>
          </div>
        </div>
      </Card>

      <Card className="screenshots-filters-card">
        <div className="screenshots-filters">
          <label>
            Employee
            <select
              value={filters.employeeId}
              onChange={(e) => { setFilters({ ...filters, employeeId: e.target.value }); setPage(1); }}
            >
              <option value="">All employees</option>
              {employees.data?.items?.map(emp => (
                <option key={emp._id} value={emp._id}>{emp.name}</option>
              ))}
            </select>
          </label>

          <label>
            Device
            <select
              value={filters.deviceId}
              onChange={(e) => { setFilters({ ...filters, deviceId: e.target.value }); setPage(1); }}
            >
              <option value="">All devices</option>
              {devices.data?.items?.map(dev => (
                <option key={dev._id} value={dev._id}>
                  {dev.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            From
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => { setFilters({ ...filters, startDate: e.target.value }); setPage(1); }}
            />
          </label>

          <label>
            Through
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => { setFilters({ ...filters, endDate: e.target.value }); setPage(1); }}
            />
          </label>

          <div className="screenshots-filter-actions">
            <Button variant="secondary" onClick={resetFilters}>
              Reset
            </Button>
            <Button variant="secondary" onClick={() => screenshots.refetch()}>
              <RefreshCw size={16} />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {screenshots.isLoading && <LoadingState />}
      {screenshots.isError && <ErrorState error={screenshots.error} onRetry={screenshots.refetch} />}

      {screenshots.data && screenshots.data.items.length === 0 && (
        <Card className="screenshots-empty">
          <Camera size={48} />
          <h3>No screenshots found</h3>
          <p>No retained screenshots match your filters. Confirm that screenshot policy is enabled, devices have consent, and at least one interval has elapsed.</p>
        </Card>
      )}

      {groupedScreenshots.map(([date, items]) => (
        <div key={date} className="screenshots-date-group">
          <h2 className="screenshots-date-heading">{date}</h2>
          <div className="screenshots-grid">
            {items.map((screenshot, index) => {
              const globalIndex = screenshots.data.items.findIndex(s => s._id === screenshot._id);
              return (
                <button
                  key={screenshot._id}
                  className="screenshot-card"
                  onClick={() => handleScreenshotClick(screenshot, globalIndex)}
                >
                  {thumbnailCache[screenshot._id] ? (
                    <img
                      src={thumbnailCache[screenshot._id]}
                      alt={`Screenshot from ${screenshot.employeeId?.name || 'employee'}`}
                      className="screenshot-thumbnail"
                    />
                  ) : (
                    <div
                      className="screenshot-thumbnail-placeholder"
                      onClick={(e) => {
                        e.stopPropagation();
                        loadThumbnail.mutate(screenshot._id);
                      }}
                    >
                      {loadThumbnail.isPending && loadThumbnail.variables === screenshot._id
                        ? 'Loading...'
                        : 'Click to preview'}
                    </div>
                  )}

                  <div className="screenshot-card-info">
                    <strong>{screenshot.employeeId?.name || 'Employee'}</strong>
                    <span><Monitor size={12} /> Device</span>
                    <span>{formatTime(screenshot.capturedAt)}</span>
                    <small>{screenshot.width} × {screenshot.height} · {screenshotStorageLabel(screenshot)}</small>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {screenshots.data && screenshots.data.pages > 1 && (
        <div className="screenshots-pagination">
          <Button
            variant="secondary"
            onClick={() => setPage(p => p - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft size={16} />
            Previous
          </Button>
          <span>Page {page} of {screenshots.data.pages} · {screenshots.data.total} total</span>
          <Button
            variant="secondary"
            onClick={() => setPage(p => p + 1)}
            disabled={page >= screenshots.data.pages}
          >
            Next
            <ChevronRight size={16} />
          </Button>
        </div>
      )}

      {selectedScreenshot && (
        <ScreenshotViewer
          screenshot={selectedScreenshot}
          onClose={() => setSelectedScreenshot(null)}
          onNext={handleNext}
          onPrev={handlePrev}
          hasNext={selectedScreenshot.index < (screenshots.data?.items.length || 0) - 1}
          hasPrev={selectedScreenshot.index > 0}
        />
      )}
    </div>
  );
}
