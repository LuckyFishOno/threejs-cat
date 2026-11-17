// A walk at the cat's own pace, set from published measurements of cats
// walking overground at about 0.6 m/s (see references/RESEARCH.md, study 020).
//
// Cats walk in a lateral sequence: left hind, left fore, right hind, right
// fore, each a quarter of the stride after the last, so two or three paws are
// always on the ground and the body is never airborne. Lengths below are in
// the model's units; where a measurement is quoted it has been scaled by hip
// height (22 cm on the cats measured, 0.80 here).
//
// The spine, girdles, tail and head reuse the gallop's construction; the paw
// paths, joint curves and body motion are the walk's own.
import { motionCurve } from './motion-curve.js';
import { wrap, point, add, vector, padHeight, buildSpine, attachLimb, BONES, PELVIS_SHARE, SHOULDER_SHARE } from './gait.js';
import { makeTail } from './tail.js';
import { headFrom } from './head-neck.js';

const rad = (degrees) => degrees * Math.PI / 180;
const TAU = Math.PI * 2;
// Ground travelled per stride (about twice the hip height), strides per
// second (a 0.8 s step cycle) and the share of the stride a paw is planted.
export const STRIDE = 1.52, CYCLE_HZ = 1.25, DUTY = 0.60;
const STANCE_LENGTH = STRIDE * DUTY;
// Touchdown of each paw as a fraction of the stride. Side 1 is the left.
export function legTiming(front, side) {
  return (side === 1 ? 0 : 0.5) + (front ? 0.25 : 0);
}

// The back is nearly level, hips a little above the shoulders, and lower than
// a standing cat's: a walking cat keeps its legs bent. The hips are highest
// as a hind paw lands and sink about 3% of their height by mid-stance, twice
// a stride; the shoulders do the same a quarter stride later, so the trunk
// rocks very slightly.
const HEIGHT = 0.935, FLEX = 0.08, PITCH = -0.036, PELVIS = -0.10;
export function bodyPose(phase) {
  const bob = Math.cos(2 * TAU * (phase - 0.02));
  return { flex: FLEX + 0.010 * bob, height: HEIGHT + 0.011 * bob, pitch: PITCH - 0.012 * bob, pelvisPitch: PELVIS + 0.030 * bob };
}

// Weight on a paw through its stance: none at touchdown and lift-off.
export function limbLoad(phase, front, side) {
  const p = wrap(phase - legTiming(front, side));
  return p < DUTY ? Math.sin(Math.PI * p / DUTY) ** 2 : 0;
}
// The trunk leans gently over the paws that carry it; much less than in the
// gallop, since at a walk the load changes slowly and is always shared. The
// body's centre moves less than a centimetre from side to side on a real cat.
const SCAPULA_RISE = 0.014;
export function bodySway(phase) {
  const foreLoad = { [-1]: limbLoad(phase, true, -1), 1: limbLoad(phase, true, 1) };
  const fore = foreLoad[1] - foreLoad[-1];
  const hind = limbLoad(phase, false, 1) - limbLoad(phase, false, -1);
  return { fore, hind, foreLoad, foreRoll: 0.028 * fore, hindRoll: -0.032 * hind, foreShift: 0.008 * fore, hindShift: 0.010 * hind };
}
// The trunk also bends from side to side once a stride. It is hollow on the
// side where the hind paw is reaching forward towards the forepaw's print,
// which turns the pelvis to carry that hip forward and lengthens the step.
const BEND = 0.026;
const bendAt = (phase) => -BEND * Math.cos(TAU * (phase - 0.94));
export function spinePose(phase) {
  const sway = bodySway(phase), bend = bendAt(phase);
  return buildSpine(bodyPose(phase), i => sway.hindShift * PELVIS_SHARE[i] + sway.foreShift * SHOULDER_SHARE[i] + bend * Math.sin(Math.PI * i / 8));
}
// Heading of the pelvis or shoulders, towards the cat's left.
const yawAt = (spine, i) => Math.atan2(spine[i + 1].z - spine[i].z, spine[i + 1].x - spine[i].x);

// The shoulder blade swings about its upper edge: forward as the forepaw
// reaches, back as the leg passes under the body.
const shoulderCurve = motionCurve([[0, 0.20], [DUTY, -0.26], [0.80, -0.04], [0.93, 0.21], [1, 0.20]], { periodic: true });

// Wrist and hock are not left to the solver: their angles through the step
// are authored from the measured joint curves, and the elbow or knee follows
// from where the paw has to be.
// Wrist bend in degrees: positive bends the paw up (the standing, weight
// bearing direction), negative folds it back under the forearm. It opens a
// little further through stance as the forearm rocks over the planted paw,
// straightens at lift-off and folds by about 55 degrees early in the swing.
const wristCurve = motionCurve([[0, 5], [0.24, 18], [0.47, 26], [DUTY, 4], [0.735, -58], [0.90, -16], [1, 5]], { periodic: true });
// Included angle at the hock in degrees. It gives a little as the paw takes
// weight (deepest a third of the way through stance), opens to push off,
// folds for the swing and opens again to reach for the ground.
const hockCurve = motionCurve([[0, 121], [0.19, 110], [0.42, 122], [DUTY, 143], [0.785, 90], [0.94, 126], [1, 121]], { periodic: true });

const LIMB = {
  // Touchdown ahead of the shoulder or hip joint's average position, lift
  // height, how far the toes hang below the paw's own line in swing, and half
  // widths of the paw track (planted, and the extra clearance in swing) and
  // of the attachment.
  // A forepaw lands a little ahead of the shoulder and leaves the ground far
  // behind it with the leg almost straight; a hind paw lands under the belly,
  // about half a hip height ahead of the hip.
  fore: { ahead: 0.385, lift: 0.120, flick: 7, toes: 28, track: 0.050, clear: 0.016, width: 0.150 },
  hind: { ahead: 0.405, lift: 0.090, flick: 7, toes: 38, track: 0.046, clear: 0.020, width: 0.180 },
};
// Average fore-aft position of the shoulder and hip joints over the stride.
const JOINT_X = { fore: 0.457, hind: -0.748 };
export const touchX = (front) => JOINT_X[front ? 'fore' : 'hind'] + LIMB[front ? 'fore' : 'hind'].ahead;

const smooth5 = t => { const u = Math.max(0, Math.min(1, t)); return u * u * u * (u * (u * 6 - 15) + 10); };
// A lift that starts and ends with no velocity or acceleration.
const bump = t => 64 * (t * (1 - t)) ** 3;
// The pad's path: planted, it rides the ground; in swing it leaves and meets
// the ground at ground speed with no jump in acceleration.
export function pawCycle(phase, offset, front) {
  const p = wrap(phase - offset), limb = LIMB[front ? 'fore' : 'hind'], touch = touchX(front);
  if (p < DUTY) return { x: touch - STRIDE * p, y: padHeight, lift: 0, swing: 0, planted: true, localPhase: p };
  const s = (p - DUTY) / (1 - DUTY), from = touch - STANCE_LENGTH, speed = -STRIDE * (1 - DUTY);
  // Quintic from lift-off to touchdown. The paw is flicked forward the moment
  // it is free (a step in acceleration, as the ground's push ends), so it
  // hardly trails behind its last print; it settles onto the ground smoothly.
  const d = STANCE_LENGTH, flick = limb.flick;
  const x = from + speed * s + flick / 2 * s * s + (10 * d - 10 * speed - 1.5 * flick) * s ** 3
    + (-15 * d + 15 * speed + 1.5 * flick) * s ** 4 + (6 * d - 6 * speed - flick / 2) * s ** 5;
  // The paw is picked up briskly and set down gently: the lift peaks a
  // little before the middle of the swing.
  const lift = limb.lift * bump(s ** 0.88);
  return { x, y: padHeight + lift, lift, swing: bump(s), planted: false, localPhase: p };
}

// Third corner of a triangle with sides `a` from `root` and `b` from `end`,
// on the side given by `bend` in the sagittal projection (as solveJoint, but
// exact: the caller guarantees the triangle closes).
function corner(root, end, a, b, bend) {
  const dx = end.x - root.x, dy = end.y - root.y, dz = end.z - root.z;
  const plane = Math.max(1e-9, Math.hypot(dx, dy)), d = Math.hypot(plane, dz);
  const along = (a * a - b * b + d * d) / (2 * d), height = Math.sqrt(Math.max(0, a * a - along * along));
  return point(root.x + along * dx / d - bend * height * dy / plane, root.y + along * dy / d + bend * height * dx / plane, root.z + along * dz / d);
}

export function legPose(phase, front, side, spine = spinePose(phase)) {
  const offset = legTiming(front, side), localPhase = wrap(phase - offset), sway = bodySway(phase);
  const limb = LIMB[front ? 'fore' : 'hind'];
  const { pivot, base, shoulderAngle } = attachLimb(front, side, spine, front
    ? { roll: sway.foreRoll, rise: SCAPULA_RISE * sway.foreLoad[side], shoulderAngle: -Math.PI / 2 + shoulderCurve(localPhase)[0], width: limb.width, yaw: yawAt(spine, 6) }
    : { roll: sway.hindRoll, pelvisPitch: bodyPose(phase).pelvisPitch, width: limb.width, yaw: yawAt(spine, 0) });
  const stride = pawCycle(phase, offset, front);
  // Planted paws fall almost on one line; a swinging paw passes just outside
  // the planted one.
  const toe = point(stride.x, stride.y, side * (limb.track + limb.clear * stride.swing));
  const { upper, lower, distal } = front ? BONES.fore : BONES.hind;
  let joint, ankle;
  if (front) {
    const bend = rad(wristCurve(localPhase)[0]);
    // Forearm and paw act as one strut from elbow to pad, its length set by
    // the wrist.
    const strut = Math.sqrt(lower * lower + distal * distal + 2 * lower * distal * Math.cos(bend));
    joint = corner(base, toe, upper, strut, -1);
    ankle = corner(joint, toe, lower, distal, -Math.sign(bend) || -1);
  } else {
    const hock = rad(hockCurve(localPhase)[0]);
    const strut = Math.sqrt(lower * lower + distal * distal - 2 * lower * distal * Math.cos(hock));
    joint = corner(base, toe, upper, strut, 1);
    ankle = corner(joint, toe, lower, distal, -1);
  }
  // Planted toes lie flat. In swing they hang from the paw, a little short of
  // its own line; they only drop once the paw has room above the ground.
  const distalAngle = Math.atan2(toe.y - ankle.y, toe.x - ankle.x);
  const hang = smooth5((stride.lift - 0.02) / 0.08);
  const toeAngle = hang * (distalAngle + rad(limb.toes));
  const tip = add(toe, vector(0.085, toeAngle));
  stride.angle = distalAngle; stride.toeAngle = toeAngle;
  return { pivot, base, joint, ankle, toe, tip, toeAngle, stride, distalAngle,
    upperLength: upper, lowerLength: lower, distalLength: distal, shoulderAngle };
}

// A relaxed tail: carried just below level with the end curving up, rising
// and falling a little with each hind step.
const tailDirection = motionCurve([[0, -0.08, 0.42], [0.25, -0.12, 0.48], [0.5, -0.08, 0.42], [0.75, -0.12, 0.48], [1, -0.08, 0.42]], { periodic: true });
export const tailPose = makeTail(tailDirection, phase => bodyPose(phase).pelvisPitch, spinePose);
// The head is carried level, a little below the line of the back, and is
// held steady: it nods far less than the shoulders rock.
export function headNeckPose(phase, spine = spinePose(phase)) {
  return headFrom(spine, bodyPose(phase).pitch, 0.045 + 0.010 * Math.cos(2 * TAU * (phase - 0.27)));
}

const STAGES = ['左後腳落地', '左前腳落地', '右後腳落地', '右前腳落地'];
export function gaitStage(phase) {
  return STAGES[Math.floor(wrap(phase) * 4) % 4];
}
