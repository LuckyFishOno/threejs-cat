import {bodyPose,spinePose} from './gait.js';

// The back of the skull is the last ribcage loop's neighbour in the skin mesh.
// The head sits far enough ahead of that loop to leave a short neck between
// them: any closer and the skin there has no length and creases as the head
// tips. `bodyPitch` is the gait's spine pitch; `nod` tips the head further down.
export function headFrom(spine,bodyPitch,nod=0){
  const head={x:spine[8].x+.152,y:spine[7].y+.030,z:0};
  return {head,pitch:-.035+.14*bodyPitch-nod};
}
export function headNeckPose(phase,spine=spinePose(phase)) {
  return headFrom(spine,bodyPose(phase).pitch);
}
