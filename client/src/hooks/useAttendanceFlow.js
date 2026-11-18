import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceService } from '../services/attendanceService';

export const getCurrentPosition = ({ targetAccuracy = 80, timeoutMs = 12_000, onSample } = {}) => new Promise((resolve, reject) => {
  if (!navigator.geolocation) return reject(new Error('Location is not supported by this browser.'));
  let bestPosition = null; let settled = false; let watchId; let timeoutId;
  const finish = (callback, value) => { if (settled) return; settled = true; window.clearTimeout(timeoutId); navigator.geolocation.clearWatch(watchId); callback(value); };
  watchId = navigator.geolocation.watchPosition((position) => {
    if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) bestPosition = position;
    onSample?.(bestPosition);
    if (position.coords.accuracy <= targetAccuracy) finish(resolve, position);
  }, (error) => { if (error.code === 1) finish(reject, error); }, { enableHighAccuracy: true, maximumAge: 0 });
  timeoutId = window.setTimeout(() => bestPosition ? finish(resolve, bestPosition) : finish(reject, new Error('Could not get a fresh GPS location. Check location services.')), timeoutMs);
});

export function useAttendanceFlow() {
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const refreshAttendance = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['employee', 'today'] }), queryClient.invalidateQueries({ queryKey: ['employee', 'history'] })]);
  const checkIn = useMutation({
    mutationFn: async (faceCapture = {}) => {
      setError(''); setProgress('Creating a secure attendance challenge…');
      const challenge = await attendanceService.createChallenge();
      let officeId;
      if (challenge.workMode === 'OFFICE') {
        const offices = await attendanceService.assignedOffices();
        if (!offices.length) throw new Error('No active office is assigned to your account.');
        officeId = offices[0]._id;
      }
      setProgress(challenge.workMode === 'WFH' ? 'Requesting GPS for the approved WFH location…' : 'Requesting GPS for your assigned office…');
      const position = await getCurrentPosition({
        targetAccuracy: challenge.locationAccuracyMax || 80,
        onSample: (sample) => setProgress(`Improving location accuracy… current ±${Math.round(sample.coords.accuracy)} m`),
      });
      setProgress(challenge.workMode === 'WFH' ? 'Verifying approved WFH boundary…' : 'Verifying office geofence…');
      await attendanceService.verifyLocation({ challengeId: challenge.id, ...(officeId && { officeId }), ...(challenge.wfhRequestId && { wfhRequestId: challenge.wfhRequestId }), position: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp } });
      setProgress('Verifying your face…');
      await attendanceService.verifyFace({ challengeId: challenge.id, evidence: { adapter: 'browser-live', challengeResponse: 'completed', ...faceCapture } });
      setProgress(`Starting your ${challenge.workMode === 'WFH' ? 'work-from-home' : 'office'} session…`);
      return attendanceService.checkIn(challenge.id);
    },
    onSuccess: async () => { setProgress('Attendance marked successfully. Your session is active.'); await refreshAttendance(); },
    onError: (requestError) => {
      const details = requestError?.details; let message = requestError?.message || 'Check-in could not be completed.';
      if (requestError?.code === 1) message = 'Location permission was denied. Allow precise location access and try again.';
      else if (requestError?.code === 'OUTSIDE_GEOFENCE' && details) message = `${message}. You are about ${details.distanceMeters} m away; allowed radius is ${details.officeRadiusMeters} m.`;
      else if (requestError?.code === 'ACCURACY_INSUFFICIENT' && details) message = `${message}. Current accuracy: ${details.accuracyMeters} m.`;
      setError(message); setProgress('');
    },
  });
  const checkOut = useMutation({ mutationFn: attendanceService.checkOut, onSuccess: async () => { setProgress('Work session completed successfully.'); setError(''); await refreshAttendance(); }, onError: (requestError) => setError(requestError.message) });
  return { checkIn, checkOut, progress, error, clearMessage: () => { setProgress(''); setError(''); } };
}
