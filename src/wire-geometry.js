import * as THREE from 'three';

const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);
export const materials = {
  ink: new THREE.LineBasicMaterial({ color: 0xd8d9d4, transparent: true, opacity: 0.88 }),
  fine: new THREE.LineBasicMaterial({ color: 0xd8d9d4, transparent: true, opacity: 0.58 }),
  grid: new THREE.LineBasicMaterial({ color: 0xd8d9d4, transparent: true, opacity: 0.43 }),
  bone: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.80, depthTest: false }),
  depth: new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide }),
};

export function line(parent, points, material = materials.ink) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const object = new THREE.Line(geometry, material);
  object.frustumCulled = false;
  parent.add(object);
  return object;
}
export function updateLine(object, points) {
  const attr = object.geometry.attributes.position;
  points.forEach((p, i) => attr.setXYZ(i, p.x, p.y, p.z));
  attr.needsUpdate = true;
}

// Depth-only surfaces remove hidden edges without drawing any filled colour.
// This keeps small, overlapping anatomical forms readable as line geometry.
function volume(parent, positions, faceIndices, edgeIndices, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(faceIndices);
  const surface = new THREE.Mesh(geometry, materials.depth);
  surface.renderOrder = -10;
  surface.frustumCulled = false;
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', geometry.attributes.position);
  wireGeometry.setIndex(edgeIndices);
  const wire = new THREE.LineSegments(wireGeometry, material);
  wire.frustumCulled = false;
  parent.add(surface, wire);
  return { geometry, surface, wire };
}

export function ellipsoid(parent, scale, material = materials.ink, rings = 6, sides = 10, {latitudeEvery=1,longitudeEvery=1,triangulated=true}={}) {
  const group = new THREE.Group();
  parent.add(group);
  const positions = [], faces = [], edges = [];
  for (let i = 0; i <= rings; i++) {
    const a = i / rings * Math.PI;
    for (let j = 0; j < sides; j++) {
      const b = j / sides * Math.PI * 2;
      positions.push(Math.sin(a)*Math.cos(b)*scale.x, Math.cos(a)*scale.y, Math.sin(a)*Math.sin(b)*scale.z);
      if (i > 0 && i < rings && (triangulated||i%latitudeEvery===0)) edges.push(i*sides+j, i*sides+(j+1)%sides);
      if (i < rings) {
        const a0=i*sides+j, b0=i*sides+(j+1)%sides, c0=(i+1)*sides+j, d0=(i+1)*sides+(j+1)%sides;
        if(triangulated||j%longitudeEvery===0)edges.push(a0,c0);
        if(triangulated)edges.push(b0,c0);
        faces.push(a0,c0,b0,b0,c0,d0);
      }
    }
  }
  volume(group, new Float32Array(positions), faces, edges, material);
  return group;
}

export function scapula(parent, material=materials.fine) {
  const group = new THREE.Group();
  parent.add(group);
  const positions = new Float32Array([
    -0.13,-0.5,-0.035, 0.12,-0.5,-0.035, 0.025,0.5,-0.025,
    -0.13,-0.5,0.035, 0.12,-0.5,0.035, 0.025,0.5,0.025,
  ]);
  volume(group,positions,
    [0,2,1,3,4,5,0,1,3,1,4,3,1,2,4,2,5,4,2,0,5,0,3,5],
    [0,1,1,2,2,0,3,4,4,5,5,3,0,3,1,4,2,5],material);
  return group;
}

// Small joint/bone forms share one depth draw and one line draw per limb.
// Adding phalanges and carpal clusters therefore does not add a draw per bone.
export function ellipsoidBatch(parent, capacity=48, material=materials.fine, rings=4, sides=8) {
  const unit=[],cellFaces=[],cellEdges=[];
  for(let i=0;i<=rings;i++) for(let j=0;j<sides;j++) {
    const a=i/rings*Math.PI,b=j/sides*Math.PI*2;
    unit.push(Math.sin(a)*Math.cos(b),Math.cos(a)*0.5,Math.sin(a)*Math.sin(b));
    const k=i*sides+j,next=i*sides+(j+1)%sides;
    if(i>0&&i<rings)cellEdges.push(k,next);
    if(i<rings){cellEdges.push(k,k+sides,next,k+sides);cellFaces.push(k,k+sides,next,next,k+sides,next+sides);}
  }
  const vertices=unit.length/3,positions=new Float32Array(capacity*unit.length),faces=[],edges=[];
  for(let i=0;i<capacity;i++) {
    faces.push(...cellFaces.map(index=>index+i*vertices));
    edges.push(...cellEdges.map(index=>index+i*vertices));
  }
  const object=volume(parent,positions,faces,edges,material);
  return (items)=>{
    if(items.length>capacity)throw new Error('Joint batch capacity exceeded');
    for(let i=0;i<items.length;i++) {
      const {start,end,width,depth}=items[i];
      let tx=end.x-start.x,ty=end.y-start.y,tz=end.z-start.z;
      const length=Math.hypot(tx,ty,tz)||1e-8;
      tx/=length;ty/=length;tz/=length;
      const planar=Math.hypot(tx,ty);
      const nx=planar>1e-9?ty/planar:1,ny=planar>1e-9?-tx/planar:0;
      const bx=ny*tz,by=-nx*tz,bz=nx*ty-ny*tx;
      const cx=(start.x+end.x)/2,cy=(start.y+end.y)/2,cz=(start.z+end.z)/2;
      for(let j=0;j<vertices;j++) {
        const k=j*3,offset=(i*vertices+j)*3;
        const x=unit[k]*width,y=unit[k+1]*length,z=unit[k+2]*depth;
        positions[offset]=cx+nx*x+tx*y+bx*z;
        positions[offset+1]=cy+ny*x+ty*y+by*z;
        positions[offset+2]=cz+tz*y+bz*z;
      }
    }
    object.geometry.setDrawRange(0,items.length*cellFaces.length);
    object.wire.geometry.setDrawRange(0,items.length*cellEdges.length);
    object.geometry.attributes.position.needsUpdate=true;
  };
}

export function orient(object, start, end, width = 1, depth = 1) {
  object.position.copy(start).lerp(end,0.5);
  const direction = end.clone().sub(start);
  object.quaternion.setFromUnitVectors(v(0,1),direction.clone().normalize());
  object.scale.set(width,direction.length(),depth);
}
