import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCat } from '../src/cat-rig.js';

test('all detailed anatomical geometry remains finite throughout the motion',()=>{
  const scene=new THREE.Scene();
  const rig=createCat(scene);
  for(let i=0;i<=100;i++) {
    rig.pose(i/100);
    const checked=new Set();
    scene.traverse(object=>{
      if(!object.geometry||checked.has(object.geometry))return;
      const geometry=object.geometry;
      checked.add(geometry);
      for(const value of geometry.attributes.position.array) assert.ok(Number.isFinite(value));
      if(geometry.index) {
        const count=Math.min(geometry.index.count,geometry.drawRange.count);
        for(let j=0;j<count;j++)assert.ok(geometry.index.array[j]<geometry.attributes.position.count);
      }
    });
  }
});

test('pose updates reuse scene objects, geometry and position buffers',()=>{
  const scene=new THREE.Scene();
  const rig=createCat(scene);
  const objects=[],buffers=[];
  scene.traverse(object=>{objects.push(object);if(object.geometry)buffers.push(object.geometry.attributes.position.array);});
  for(let i=0;i<100;i++)rig.pose(i/100);
  const after=[],afterBuffers=[];
  scene.traverse(object=>{after.push(object);if(object.geometry)afterBuffers.push(object.geometry.attributes.position.array);});
  assert.equal(objects.length,after.length);
  objects.forEach((object,i)=>assert.equal(object,after[i]));
  buffers.forEach((buffer,i)=>assert.equal(buffer,afterBuffers[i]));
});

test('the visible skin is a single closed triangle surface with consistently shared edges',()=>{
  const scene=new THREE.Scene(),rig=createCat(scene);rig.pose(.5);
  const meshes=[];scene.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});
  assert.equal(meshes.length,1);
  const idx=meshes[0].geometry.index.array,edges=new Map(),neighbors=new Map();
  for(let i=0;i<idx.length;i+=3)for(let j=0;j<3;j++){
    const a=idx[i+j],b=idx[i+(j+1)%3],k=Math.min(a,b)+':'+Math.max(a,b);
    const list=edges.get(k)||[];list.push(a);edges.set(k,list);
    if(!neighbors.has(a))neighbors.set(a,new Set());neighbors.get(a).add(b);
  }
  for(const pair of edges.values()){assert.equal(pair.length,2);assert.notEqual(pair[0],pair[1]);}
  const visited=new Set(),todo=[idx[0]];
  while(todo.length){const a=todo.pop();if(visited.has(a))continue;visited.add(a);todo.push(...neighbors.get(a));}
  assert.equal(visited.size,neighbors.size);
  assert.equal(visited.size-edges.size+idx.length/3,2);
});

test('visible skin clears the floor and does not snap as the limb planes change or the stride wraps',()=>{
  const scene=new THREE.Scene(),rig=createCat(scene),g=scene.getObjectByName('continuous-feline-skin').geometry;
  const used=[...new Set(g.index.array)],a=g.attributes.position.array;
  rig.pose(1-1/600);const before=a.slice();let grounded=false;
  for(let i=0;i<600;i++){
    rig.pose(i/600);
    for(const id of used){const j=id*3;
      assert.ok(a[j+1]>-.001);
      if(a[j+1]<.003)grounded=true;
      assert.ok(Math.hypot(a[j]-before[j],a[j+1]-before[j+1],a[j+2]-before[j+2])<.022);
    }
    before.set(a);
  }
  assert.ok(grounded);
});
