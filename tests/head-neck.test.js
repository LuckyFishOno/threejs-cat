import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCat} from '../src/cat-rig.js';
import {headNeckPose} from '../src/head-neck.js';
import {spinePose} from '../src/gait.js';

test('skull and both cupped ears stay rigid in the head frame while the thorax flexes',()=>{
  const scene=new THREE.Scene(),rig=createCat(scene),mesh=scene.getObjectByName('continuous-feline-skin');
  let rest;
  for(let i=0;i<100;i++){
    const p=i/100,spine=spinePose(p),{head,pitch}=headNeckPose(p,spine);
    rig.pose(p);
    assert.ok(Math.hypot(head.x-spine[8].x,head.y-spine[8].y)<.19);
    const pts=mesh.userData.skullVertices.map(id=>{
      const attr=mesh.geometry.attributes.position,x=attr.getX(id)-head.x,y=attr.getY(id)-head.y;
      return [x*Math.cos(pitch)+y*Math.sin(pitch),-x*Math.sin(pitch)+y*Math.cos(pitch),attr.getZ(id)];
    });
    if(!rest)rest=pts;
    else pts.forEach((v,k)=>v.forEach((n,j)=>assert.ok(Math.abs(n-rest[k][j])<2e-6)));
  }
});

test('facial triangles cross the muzzle without a radial convergence vertex',()=>{
  const scene = new THREE.Scene();
  const rig = createCat(scene);
  rig.pose(.28);
  const mesh = scene.getObjectByName('continuous-feline-skin');
  const triangles = mesh.geometry.index.array;
  const neighbors = new Map();
  for (let i = 0; i < triangles.length; i += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const vertex = triangles[i + corner];
      if (!neighbors.has(vertex)) neighbors.set(vertex, new Set());
      neighbors.get(vertex).add(triangles[i + (corner + 1) % 3]);
      neighbors.get(vertex).add(triangles[i + (corner + 2) % 3]);
    }
  }
  for (const vertex of mesh.userData.faceVertices) {
    assert.ok(neighbors.get(vertex).size <= 8, 'face edges converge into a radial pole');
  }
});

test('head keeps a cat silhouette: broad cheeks, short muzzle and upright mirrored ears',()=>{
  const scene=new THREE.Scene(),rig=createCat(scene),mesh=scene.getObjectByName('continuous-feline-skin');
  const spine=spinePose(0),{head,pitch}=headNeckPose(0,spine),attr=mesh.geometry.attributes.position;
  rig.pose(0);
  const local=id=>{
    const x=attr.getX(id)-head.x,y=attr.getY(id)-head.y;
    return [x*Math.cos(pitch)+y*Math.sin(pitch),-x*Math.sin(pitch)+y*Math.cos(pitch),attr.getZ(id)];
  };
  const skull=mesh.userData.faceVertices.concat(mesh.userData.skullRingVertices).map(local);
  const ears=mesh.userData.earVertices.map(local);
  for(const [x,y,z] of ears){
    assert.ok(ears.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]+z)<1e-5),'ears are not mirrored across the midline');
  }
  const span=(set,k)=>Math.max(...set.map(p=>p[k]))-Math.min(...set.map(p=>p[k]));
  const crown=Math.max(...skull.map(p=>p[1])),nose=Math.max(...skull.map(p=>p[0]));
  const chin=Math.min(...mesh.userData.faceVertices.map(id=>local(id)[1]));
  const width=span(skull,2),height=crown-chin;
  assert.ok(width>height*1.05&&width<height*1.35,'head should be a little wider than it is tall');
  // The muzzle is a small box in front of the cheeks, not a long snout.
  const widest=skull.reduce((a,p)=>Math.abs(p[2])>Math.abs(a[2])?p:a);
  assert.ok(nose-widest[0]>.10&&nose-widest[0]<.22);
  const tip=ears.reduce((a,p)=>p[1]>a[1]?p:a);
  const rise=tip[1]-crown;
  assert.ok(rise>height*.28&&rise<height*.45,'ear height should be about a third of the head height');
  assert.ok(Math.abs(tip[2])>width*.33&&Math.abs(tip[2])<width*.5,'ear tips sit above the sides of the head');
  // Each ear is a broad triangle: about as wide at its base as it is tall.
  const left=ears.filter(p=>p[2]>0),base=left.filter(p=>p[1]<crown);
  assert.ok(span(base,2)>rise*.75,'ear base is too narrow for its height');
});
