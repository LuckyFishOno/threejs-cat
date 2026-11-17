import { motionCurve } from './motion-curve.js';
export const TAU = Math.PI * 2;
export const wrap = (x) => ((x % 1) + 1) % 1;
export const STRIDE = 4.00;
export const CYCLE_HZ = 1.85;
export const STANCE = 0.235;
const rad = (degrees) => degrees * Math.PI / 180;
export const point = (x, y, z = 0) => ({ x, y, z });
export const add = (a, b) => point(a.x + b.x, a.y + b.y, a.z + b.z);
export const vector = (length, angle, z = 0) => point(length * Math.cos(angle), length * Math.sin(angle), z);
export const smoothstep = (x) => { const t=Math.max(0,Math.min(1,x)); return t*t*t*(t*(t*6-15)+10); };
// Bone lengths, in the same units as the spine (one vertebral link is 0.185).
// The humerus matches the forearm and the hind limb is the longer of the two;
// overall they are kept short so the legs read as a house cat's under the
// trunk, not a sprinter's.
export const BONES = {
  fore: { upper: 0.36, lower: 0.36, distal: 0.13 },
  hind: { upper: 0.37, lower: 0.38, distal: 0.22 },
};
// The paw paths below were authored for other bone lengths. The body is set
// lower, the shoulders more than the hindquarters, so the chest clears the
// ground by about three quarters of its own depth while a forepaw is down.
// The airborne reach of each paw is scaled to its limb.
const RISE = -0.03, NOSE_DOWN = 0.02;
const REACH = { fore: 1, hind: 0.995 };
const bodyKeys = [
  // phase, lumbar flexion, sacrum height, spine pitch, pelvis pitch
  [0, -0.02, 0.91, 0.015, -0.18],
  [0.16, 0.16, 0.96, -0.075, -0.04],
  [0.30, 0.60, 0.96, -0.14, 0.29],
  [0.46, 0.83, 0.90, -0.10, 0.51],
  [0.60, 0.74, 0.825, 0.03, 0.35],
  [0.76, 0.25, 0.825, 0.11, -0.14],
  [0.89, -0.025, 0.885, 0.065, -0.28],
  [1, -0.02, 0.91, 0.015, -0.18],
];
const bodyCurve=motionCurve(bodyKeys.map(([p,flex,height,pitch,pelvis])=>[p,flex,height+RISE,pitch-NOSE_DOWN,pelvis]),{periodic:true});
export function bodyPose(phase) {
  const [flex, height, pitch, pelvisPitch] = bodyCurve(phase);
  return { flex, height, pitch, pelvisPitch };
}

// Weight on a limb through its stance: nothing at touchdown and lift-off,
// full at mid-stance.
export function limbLoad(phase, front, side) {
  const p = wrap(phase - legTiming(front, side));
  return p < STANCE ? Math.sin(Math.PI * p / STANCE) ** 2 : 0;
}
// Side-to-side motion of the trunk, driven by which feet carry weight. The
// ribcage hangs between the shoulder blades, so it sinks and leans towards a
// loaded foreleg while that shoulder blade rides up; the pelvis is bolted to
// the hind legs, so the hip over a loaded hind leg is the higher one.
// A positive roll lowers the cat's left side (+z).
const SCAPULA_RISE = 0.034;
export function bodySway(phase) {
  const foreLoad = { [-1]: limbLoad(phase, true, -1), 1: limbLoad(phase, true, 1) };
  const fore = foreLoad[1] - foreLoad[-1];
  const hind = limbLoad(phase, false, 1) - limbLoad(phase, false, -1);
  // `fore` and `hind` run from -1 (all weight on the right) to 1 (the left).
  return { fore, hind, foreLoad, foreRoll: 0.075 * fore, hindRoll: -0.055 * hind, foreShift: 0.022 * fore, hindShift: 0.016 * hind };
}
// Fixed-length lumbar links bend; the last thoracic links stay aligned.
// `lateral(i)` is the sideways offset of vertebra i. Shared by every gait.
export const SPINE_LINK = 0.185;
export function buildSpine({ flex, height, pitch }, lateral = () => 0) {
  const open = [1.15,.95,.60,.10,-.40,-.60,-.60,-.60];
  const collected = [1.15,.65,.18,-.14,-.26,-.33,-.33,-.33];
  // Spread the bend from the pelvis into the loin before the ribcage catches
  // up. In extension the original eight link directions are unchanged.
  const tuck=smoothstep((flex-.20)/.55);
  const weights=open.map((a,i)=>a+(collected[i]-a)*tuck);
  // Each link keeps its length: what it spends sideways it loses in the
  // sagittal plane.
  const spine = [point(0, height, lateral(0))];
  weights.forEach((weight, i) => {
    const dz = lateral(i + 1) - lateral(i), from = spine.at(-1);
    const link = vector(Math.sqrt(SPINE_LINK * SPINE_LINK - dz * dz), pitch + flex * weight * 0.75);
    spine.push(point(from.x + link.x, from.y + link.y, from.z + dz));
  });
  // Keep the sacrum on its authored fore/aft path: easing the spinal arch
  // must not pull the hip away from a planted hind paw.
  const center = open.reduce((x,w)=>x+SPINE_LINK*Math.cos(pitch+flex*w*.75),0)*.5;
  return spine.map((p) => point(p.x - center, p.y, p.z));
}
// The pelvis leans over a loaded hind foot and the shoulders over a loaded
// forefoot; the neck base returns to the midline so the head stays steady.
export const PELVIS_SHARE = [1, 1, 0.8, 0.45, 0.15, 0, 0, 0, 0];
export const SHOULDER_SHARE = [0, 0, 0, 0.15, 0.45, 0.8, 1, 1, 0];
export function spinePose(phase) {
  const sway = bodySway(phase);
  return buildSpine(bodyPose(phase), i => sway.hindShift * PELVIS_SHARE[i] + sway.foreShift * SHOULDER_SHARE[i]);
}
// Each swing is a cubic B-spline through control poses. The three controls at
// either end continue the planted trajectory exactly, matching its velocity
// and acceleration. The middle controls describe one unbroken recovery arc.
const foreTouch = 0.95, hindTouch = -0.155;
export const padHeight = 0.055;
function swingCurve(touch, releaseAngle, landingAngle, authored, reach, lift) {
  // Paths measured from the shoulder or hip scale with the limb's length;
  // paths drawn against the torso rise or sink with that end of the body.
  const arc = authored.map(([x, y, ...rest]) => rest.at(-1) === joint ? [x * reach, y * reach, ...rest] : [x, y + lift, ...rest]);
  const spans = arc.length + 3;
  const h = (1 - STANCE) / spans;
  const travel = STRIDE * h;
  const release = touch - STRIDE * STANCE;
  const controls = [
    [release + travel, padHeight, releaseAngle, 0, 0, 0],
    [release, padHeight, releaseAngle, 0, 0, 0],
    [release - travel, padHeight, releaseAngle, 0, 0, 0],
    ...arc,
    [touch + travel, padHeight, landingAngle, 0, 0, 0],
    [touch, padHeight, landingAngle, 0, 0, 0],
    [touch - travel, padHeight, landingAngle, 0, 0, 0],
  ];
  return phase => {
    const at = Math.max(0, Math.min(spans, (phase - STANCE) / h));
    const index = Math.min(spans - 1, Math.floor(at));
    const t = at - index, u = 1 - t;
    const w = [u**3 / 6, (4 - 6*t*t + 3*t**3) / 6, (1 + 3*t + 3*t*t - 3*t**3) / 6, t**3 / 6];
    return [0, 1, 2, 3, 4, 5].map(d => w.reduce((sum, weight, k) => sum + weight * controls[index + k][d], 0));
  };
}

// Each control gives pad x/y, distal and toe angles (degrees), lateral shift,
// and the coordinate frame for x/y. During reach the pad travels with its own
// shoulder or hip. In support the pad follows the ground at a constant speed.
// The spline interpolates both the pad and its attachment weight.
const torso = 0, joint = 1;
// Half widths measured from the spine. The planted pads sit inside their
// attachments. A hind paw tracks outward briefly as it passes the forepaw.
const foreTrack = { attachment: 0.150, stance: 0.058 };
const hindTrack = { attachment: 0.180, stance: 0.150 };
const foreCurve = swingCurve(foreTouch, -104, -62, [
  [0.08, 0.28, -139, -95, -0.075, torso],
  [0.31, 0.43, -154, -135, -0.036, torso],
  [0.55, 0.55, -147, -145, -0.015, torso],
  [0.83, 0.54, -136, -134, 0, torso],
  // While the hind legs trail at full stretch the forelegs stay bent, paws
  // hanging under the chin; they only reach forward and down to land.
  [0.40, -0.30, -105, -100, 0, joint],
  [0.42, -0.40, -82, -72, 0, joint],
  [0.48, -0.45, -60, -45, 0, joint],
], REACH.fore, RISE - NOSE_DOWN * 7 * 0.185);
const hindCurve = swingCurve(hindTouch, -99, -57, [
  [-0.814, -0.438, -149, -131, 0.006, joint],
  [-0.973, -0.318, -161, -155, 0.012, joint],
  [-0.689, -0.269, -131, -138, 0.008, joint],
  [-0.91, 0.55, -58, -105, 0, torso],
  [-0.47, 0.51, 5, -55, 0.033, torso],
  [-0.12, 0.405, 14, -15, 0.095, torso],
  [0.09, 0.315, -12, -20, 0.098, torso],
], REACH.hind, RISE - 0.06);
const shoulderCurve = motionCurve([[0,0.37],[STANCE,-0.42],[0.46,-0.29],[0.67,0.20],[0.84,0.63],[1,0.37]], {periodic:true});
// Touchdown of the first forefoot, and how long the second follows it,
// as fractions of the stride.
export const FORE_LEAD = 0.09, FORE_GAP = 0.16;
export function legTiming(front, side) {
  // Forefeet receive the extended body, hindfeet then land under the belly.
  // Left/right stagger avoids a synchronous rabbit-like bound. The forefeet
  // come down one well after the other; the hindfeet land closer together.
  return front ? (side === -1 ? FORE_LEAD : FORE_LEAD + FORE_GAP) : (side === -1 ? 0.69 : 0.59);
}
// Shoulder (top of the scapula and the shoulder joint) or hip (sacrum and hip
// joint), carried by that girdle's roll. Shared by every gait.
export function attachLimb(front, side, spine, { roll, rise = 0, shoulderAngle = 0, pelvisPitch = 0, width, yaw = 0 }) {
  const z = side * width;
  const cos = Math.cos(roll), sin = Math.sin(roll);
  // A point given relative to its spine anchor, carried by that girdle's roll.
  // `yaw` is the girdle's heading towards the cat's left: it brings the right
  // side's joint forward and the left side's back.
  const carried = (anchor, dx, dy, lift = 0) =>
    point(anchor.x + dx - z * Math.sin(yaw), anchor.y + dy * cos - z * sin + lift, anchor.z + dy * sin + z * cos);
  if (front) {
    const anchor = spine[7], blade = vector(0.325, shoulderAngle);
    return { pivot: carried(anchor, -0.075, 0.14, rise), base: carried(anchor, -0.075 + blade.x, 0.14 + blade.y, rise), shoulderAngle };
  }
  const pelvis = vector(0.135, -Math.PI/2+pelvisPitch);
  return { pivot: carried(spine[0], 0, 0), base: carried(spine[0], pelvis.x, pelvis.y) };
}
function limbAttachment(phase, front, side, spine, localPhase) {
  const sway = bodySway(phase);
  return attachLimb(front, side, spine, front
    ? { roll: sway.foreRoll, rise: SCAPULA_RISE * sway.foreLoad[side], shoulderAngle: -Math.PI/2 + shoulderCurve(localPhase)[0], width: foreTrack.attachment }
    : { roll: sway.hindRoll, pelvisPitch: bodyPose(phase).pelvisPitch, width: hindTrack.attachment });
}
export function pawCycle(phase, offset = 0, front = true, base) {
  const p = wrap(phase - offset);
  if (p < STANCE) {
    const eased = smoothstep(p / STANCE);
    return { x: (front ? foreTouch : hindTouch) - STRIDE * p, y: padHeight,
      angle: rad(front ? -62 - 42 * eased : -57 - 42 * eased), toeAngle: 0, trackShift: 0, planted: true, localPhase: p };
  }
  const [x, y, angle, toeAngle, trackShift, attachmentWeight] = (front ? foreCurve : hindCurve)(p);
  const root = base ?? limbAttachment(phase, front, 1, spinePose(phase), p).base;
  return { x: x + attachmentWeight * root.x, y: y + attachmentWeight * root.y,
    angle: rad(angle), toeAngle: rad(toeAngle), trackShift, planted: false, localPhase: p };
}
export function solveJoint(root, end, a, b, bend) {
  const dx = end.x - root.x, dy = end.y - root.y, dz = end.z - root.z;
  const projected = Math.hypot(dx, dy), raw = Math.hypot(projected, dz);
  const d = Math.min(a + b - 1e-7, Math.max(Math.abs(a - b) + 1e-7, raw));
  const along = (a*a - b*b + d*d) / (2*d);
  const height = Math.sqrt(Math.max(0, a*a - along*along));
  const length = Math.max(1e-8, raw), plane = Math.max(1e-8, projected);
  // The bend direction is perpendicular to the limb axis in the sagittal
  // projection. Letting the axis follow the lateral paw track keeps the two
  // bone lengths exact as the rear hock passes outside the foreleg.
  return point(
    root.x + along*dx/length - bend*height*dy/plane,
    root.y + along*dy/length + bend*height*dx/plane,
    root.z + along*dz/length
  );
}
export function legPose(phase, front, side, spine = spinePose(phase)) {
  const offset = legTiming(front, side), localPhase = wrap(phase - offset);
  const {pivot, base, shoulderAngle} = limbAttachment(phase, front, side, spine, localPhase);
  const stride = pawCycle(phase, offset, front, base);
  const footTrack = (front ? foreTrack : hindTrack).stance + stride.trackShift;
  const toe = point(stride.x, stride.y, side * footTrack);
  const { upper: upperLength, lower: lowerLength, distal: distalLength } = front ? BONES.fore : BONES.hind;
  const distalAngle = stride.angle;
  const ankle = add(toe, vector(-distalLength, distalAngle));
  const joint = solveJoint(base, ankle, upperLength, lowerLength, front ? -1 : 1);
  const toeAngle = stride.toeAngle;
  const tip = add(toe, vector(0.085, toeAngle));
  return { pivot, base, joint, ankle, toe, tip, toeAngle, stride, distalAngle, upperLength, lowerLength, distalLength, shoulderAngle };
}
export function gaitStage(phase) {
  const p = wrap(phase);
  if (p >= FORE_LEAD && p < 0.485) return '前肢著地 · 屈肘承重';
  if (p >= 0.485 && p < 0.59) return '收腹騰空 · 後肢前收';
  if (p >= 0.59 && p < 0.925) return '後肢著地 · 伸髖推蹬';
  return '伸展騰空 · 前肢前探';
}
