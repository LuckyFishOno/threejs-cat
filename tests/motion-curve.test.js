import test from 'node:test';
import assert from 'node:assert/strict';
import {motionCurve} from '../src/motion-curve.js';
import {bodyPose,pawCycle,STANCE} from '../src/gait.js';

function accelerationJump(sample,p,e=1e-4) {
  // Fourth-order one-sided stencils avoid subtracting tiny second differences
  // at near-zero contact acceleration while staying on each side of a knot.
  const weights=[35,-104,114,-56,11];
  const oneSide=direction=>weights.reduce((sum,w,i)=>sum+w*sample(p+direction*i*e),0)/(12*e*e);
  return Math.abs(oneSide(-1)-oneSide(1));
}

test('clamped spatial curves reproduce a known cubic without shape errors',()=>{
  const curve=motionCurve([[0,0],[0.2,0.008],[0.6,0.216],[1,1]],{startSlope:[0],endSlope:[3]});
  for(let i=0;i<=100;i++)assert.ok(Math.abs(curve(i/100)[0]-(i/100)**3)<1e-12);
});

test('body position, pitch and flexion share acceleration across every authored pose and cycle wrap',()=>{
  for(const phase of [0,0.16,0.30,0.46,0.60,0.76,0.89,1])for(const field of ['height','flex','pitch','pelvisPitch']) {
    const jump=accelerationJump(p=>bodyPose(p)[field],phase);
    assert.ok(jump<0.01,`${field} has an acceleration jump at ${phase}: ${jump}`);
  }
});

test('paw transitions share acceleration at contact, lift-off and all intermediate poses',()=>{
  const knots=[0,...Array.from({length:11},(_,i)=>STANCE+(1-STANCE)*i/10)];
  for(const front of [false,true])for(const phase of knots)for(const field of ['x','y','angle','toeAngle','trackShift']) {
    const jump=accelerationJump(p=>pawCycle(p,0,front)[field],phase);
    assert.ok(jump<0.12,`paw ${field} has an acceleration jump at ${phase}: ${jump}`);
  }
});
