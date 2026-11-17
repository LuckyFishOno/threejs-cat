import {createSurface} from './cat-surface.js';
import * as THREE from 'three';
import { TAU } from './gait.js';
import { GAITS } from './gaits.js';
import { materials, ellipsoid, ellipsoidBatch, scapula, line, updateLine, orient } from './wire-geometry.js';
const v=(x,y,z=0)=>new THREE.Vector3(x,y,z);
const vec=(p)=>v(p.x,p.y,p.z);

export function createCat(scene) {
  const cat=new THREE.Group();
  scene.add(cat);
  const skin=new THREE.Group(), skeleton=new THREE.Group();
  cat.add(skin,skeleton);
  skeleton.visible=false;
  const surface=createSurface(skin);
  const spineLine=line(skeleton,Array.from({length:9},()=>v(0,0)),materials.bone);
  const vertebrae=Array.from({length:8},()=>ellipsoid(skeleton,v(0.028,0.5,0.028),materials.bone,3,6));
  const legs=[];
  for(const front of [false,true]) for(const side of [-1,1]) {
    const blade=front?scapula(skeleton,materials.bone):ellipsoid(skeleton,v(0.13,0.5,0.09),materials.bone,4,8);
    const details=ellipsoidBatch(skeleton,48,materials.bone,4,8);
    const internalBones=ellipsoidBatch(skeleton,8,materials.bone,4,8);
    const bone=line(skeleton,Array.from({length:6},()=>v(0,0)),materials.bone);
    const contact=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:28},(_,i)=>v(Math.cos(i/28*TAU)*0.10,0.004,Math.sin(i/28*TAU)*0.075))),materials.fine);
    skeleton.add(contact);
    legs.push({front,side,blade,details,internalBones,bone,contact});
  }

  // `gait` names an entry of GAITS; every gait drives the same skin and skeleton.
  function pose(phase,gait='gallop') {
    const {spinePose,legPose,bodySway,headNeckPose,tailPose}=GAITS[gait];
    const spine=spinePose(phase).map(vec);
    const poses=legs.map(({front,side})=>({...legPose(phase,front,side,spine),front,side}));
    surface.update(spine,headNeckPose(phase,spine),tailPose(phase,spine),poses,bodySway(phase));
    if(!skeleton.visible)return;
    updateLine(spineLine,spine);
    vertebrae.forEach((bone,i)=>orient(bone,spine[i],spine[i+1],1,1));
    for(let i=0;i<legs.length;i++) {
      const leg=legs[i],sampled=poses[i];
      const [pivot,base,joint,ankle,toe,tip]=['pivot','base','joint','ankle','toe','tip'].map(k=>vec(sampled[k]));
      const {stride}=sampled;
      orient(leg.blade,pivot,base);
      const {toeAngle}=sampled;
      const parts=[];
      const piece=(start,end,width,depth=width*0.86)=>parts.push({start,end,width,depth});
      // Paired articular condyles instead of one ball at the elbow/knee.
      for(const sideOffset of [-0.028,0.028]) {
        const c=joint.clone().add(v(0,0,sideOffset));
        piece(c.clone().add(v(0,-0.038)),c.clone().add(v(0,0.038)),0.043,0.028);
      }
      if(!leg.front) {
        const kneecap=joint.clone().add(v(0.047,0));
        piece(kneecap.clone().add(v(0,-0.033)),kneecap.clone().add(v(0,0.033)),0.027,0.035);
        const heel=ankle.clone().add(v(-0.052,0.063));
        piece(ankle,heel,0.028,0.032);
        // Achilles tendon travels to the calcaneal heel, separate from the shin.
        piece(joint.clone().lerp(ankle,0.24).add(v(-0.055,0)),heel,0.013,0.014);
      }
      // Carpal/tarsal cluster follows the angle of the palm/metatarsus.
      for(let i=0;i<3;i++) {
        const c=ankle.clone().lerp(toe,0.04+i*0.105);
        piece(c.clone().add(v(0,-0.018)),c.clone().add(v(0,0.018)),0.034-i*0.003,0.042-i*0.004);
      }
      for(let i=0;i<4;i++) {
        const spread=(i-1.5)*0.033;
        const length=(i===0||i===3)?0.077:0.095;
        const start=toe.clone().add(v(0,0,spread));
        const middle=start.clone().add(v(Math.cos(toeAngle)*length*0.40,Math.sin(toeAngle)*length*0.40,0));
        const second=start.clone().add(v(Math.cos(toeAngle)*length*0.73,Math.sin(toeAngle)*length*0.73-0.002,0));
        const end=start.clone().add(v(Math.cos(toeAngle)*length,Math.sin(toeAngle)*length-0.004,0));
        piece(ankle.clone().lerp(toe,0.34).add(v(0,0,spread*0.35)),start,0.013,0.012);
        // Each toe has proximal, middle and distal phalangeal forms.
        piece(start,middle,0.023,0.021);
        piece(middle,second,0.020,0.020);
        piece(second,end,0.019,0.019);
        piece(middle.clone().add(v(0,-0.012)),middle.clone().add(v(0,0.012)),0.022,0.021);
        piece(second.clone().add(v(0,-0.011)),second.clone().add(v(0,0.011)),0.020,0.020);
      }
      if(leg.front) {
        const dewBase=ankle.clone().lerp(toe,0.28).add(v(-0.012,0.015,-leg.side*0.048));
        const dewTip=dewBase.clone().add(v(-0.027,-0.035,-leg.side*0.013));
        piece(dewBase,dewTip,0.016,0.014);
      }
      leg.details(parts);
      // The radius/ulna and tibia/fibula stay parallel inside the outer volumes.
      const bones=[];
      for(const lateral of [-0.021,0.021]) {
        bones.push({start:joint.clone().add(v(0,0,lateral)),end:ankle.clone().add(v(0,0,lateral*0.6)),width:0.016,depth:0.013});
      }
      bones.push({start:base,end:joint,width:0.022,depth:0.022});
      bones.push({start:ankle,end:toe,width:0.015,depth:0.015});
      leg.internalBones(bones);
      updateLine(leg.bone,[pivot,base,joint,ankle,toe,tip]);
      leg.contact.visible=stride.planted;
      leg.contact.position.set(toe.x,0,toe.z);
    }
  }
  return {cat,skeleton,pose,updateContour:surface.updateContour};
}
