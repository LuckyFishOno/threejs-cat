// Head and ears of a short-haired black cat, in the rigid head frame:
// +x towards the nose, +y towards the crown, +z towards the cat's left.
//
// The head is one blended solid built from anatomical masses (braincase,
// cheekbones, nose bridge, muzzle, chin, jaw, neck). Skin vertices are cast
// onto it along rays, so the silhouette comes from the masses themselves and
// not from a table of ring radii.
const rad = Math.PI / 180;
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const u = (x - cx) / rx, v = (y - cy) / ry, w = (z - cz) / rz;
  const k0 = Math.hypot(u, v, w);
  if (k0 < 1e-9) return -Math.min(rx, ry, rz);
  return k0 * (k0 - 1) / Math.hypot(u / rx, v / ry, w / rz);
}
// Tapered capsule from a (radius ra) to b (radius rb).
function limb(x, y, z, ax, ay, az, ra, bx, by, bz, rb) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz)));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t, z - az - dz * t) - mix(ra, rb, t);
}
const join = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };
const carve = (a, b, k) => -join(-a, b, k);

// Signed distance to the head; negative inside. Mirrored across z = 0.
export function headDistance(x, y, zSigned) {
  const z = Math.abs(zSigned);
  // Braincase: the rounded dome between the ears and down to the occiput.
  let d = ellipsoid(x, y, z, -.035, .034, 0, .150, .130, .152);
  // Neck leaves the skull base slightly below the head's centre line.
  d = join(d, limb(x, y, z, -.030, -.036, 0, .114, -.520, -.092, 0, .166), .050);
  // Cheekbones and jaw muscle: the widest part of the head, below the eyes.
  d = join(d, ellipsoid(x, y, z, .040, -.016, .084, .098, .080, .084), .040);
  // Lower jaw runs from under the cheek forward to the chin.
  d = join(d, limb(x, y, z, -.020, -.074, .078, .050, .118, -.098, .022, .032), .034);
  // The cheek narrows into the muzzle along the upper jaw, without a waist.
  d = join(d, limb(x, y, z, .060, -.036, .092, .060, .140, -.060, .034, .042), .030);
  // Nose bridge: a short slope from the brow to the nose.
  d = join(d, limb(x, y, z, .060, .048, 0, .050, .150, -.013, 0, .031), .024);
  // Short, broad muzzle with its whisker pads, the nose tip and a small chin.
  d = join(d, ellipsoid(x, y, z, .116, -.060, 0, .068, .050, .064), .030);
  d = join(d, ellipsoid(x, y, z, .141, -.066, .034, .043, .036, .045), .018);
  d = join(d, ellipsoid(x, y, z, .165, -.022, 0, .026, .023, .027), .012);
  d = join(d, ellipsoid(x, y, z, .127, -.106, 0, .040, .029, .037), .020);
  // Shallow eye sockets set the cheekbone and brow apart from the bridge.
  d = carve(d, ellipsoid(x, y, z, .124, .040, .092, .032, .028, .032), .022);
  return d;
}

// Outermost surface point along a ray that starts inside the head.
export function castHead(ox, oy, oz, dx, dy, dz, out) {
  const length = Math.hypot(dx, dy, dz) || 1;
  dx /= length; dy /= length; dz /= length;
  let far = .62, near = 0;
  while (far > 0 && headDistance(ox + dx * far, oy + dy * far, oz + dz * far) > 0) far -= .006;
  near = Math.max(0, far); far = near + .006;
  for (let i = 0; i < 14; i++) {
    const t = (near + far) / 2;
    if (headDistance(ox + dx * t, oy + dy * t, oz + dz * t) > 0) far = t; else near = t;
  }
  const t = (near + far) / 2;
  out[0] = ox + dx * t; out[1] = oy + dy * t; out[2] = oz + dz * t;
  return out;
}

// Skin loops around the head axis. Each loop casts from a point on the axis;
// the fan angle is 90 degrees for a flat slice and opens forward around the
// face. `ear` is how far the loop's vertices are gathered under the ears.
export const headLoops = [
  // axis x, axis y, fan angle, ear gather
  [-.190, -.052, 90, .5], [-.150, -.032, 90, 1], [-.110, -.012, 90, 1],
  [-.070, 0, 90, 1], [-.030, 0, 90, 1], [.010, -.008, 93, .8],
  [.040, -.018, 101, .55], [.060, -.030, 112, .3], [.070, -.040, 124, 0],
];
const gathered = [0, 13, 31, 53, 78, 98, 120, 146, 180];
// Ray for vertex `j` of `count` in head loop `i`.
export function loopRay(i, j, count) {
  const [x, y, fan, ear] = headLoops[i];
  const half = count / 2, k = j <= half ? j : count - j, side = j <= half ? 1 : -1;
  const around = mix(k * 180 / half, gathered[k * 8 / half], ear) * rad;
  const s = Math.sin(fan * rad);
  return [x, y, 0, -Math.cos(fan * rad), s * Math.cos(around), side * s * Math.sin(around)];
}
// The face is a square sheet wrapped over the muzzle as a spherical cap.
// `vertical` and `lateral` run from -1 to 1 across the sheet.
const capAxis = [.075, -.045], capAngle = 44 * rad;
export function faceRay(vertical, lateral) {
  let r, turn;
  if (Math.abs(vertical) > Math.abs(lateral)) { r = vertical; turn = Math.PI / 4 * lateral / vertical; }
  else if (lateral !== 0) { r = lateral; turn = Math.PI / 2 - Math.PI / 4 * vertical / lateral; }
  else { r = 0; turn = 0; }
  const polar = capAngle * Math.abs(r), sign = Math.sign(r);
  return [capAxis[0], capAxis[1], 0, Math.cos(polar),
    Math.sin(polar) * Math.cos(turn) * sign, Math.sin(polar) * Math.sin(turn) * sign];
}

// Ear shell. `rim` is the loop of head vertices around the ear base, ordered
// inner side (back to front), front, outer side (front to back), back, with
// `perSide` vertices on each of the four sides. The pinna's two free edges
// rise from the front-inner corner and the outer side to the tip, so the cup
// opens forward and outward. Returns `heights.length` rows plus the tip.
export const earHeights = [.12, .27, .43, .59, .74, .88];
export function earShell(rim, side, perSide = 3) {
  const n = rim.length, inner = perSide, outer = 2 * perSide + 1;
  // The cone's apex; the ear is closed just below it for a blunt tip.
  const apex = [-.048, .281, side * .145], closeAt = .97;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const lerp = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  const unit = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // Plane through both free edges; its normal points out of the cup.
  let facing = unit(cross(sub(rim[outer], rim[inner]), sub(apex, rim[inner])));
  if (dot(sub(rim[2 * perSide], rim[inner]), facing) < 0) facing = facing.map(v => -v);
  const centre = lerp(rim[inner], rim[outer], .5);
  const axis = unit(sub(apex, centre));
  const across = unit(sub(rim[outer], rim[inner]));
  // How far the back wall sits behind the edge plane at the base.
  let depth = 0;
  for (let k = outer + 1; k < n + inner; k++) depth = Math.max(depth, -dot(sub(rim[k % n], rim[inner]), facing));
  const edge = (base, s, bow) => {
    const p = lerp(base, apex, s), b = bow * Math.sin(Math.PI * Math.min(1, s * 1.08));
    return [p[0] + across[0] * b, p[1] + across[1] * b, p[2] + across[2] * b];
  };
  const rows = earHeights.map(s => {
    const innerEdge = edge(rim[inner], s, -.006), outerEdge = edge(rim[outer], s, .020);
    return rim.map((base, k) => {
      if (k === inner) return innerEdge;
      if (k === outer) return outerEdge;
      if (k > inner && k < outer) {
        // Inside of the cup: a hollow sheet between the two edges that
        // comes up from the head at the front of the ear base.
        const f = (k - inner) / (outer - inner);
        const sheet = lerp(innerEdge, outerEdge, f);
        const hollow = .86 * depth * (1 - s) * Math.sqrt(4 * f * (1 - f));
        const cup = [sheet[0] - facing[0] * hollow, sheet[1] - facing[1] * hollow, sheet[2] - facing[2] * hollow];
        return lerp(lerp(base, apex, s * .55), cup, smooth(s / .30));
      }
      // Back of the ear: a slightly swollen half cone up to the tip.
      const p = lerp(base, apex, s), fromAxis = sub(p, centre), along = dot(fromAxis, axis);
      const out = unit([fromAxis[0] - axis[0] * along, fromAxis[1] - axis[1] * along, fromAxis[2] - axis[2] * along]);
      const swell = .008 * Math.sin(Math.PI * s);
      return [p[0] + out[0] * swell, p[1] + out[1] * swell, p[2] + out[2] * swell];
    });
  });
  return { rows, tip: lerp(centre, apex, closeAt) };
}
