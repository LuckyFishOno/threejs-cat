import test from 'node:test';
import assert from 'node:assert/strict';
import {tailPose,TAIL_LENGTH,TAIL_SEGMENTS} from '../src/tail.js';
import {spinePose} from '../src/gait.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const pitch=(a,b)=>Math.atan2(b.y-a.y,a.x-b.x);
test('tail attaches behind the sacrum and preserves its arc length through the stride',()=>{
  for(let i=0;i<240;i++){
    const phase=i/240,rear=spinePose(phase)[0],t=tailPose(phase),root=t.points[0];
    assert.ok(root.x<rear.x && distance(root,rear)<.17);
    let length=0;for(let j=1;j<t.points.length;j++)length+=distance(t.points[j],t.points[j-1]);
    assert.ok(Math.abs(length-TAIL_LENGTH)<1e-9);
    assert.ok(t.points.every(p=>p.y>.52));
  }
});
test('tail has a full shaft, a short round cap and backward-travelling curvature',()=>{
  const {radii}=tailPose(0);assert.ok(radii[Math.floor(.90*TAIL_SEGMENTS)][0]/radii[2][0]>.76);
  assert.ok(radii.at(-2)[0]>.04);assert.deepEqual(radii.at(-1),[0,0]);
  let curls=0,low=Infinity,high=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(let i=0;i<240;i++){
    const p=tailPose(i/240).points,base=pitch(p[0],p[2]),end=pitch(p.at(-3),p.at(-1));
    if(base>.20&&end<-.08)curls++;
    const h=p.at(-1).y-p[0].y;low=Math.min(low,h);high=Math.max(high,h);
    minZ=Math.min(minZ,p.at(-1).z);maxZ=Math.max(maxZ,p.at(-1).z);
    for(let j=1;j<p.length-1;j++)assert.ok(Math.abs(pitch(p[j-1],p[j])-pitch(p[j],p[j+1]))<.08);
  }
  assert.ok(curls>10);assert.ok(high-low>.16 && high-low<.45);assert.ok(maxZ-minZ<.06);
});
test('tail loops continuously in position and velocity, independent of playback history',()=>{
  const e=1e-5,a=tailPose(-e).points,b=tailPose(0).points,c=tailPose(e).points;
  tailPose(.57);const end=tailPose(1).points;
  b.forEach((p,i)=>{
    assert.ok(distance(p,end[i])<1e-9);
    for(const axis of ['x','y','z'])assert.ok(Math.abs((c[i][axis]+a[i][axis]-2*p[axis])/e)<.002);
  });
});
