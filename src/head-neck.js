import {bodyPose,spinePose} from './gait.js';

// The back of the skull is the last ribcage loop's neighbour in the skin mesh.
export function headNeckPose(phase,spine=spinePose(phase)) {
  const head={x:spine[8].x+.118,y:spine[7].y+.030,z:0};
  const pitch=-.035+.14*bodyPose(phase).pitch;
  return {head,pitch};
}
