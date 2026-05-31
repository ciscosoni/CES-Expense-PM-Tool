/** Great-circle distance in metres between two lat/lng points (haversine). */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Earth radius, metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface GeoCircle {
  lat: number;
  lng: number;
  radiusMeters: number;
}

/**
 * Distance (metres) from a point to the nearest circle's edge, and whether the
 * point is inside any circle. `nearestEdgeMeters` is 0 when inside. Returns
 * null distance when there are no circles to compare against.
 */
export function distanceToNearestSite(
  lat: number,
  lng: number,
  circles: GeoCircle[],
): { insideAny: boolean; nearestEdgeMeters: number | null } {
  if (circles.length === 0) return { insideAny: false, nearestEdgeMeters: null };
  let best = Infinity;
  let inside = false;
  for (const c of circles) {
    const d = haversineMeters(lat, lng, c.lat, c.lng);
    const edge = Math.max(0, d - c.radiusMeters);
    if (d <= c.radiusMeters) inside = true;
    if (edge < best) best = edge;
  }
  return { insideAny: inside, nearestEdgeMeters: best };
}
