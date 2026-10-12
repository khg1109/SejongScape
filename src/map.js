export function project(point, center) {
  return [(point.lon - center[1]) * 111320 * Math.cos(center[0] * Math.PI / 180), -(point.lat - center[0]) * 111320];
}

export function buildingHeight(tags) {
  const explicit = Number.parseFloat(tags.height);
  if (explicit > 0) return { value: explicit, estimated: false };
  const floors = Number.parseFloat(tags['building:levels']);
  if (floors > 0) return { value: floors * 3.2, estimated: true };
  return { value: ({ apartments: 64, office: 28, commercial: 24, retail: 12, garage: 4, garages:4, roof: 4, shed: 3, house:6.4, detached:6.4, semidetached_house:6.4, bungalow:3.2, warehouse:8, industrial:10, barn:5 })[tags.building] || 14, estimated: true };
}

const equal = (a, b) => a && b && Math.abs(a.lat-b.lat) < 1e-8 && Math.abs(a.lon-b.lon) < 1e-8;
export function stitchRings(members, role) {
  const pending = members.filter(m => (m.role || 'outer') === role && m.geometry?.length > 1).map(m => [...m.geometry]);
  const result = [];
  while (pending.length) {
    let ring = pending.pop();
    while (!equal(ring[0], ring.at(-1))) {
      const index = pending.findIndex(p => equal(p[0], ring.at(-1)) || equal(p.at(-1), ring.at(-1)));
      if (index < 0) break;
      let next = pending.splice(index, 1)[0];
      if (!equal(next[0], ring.at(-1))) next.reverse();
      ring.push(...next.slice(1));
    }
    if (ring.length >= 4 && equal(ring[0], ring.at(-1))) result.push(ring);
  }
  return result;
}

export function contains(point, ring) {
  let inside = false;
  for (let i=0,j=ring.length-1; i<ring.length; j=i++) {
    const a=ring[i], b=ring[j];
    if ((a[1]>point[1]) !== (b[1]>point[1]) && point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside = !inside;
  }
  return inside;
}
