const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(a, b) {
  const radians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const h =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function evaluateGeofence({ position, office, maxAccuracy = 80, now = Date.now(), maxAgeMs = 30_000 }) {
  if (
    !Number.isFinite(position.latitude) ||
    !Number.isFinite(position.longitude) ||
    Math.abs(position.latitude) > 90 ||
    Math.abs(position.longitude) > 180
  ) {
    return { ok: false, reason: 'INVALID_COORDINATES' };
  }
  if (!Number.isFinite(position.accuracy) || position.accuracy < 0 || position.accuracy > maxAccuracy) {
    return { ok: false, reason: 'ACCURACY_INSUFFICIENT' };
  }
  const positionTime = new Date(position.timestamp).getTime();
  if (!Number.isFinite(positionTime) || Math.abs(now - positionTime) > maxAgeMs) {
    return { ok: false, reason: 'STALE_POSITION' };
  }

  const [longitude, latitude] = office.location.coordinates;
  const distance = haversineMeters(position, { latitude, longitude });
  // Accuracy has already passed the organization's independent maximum-accuracy
  // policy. Adding it to distance shrinks the configured geofence unpredictably
  // (for example, a 150 m radius becomes only 70 m with 80 m accuracy).
  const ok = distance <= office.radiusMeters;
  return { ok, reason: ok ? 'VERIFIED' : 'OUTSIDE_GEOFENCE', distance };
}

export function assignmentIsValid(assignment, now = new Date()) {
  return Boolean(
    assignment.active &&
      (!assignment.validFrom || assignment.validFrom <= now) &&
      (!assignment.validUntil || assignment.validUntil >= now),
  );
}
