import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCat } from '../src/cat-rig.js';
import { legPose, pawCycle, legTiming, spinePose, tailPose, touchX, DUTY, STRIDE } from '../src/walk.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));
const close=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const legs=[[false,1],[false,-1],[true,1],[true,-1]];

test('walk: bones keep their length, joints stay bent and below the shoulder and hip',()=>{
  for(let i=0;i<=2000;i++) for(const [front,side] of legs) {
    const leg=legPose(i/2000,front,side);
    close(distance(leg.base,leg.joint),leg.upperLength);
    close(distance(leg.joint,leg.ankle),leg.lowerLength);
    close(distance(leg.ankle,leg.toe),leg.distalLength);
    assert.ok(leg.joint.y<leg.base.y);
    assert.ok(leg.toe.y>=0.055-1e-10);
    assert.ok(leg.tip.y>=0.03);
    // Never locked straight: the elbow or knee keeps some bend.
    assert.ok(leg.upperLength+leg.lowerLength-distance(leg.base,leg.ankle)>0.005);
  }
});

test('walk: lateral sequence with two or three paws always down and no suspension',()=>{
  // Left hind, left fore, right hind, right fore, a quarter stride apart.
  const order=[[false,1],[true,1],[false,-1],[true,-1]].map(([f,s])=>legTiming(f,s));
  order.forEach((t,i)=>close(t,i*0.25));
  for(let i=0;i<1000;i++) {
    const down=legs.filter(([f,s])=>legPose(i/1000,f,s).stride.planted).length;
    assert.ok(down>=2&&down<=3,`${down} paws down at ${i/1000}`);
  }
});

test('walk: planted paws move with the ground; touchdown and lift-off are smooth',()=>{
  for(const front of [false,true]) {
    for(let p=0.005;p<DUTY-0.002;p+=0.005) {
      const a=pawCycle(p,0,front),b=pawCycle(p+1e-4,0,front);
      assert.equal(a.planted,true); close(a.y,b.y); close((b.x-a.x)/1e-4,-STRIDE,1e-6);
    }
  }
  // Every joint of every leg passes touchdown and lift-off without a jump in
  // position or velocity.
  const e=1e-6;
  for(const [front,side] of legs) for(const boundary of [0,DUTY]) {
    const t=legTiming(front,side)+boundary;
    const a=legPose(t-e,front,side),b=legPose(t,front,side),c=legPose(t+e,front,side);
    for(const key of ['joint','ankle','toe','tip']) {
      assert.ok(distance(a[key],c[key])<1e-4);
      for(const axis of ['x','y','z']) close((b[key][axis]-a[key][axis])/e,(c[key][axis]-b[key][axis])/e,2e-2);
    }
  }
});

test('walk: spine links keep their length and the tail stays in the vertical plane',()=>{
  let minZ=Infinity,maxZ=-Infinity;
  for(let i=0;i<500;i++) {
    const spine=spinePose(i/500);
    for(let j=0;j<8;j++) close(distance(spine[j],spine[j+1]),0.185);
    const tip=tailPose(i/500).points.at(-1);
    minZ=Math.min(minZ,tip.z);maxZ=Math.max(maxZ,tip.z);
  }
  assert.ok(maxZ-minZ<.06);
});

test('walk: visible skin clears the floor and does not snap through the stride',()=>{
  const scene=new THREE.Scene(),rig=createCat(scene),g=scene.getObjectByName('continuous-feline-skin').geometry;
  const used=[...new Set(g.index.array)],a=g.attributes.position.array;
  rig.pose(1-1/600,'walk');const before=a.slice();
  for(let i=0;i<600;i++){
    rig.pose(i/600,'walk');
    for(const id of used){const j=id*3;
      assert.ok(Number.isFinite(a[j])&&a[j+1]>-.001);
      assert.ok(Math.hypot(a[j]-before[j],a[j+1]-before[j+1],a[j+2]-before[j+2])<.022);
    }
    before.set(a);
  }
});

// Measurements of cats walking overground, scaled by hip height
// (references/RESEARCH.md, study 020).
const angle=(a,b,c)=>{const u=[a.x-b.x,a.y-b.y,a.z-b.z],v=[c.x-b.x,c.y-b.y,c.z-b.z];
  return Math.acos((u[0]*v[0]+u[1]*v[1]+u[2]*v[2])/Math.hypot(...u)/Math.hypot(...v))*180/Math.PI;};
test('walk: paws are placed as measured on walking cats',()=>{
  // The hind paw comes down on the print the forepaw of the same side left.
  const print=touchX(true)-STRIDE*0.75;
  assert.ok(Math.abs(touchX(false)-print)<0.06,`hind paw lands ${touchX(false)-print} from the print`);
  // Hind paw: lands about 0.45 hip heights ahead of the hip, leaves further behind it.
  const down=legPose(0,false,1),up=legPose(DUTY-1e-6,false,1),hipHeight=down.base.y;
  const ahead=(down.toe.x-down.base.x)/hipHeight,behind=(up.base.x-up.toe.x)/hipHeight;
  assert.ok(ahead>0.40&&ahead<0.55&&behind>ahead&&behind<0.72,`${ahead} ${behind}`);
  // Forepaw: lands a little ahead of the shoulder and leaves well behind it.
  const reach=legPose(0.25,true,1),leave=legPose(0.25+DUTY-1e-6,true,1);
  const lean=l=>Math.atan2(l.toe.x-l.base.x,l.base.y-l.toe.y)*180/Math.PI;
  assert.ok(lean(reach)>18&&lean(reach)<30,`${lean(reach)}`);
  assert.ok(lean(leave)<-30&&lean(leave)>-48,`${lean(leave)}`);
  // Left and right prints are only about an eighth of the hip height apart.
  for(const front of [false,true]) {
    const width=legPose(legTiming(front,1)+0.1,front,1).toe.z-legPose(legTiming(front,-1)+0.1,front,-1).toe.z;
    assert.ok(width/hipHeight>0.08&&width/hipHeight<0.16,`${width/hipHeight}`);
  }
  // The hips sink by a few percent of their height through each hind stance.
  let low=Infinity,high=-Infinity;
  for(let i=0;i<400;i++){const y=legPose(i/400,false,1).base.y;low=Math.min(low,y);high=Math.max(high,y);}
  assert.ok((high-low)/hipHeight>0.02&&(high-low)/hipHeight<0.05);
});

test('walk: joints fold and open in the measured order and range',()=>{
  const sample=(front,n=400)=>Array.from({length:n},(_,i)=>{
    const leg=legPose(legTiming(front,1)+i/n,front,1);
    return {p:i/n,middle:angle(leg.base,leg.joint,leg.ankle),distal:angle(leg.joint,leg.ankle,leg.toe)};
  });
  const least=(list,key)=>list.reduce((a,b)=>a[key]<b[key]?a:b),most=(list,key)=>list.reduce((a,b)=>a[key]>b[key]?a:b);
  const fore=sample(true),hind=sample(false);
  const stance=list=>list.filter(q=>q.p<DUTY),swing=list=>list.filter(q=>q.p>=DUTY);
  // Elbow: folds to about 80 degrees in the swing and is straightest as the paw leaves.
  const elbow=least(swing(fore),'middle');
  assert.ok(elbow.middle>65&&elbow.middle<92,`${elbow.middle}`);
  assert.ok(most(fore,'middle').p>0.5&&most(fore,'middle').p<0.7);
  // Wrist: folds by 40 to 70 degrees early in the swing.
  const wrist=least(swing(fore),'distal');
  assert.ok(wrist.distal>110&&wrist.distal<140&&wrist.p<DUTY+0.25,`${wrist.distal} at ${wrist.p}`);
  // Knee and hock give as the paw takes weight, open to push off, fold in swing.
  for(const key of ['middle','distal']) {
    const start=hind[0][key],give=least(stance(hind),key),push=most(hind.filter(q=>q.p>0.4&&q.p<0.7),key),fold=least(swing(hind),key);
    assert.ok(give[key]<start-5&&give.p>0.1&&give.p<0.4,`${key} gives ${start-give[key]} at ${give.p}`);
    assert.ok(push[key]>start+5,`${key} opens to ${push[key]} from ${start}`);
    assert.ok(fold[key]<give[key]-5&&fold[key]>65,`${key} folds to ${fold[key]}`);
  }
});

test('walk: no two legs come close enough to pass through each other',()=>{
  for(let i=0;i<400;i++) {
    const poses=legs.map(([f,s])=>legPose(i/400,f,s));
    for(let a=0;a<4;a++) for(let b=a+1;b<4;b++) for(const ka of ['ankle','toe','tip']) for(const kb of ['ankle','toe','tip'])
      assert.ok(distance(poses[a][ka],poses[b][kb])>0.09,`${ka}/${kb} of legs ${a},${b} at ${i/400}`);
  }
});
