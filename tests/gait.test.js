import test from 'node:test';
import assert from 'node:assert/strict';
import { pawCycle, legPose, legTiming, spinePose, STANCE, STRIDE } from '../src/gait.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));
const close=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

// Sample the actual pose functions used by the renderer, including both
// scapulae and both hindlimbs, not a duplicate of their implementation.
test('all bones keep their length; paws clear the floor; elbows and knees stay below their proximal joints',()=>{
  for(let i=0;i<=5000;i++) for(const front of [false,true]) for(const side of [-1,1]) {
    const leg=legPose(i/5000,front,side);
    close(distance(leg.base,leg.joint),leg.upperLength);
    close(distance(leg.joint,leg.ankle),leg.lowerLength);
    close(distance(leg.ankle,leg.toe),leg.distalLength);
    close(distance(leg.pivot,leg.base),front?0.325:0.135);
    assert.ok(leg.toe.y>=0.055-1e-10);
    assert.ok(leg.tip.y>=0.03);
    assert.ok(leg.joint.y<leg.base.y);
  }
});

test('lumbar vertebrae keep their length and the thorax remains rigid while the back bends',()=>{
  for(let i=0;i<1000;i++) {
    const spine=spinePose(i/1000);
    for(let j=0;j<8;j++) close(distance(spine[j],spine[j+1]),0.185);
    const angles=[5,6,7].map(j=>Math.atan2(spine[j+1].y-spine[j].y,spine[j+1].x-spine[j].x));
    close(angles[0],angles[1]); close(angles[1],angles[2]);
  }
});

test('every stance paw stays on the floor and moves at the ground velocity',()=>{
  for(const front of [false,true]) for(let p=0.005;p<STANCE-0.002;p+=0.005) {
    const a=pawCycle(p,0,front), b=pawCycle(p+0.0001,0,front);
    assert.equal(a.planted,true); close(a.y,b.y);
    close((b.x-a.x)/0.0001,-STRIDE);
  }
});

test('paws preserve position, angle, and velocity at touchdown and lift-off',()=>{
  const e=1e-7;
  for(const front of [false,true]) for(const boundary of [0,STANCE,1]) {
    const a=pawCycle(boundary-e,0,front), b=pawCycle(boundary,0,front), c=pawCycle(boundary+e,0,front);
    assert.ok(distance(a,c)<1e-5);
    assert.ok(Math.abs(a.angle-c.angle)<1e-5);
    close((b.x-a.x)/e,(c.x-b.x)/e,1e-3);
    close((b.y-a.y)/e,(c.y-b.y)/e,1e-3);
    close((b.angle-a.angle)/e,(c.angle-b.angle)/e,1e-3);
  }
});

test('the gallop has staggered footfalls and two distinct suspension intervals',()=>{
  // The forefeet land further apart in time than the hindfeet.
  close(Math.abs(legTiming(false,-1)-legTiming(false,1)),0.10);
  close(Math.abs(legTiming(true,-1)-legTiming(true,1)),0.16);
  const planted=p=>[false,true].flatMap(f=>[-1,1].map(s=>legPose(p,f,s).stride.planted));
  assert.ok(planted(0.03).every(x=>!x));
  assert.ok(planted(0.50).every(x=>!x));
  assert.equal(legPose(0.28,true,1).stride.planted,true);
  assert.equal(legPose(0.28,false,1).stride.planted,false);
  assert.equal(legPose(0.72,false,1).stride.planted,true);
  assert.equal(legPose(0.72,true,1).stride.planted,false);
});

test('pads plant under the body and the hind paw clears the forepaw in recovery',()=>{
  for(const side of [-1,1]) {
    const plantedZ=new Map();
    for(let i=0;i<1000;i++) {
      const phase=i/1000;
      const fore=legPose(phase,true,side), hind=legPose(phase,false,side);
      for(const [name,leg] of [['fore',fore],['hind',hind]]) {
        if(!leg.stride.planted)continue;
        assert.ok(leg.toe.z*side>0 && leg.toe.z*side<=leg.base.z*side);
        assert.ok(leg.base.z*side<.21);
        if(plantedZ.has(name))close(leg.toe.z,plantedZ.get(name));
        plantedZ.set(name,leg.toe.z);
      }
      if(Math.hypot(hind.toe.x-fore.toe.x,hind.toe.y-fore.toe.y)<.12){
        assert.ok((hind.toe.z-fore.toe.z)*side>.09);
        assert.ok(distance(hind.toe,fore.toe)>.12);
      }
    }
    assert.equal(plantedZ.size,2);
  }
});

test('the forepaw folds at the wrist while the hindpaw extends back then sweeps under the belly',()=>{
  assert.ok(pawCycle(0.42,0,true).angle<-Math.PI*0.8);
  assert.ok(legPose(0.03,false,1).toe.x<-1.0);
  assert.ok(legPose(0.50,false,1).toe.x>0);
  const extended=spinePose(0.03), gathered=spinePose(0.50);
  assert.ok(extended.at(-1).x-extended[0].x>gathered.at(-1).x-gathered[0].x);
});

test('all joints loop with continuous position and velocity',()=>{
  const e=1e-6;
  for(const front of [false,true]) for(const side of [-1,1]) {
    const a=legPose(-e,front,side), b=legPose(0,front,side), c=legPose(e,front,side), d=legPose(1,front,side);
    for(const key of ['pivot','base','joint','ankle','toe','tip']) {
      assert.ok(distance(b[key],d[key])<1e-12);
      for(const axis of ['x','y','z']) close((b[key][axis]-a[key][axis])/e,(c[key][axis]-b[key][axis])/e,0.002);
    }
  }
});

test('push-off unfolds into a hind stretch with the forelegs still bent, followed by a gathered suspension',()=>{
  const folded=legPose(0.82,true,1), pushing=legPose(0.82,false,1);
  assert.ok(folded.distalAngle < -2.25);
  assert.ok(pushing.stride.planted && pushing.toe.x < pushing.base.x);
  const early=legPose(0.029,true,-1), late=legPose(0.029,true,1);
  const extendedHind=legPose(0.029,false,1);
  const bend=leg=>{
    const a=leg.upperLength, b=leg.lowerLength, d=distance(leg.base,leg.ankle);
    return Math.acos((a*a+b*b-d*d)/(2*a*b))*180/Math.PI;
  };
  // The hind leg trails at nearly full stretch.
  assert.ok(bend(extendedHind)>164 && bend(extendedHind)<175);
  // The forelegs are not locked straight with it. The later one hangs bent
  // under the chin; the earlier one has begun to reach down for the ground.
  assert.ok(bend(late)>70 && bend(late)<110);
  assert.ok(bend(early)>bend(late)+20 && bend(early)<160);
  const nose=spinePose(0.029)[8].x+0.118+0.225;
  assert.ok(late.tip.x>nose-0.25 && late.tip.x<nose+0.08);
  assert.ok(early.tip.x>late.tip.x && early.tip.x<nose+0.28);
  // Toe tip to toe tip, for limbs sized to a house cat.
  assert.ok(late.tip.x - extendedHind.tip.x > 2.6);
  assert.ok(early.toe.y < late.toe.y - 0.12);
  for(const side of [-1,1]) assert.ok(legPose(0.04,false,side).toe.x < -1.40);
  // A recovering hindpaw overtakes a withdrawing forepaw under the belly.
  // The first forefoot now leaves the ground earlier, so they pass sooner.
  assert.ok(legPose(0.44,false,1).toe.x > legPose(0.44,true,-1).toe.x);
});

test('rendered paws and joints travel smoothly through suspension without a reach snap',()=>{
  const h=1/1000;
  for(const front of [false,true]) for(const side of [-1,1]) {
    let before=legPose(-h,front,side), now=legPose(0,front,side);
    for(let i=1;i<=1000;i++) {
      const next=legPose(i*h,front,side);
      for(const name of ['joint','ankle','toe']) {
        const a=before[name], b=now[name], c=next[name];
        // The old simultaneous straightening drove a paw beyond five times
        // ground speed in suspension. Bound speed and acceleration in 3D.
        assert.ok(distance(b,c)/h < 1.8*STRIDE);
        const acceleration=Math.hypot(c.x-2*b.x+a.x,c.y-2*b.y+a.y,c.z-2*b.z+a.z)/(h*h);
        assert.ok(acceleration < 60*STRIDE);
      }
      before=now;
      now=next;
    }
  }
});
