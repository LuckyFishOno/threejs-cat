import {spinePose,bodyPose} from './gait.js';
import {motionCurve} from './motion-curve.js';
// About six tenths of the head-and-body length, as on a short-haired cat.
export const TAIL_SEGMENTS=32,TAIL_LENGTH=1.22;
// Tail root behind and just above the sacrum; the rump's last skin loop is
// centred on the same point.
export const TAIL_ROOT={x:-.165,y:.028};

// Angles above the rearward horizontal. The root changes with the pelvic
// stroke; curvature and the far tip respond progressively later along the arc.
// The neutral shaft has a low arch; it does not wag side to side on a sine.
// In a straight gallop the tail works in the vertical plane. Its root moves
// with the pelvis, so the whole tail drifts a little from side to side, but
// it is not swung as a counterweight: that only happens in turns.
const direction=motionCurve([
  [0,.21,.23],[.16,.035,.13],[.31,.035,-.02],[.49,.21,-.21],
  [.64,.43,-.36],[.78,.50,-.26],[.90,.39,.10],[1,.21,.23]
],{periodic:true});
const widths=Array.from({length:TAIL_SEGMENTS+1},(_,i)=>{
  const t=i/TAIL_SEGMENTS,u=Math.max(0,Math.min(1,(t-.42)/.5));
  // An even shaft that thins a little towards the tip, and a thick root
  // that carries the croup into the tail over its first few segments.
  const shaft=.052+.010*Math.exp(-12*t)+.022*Math.exp(-t/.03)-.006*u*u*(3-2*u);
  const cap=t<.955?1:Math.sqrt(Math.max(0,1-((t-.955)/.045)**2));
  return [shaft*cap,shaft*cap*.96];
});
export function tailPose(phase,spine=spinePose(phase)){
  const rear=spine[0],points=[{x:rear.x+TAIL_ROOT.x,y:rear.y+TAIL_ROOT.y,z:rear.z??0}];
  const step=TAIL_LENGTH/TAIL_SEGMENTS;
  for(let i=0;i<TAIL_SEGMENTS;i++){
    const s=(i+.5)/TAIL_SEGMENTS,lag=.16*s*s;
    const [root,tip]=direction(phase-lag);
    const bend=s*s*(3-2*s);
    const elevation=root*(1-bend)+tip*bend+.075*Math.sin(Math.PI*s)
      -.10*bodyPose(phase-lag).pelvisPitch*(1-s);
    const yaw=.025+.043*s*(root-tip);
    const p=points[i],h=step*Math.cos(elevation);
    points.push({x:p.x-h*Math.cos(yaw),y:p.y+step*Math.sin(elevation),z:p.z+h*Math.sin(yaw)});
  }
  return {points,radii:widths};
}
