import * as THREE from 'three';
import {refineSurface} from './refine-surface.js';
import {materials} from './wire-geometry.js';
import {TAIL_ROOT} from './tail.js';
import {headLoops,loopRay,faceRay,castHead,earShell,earHeights} from './head-shape.js';
const TAU=Math.PI*2,N=16;
// Head size relative to the proportions drawn in head-shape.js.
export const HEAD_SCALE=1.134;
const mix=THREE.MathUtils.lerp;
const between=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:mix(a.z,b.z,t)});
const ease=t=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};

// Cross sections stay attached to fixed anatomical landmarks. Tail, trunk,
// skull and paws form one closed surface. A limb replaces faces in the flank:
// its first row uses the actual rim indices, not a tube buried in another tube.
const thorax=[
  // fractional vertebra, x offset, y offset, height radius, width radius
  // The croup narrows into the tail root instead of ending in a round cap.
  [0,TAIL_ROOT.x,TAIL_ROOT.y,.080,.076],[0,-.128,.002,.124,.108],[0,-.082,-.030,.178,.146],
  // The belly hangs nearly level from the chest back to the groin, with only
  // a slight tuck-up: the thighs are mostly inside the body's outline.
  [0,-.012,-.055,.220,.178],[.38,0,-.072,.250,.194],[.88,0,-.090,.264,.198],
  [1.41,0,-.100,.262,.194],[1.96,0,-.104,.254,.188],[2.51,0,-.104,.244,.182],
  [3.08,0,-.103,.241,.180],[3.65,0,-.101,.247,.184],[4.23,0,-.099,.255,.192],
  [4.79,0,-.104,.274,.198],[5.28,0,-.108,.286,.202],[5.78,0,-.106,.286,.202],
  [6.22,0,-.096,.266,.196],[6.65,0,-.078,.228,.184],[7.04,0,-.054,.184,.164],
  [7.36,0,-.027,.147,.145]
];
// Limb cross-sections from the shoulder or hip down to the toes: which bone
// the loop sits on and how far along it, then its radius in front of the
// bone, behind it, and to either side. Muscle and tendon lie mostly behind
// the bone (triceps and elbow point, calf, heel), so the two differ.
const UPPER=0,JOINT=1,LOWER=2,ANKLE=3,DISTAL=4,TOES=5;
const foreLimb=[
  [UPPER,.34,.110,.135,.086],[UPPER,.58,.098,.122,.080],[UPPER,.82,.080,.100,.070],
  [JOINT,0,.068,.090,.064],
  [LOWER,.16,.070,.078,.062],[LOWER,.40,.065,.066,.058],[LOWER,.66,.058,.058,.053],[LOWER,.88,.052,.053,.050],
  [ANKLE,0,.049,.058,.052],
  [DISTAL,.35,.045,.050,.055],[DISTAL,.78,.044,.054,.062],
  // Paw: arched over the knuckles, flat on its pads, longer than it is tall.
  [TOES,0,.043,.053,.068],[TOES,.50,.038,.055,.074],[TOES,1.00,.029,.049,.066],[TOES,1.35,.017,.031,.045],
];
// The thigh is a flat slab against the pelvis: its last number is the
// width on the inner side, the one before it the width on the outer side.
// The hamstrings run from the seat bones to below the knee, so the back of
// the thigh stays broad almost down to the knee instead of tapering early.
const hindLimb=[
  [UPPER,.34,.140,.176,.076,.110],[UPPER,.58,.142,.176,.074,.100],[UPPER,.82,.122,.152,.072,.084],
  [JOINT,0,.086,.112,.066,.068],
  [LOWER,.16,.068,.108,.064],[LOWER,.40,.058,.088,.057],[LOWER,.66,.049,.064,.050],[LOWER,.88,.044,.054,.046],
  [ANKLE,0,.043,.068,.047],
  [DISTAL,.35,.041,.048,.049],[DISTAL,.78,.041,.051,.056],
  [TOES,0,.041,.052,.062],[TOES,.50,.036,.055,.068],[TOES,1.00,.027,.049,.060],[TOES,1.35,.016,.031,.041],
];
export function createSurface(parent){
  const slots=[],cageFaces=[],rings=[],sockets=[];
  const slot=()=>{slots.push(0,0,0);return slots.length/3-1;};
  const ring=n=>Array.from({length:n},slot);
  const tri=(a,b,c)=>cageFaces.push(a,b,c);
  function tile(a,b,c,d,flip){
    if(flip){tri(a,c,d);tri(a,d,b);}else{tri(a,c,b);tri(b,c,d);}
  }
  function bridge(a,b,k=0){for(let j=0;j<a.length;j++){const h=(j+1)%a.length;tile(a[j],a[h],b[j],b[h],k%2);}}
  // Stitch a larger attachment loop into a lighter distal mesh without caps.
  function transition(a,b){
    let i=0,j=0;
    while(i<a.length||j<b.length){
      const u=(i+1)/a.length,w=(j+1)/b.length;
      const v=a[i%a.length],q=b[j%b.length];
      if(Math.abs(u-w)<1e-9){tile(v,a[(i+1)%a.length],q,b[(j+1)%b.length],i%2);i++;j++;}
      else if(u<w){tri(v,q,a[(i+1)%a.length]);i++;}
      else {tri(v,q,b[(j+1)%b.length]);j++;}
    }
  }
  const tailTip=slot(), tailRows=[];
  const samples=[31,30,28,26,24,22,20,18,16,14,12,10,8,6,4,2,1];
  for(const s of samples){const row=ring(8);tailRows.push(row);
    if(tailRows.length===1){for(let j=0;j<8;j++)tri(tailTip,row[j],row[(j+1)%8]);}
    else bridge(tailRows.at(-2),row,tailRows.length);
  }
  for(let i=0;i<thorax.length+headLoops.length;i++)rings.push(ring(N));
  const last=tailRows.at(-1),root=rings[0];
  for(let j=0;j<8;j++){const a=last[j],b=last[(j+1)%8],c=root[j*2],d=root[j*2+1],e=root[(j*2+2)%N];
    tri(a,c,d);tri(a,d,b);tri(b,d,e);}
  const neckCount=thorax.length;
  for(const side of [-1,1]){
    // The hind opening runs well forward along the flank, so the skin between
    // it and the thigh spans the fold from belly to knee.
    sockets.push({kind:'leg',front:false,side,lo:1,hi:8,min:1,max:7});
    sockets.push({kind:'leg',front:true,side,lo:12,hi:17,min:2,max:7});
    sockets.push({kind:'ear',side,lo:neckCount+1,hi:neckCount+4,min:1,max:4});
  }
  const blocked=(i,j)=>sockets.some(s=>i>=s.lo&&i<s.hi&&(s.side===1?j:N-1-j)>=s.min&&(s.side===1?j:N-1-j)<s.max);
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<N;j++)if(!blocked(i,j)){
    const h=(j+1)%N;tile(rings[i][j],rings[i][h],rings[i+1][j],rings[i+1][h],i%2);}
  // A triangulated facial sheet spans both cheeks. Its boundary stitches to
  // the cranium, while interior rows cross the nose instead of ending there.
  const faceGrid = Array.from({length: 9}, () => ring(9));
  const faceBoundary = [];
  for (let column = 4; column < 8; column++) faceBoundary.push(faceGrid[0][column]);
  for (let row = 0; row < 8; row++) faceBoundary.push(faceGrid[row][8]);
  for (let column = 8; column > 0; column--) faceBoundary.push(faceGrid[8][column]);
  for (let row = 8; row > 0; row--) faceBoundary.push(faceGrid[row][0]);
  for (let column = 0; column < 4; column++) faceBoundary.push(faceGrid[0][column]);
  transition(rings.at(-1), faceBoundary);
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      tile(faceGrid[row][column], faceGrid[row][column + 1],
        faceGrid[row + 1][column], faceGrid[row + 1][column + 1], row % 2);
    }
  }
  for(const s of sockets){
    s.rim=[];s.uv=[];
    const push=(x,a)=>{s.rim.push(rings[x][(N+a*s.side)%N]);const u=2*(x-s.lo)/(s.hi-s.lo)-1,v=1-2*(a-s.min)/(s.max-s.min);
      const r=Math.hypot(u,v);s.uv.push([u/r,v/r]);};
    for(let i=s.lo;i<s.hi;i++)push(i,s.min);
    for(let j=s.min;j<s.max;j++)push(s.hi,j);
    for(let i=s.hi;i>s.lo;i--)push(i,s.max);
    for(let j=s.max;j>s.min;j--)push(s.lo,j);
    if(s.kind==='leg'){
      s.cuff=[ring(s.rim.length),ring(s.rim.length)];
      bridge(s.rim,s.cuff[0]);bridge(s.cuff[0],s.cuff[1],1);
      s.distalUV=Array.from({length:12},(_,j)=>{
        const at=j*s.uv.length/12,k=Math.floor(at),f=at-k;
        const a=s.uv[k],b=s.uv[(k+1)%s.uv.length],u=mix(a[0],b[0],f),v=mix(a[1],b[1],f);
        const l=Math.hypot(u,v);return [u/l,v/l];});
    }
    const rows=s.kind==='ear'?earHeights.length:foreLimb.length;
    s.rows=[];let before=s.cuff?.[1]||s.rim;
    for(let i=0;i<rows;i++){const row=ring(s.distalUV?.length||before.length);s.rows.push(row);if(before.length===row.length)bridge(before,row,i);else transition(before,row);before=row;}
    s.end=slot();for(let j=0;j<before.length;j++)tri(before[j],before[(j+1)%before.length],s.end);
  }
  const cage=new Float32Array(slots.length),count=slots.length/3;
  const band=new Uint16Array(count),smoothing=new Float32Array(count).fill(.93);
  let bandId=0;
  function tag(row,smooth,thin=false){if(thin)bandId++;for(const id of row){smoothing[id]=smooth;if(thin)band[id]=bandId;}}
  tailRows.forEach(r=>tag(r,.55,true));
  for(const s of sockets){
    if(s.kind==='ear'){s.rows.forEach(row=>tag(row,.5));continue;}
    s.rows.forEach((row,i)=>tag(row,i>=10?0:i<5?1:.55,i>=5));
  }
  faceGrid.forEach(row => tag(row, .65));
  const refined=refineSurface(cageFaces,count,band,smoothing,new Set(rings[neckCount]));
  const faces=refined.faces;
  // The head is rigid, so its skin is shaped once in the head frame and only
  // moved afterwards. Skull and face vertices are cast onto the head solid:
  // first the cage, then every refined vertex that depends on them alone.
  const headRings=rings.slice(neckCount),ears=sockets.filter(s=>s.kind==='ear');
  const skullIds=[...headRings.flat(),...faceGrid.flat()];
  const headIds=[...skullIds,...ears.flatMap(s=>[...s.rows.flat(),s.end])];
  const local=new Float32Array(slots.length),rays=new Float32Array(slots.length),aims=new Float32Array(slots.length);
  const hit=[0,0,0];
  const aim=(id,ray)=>{
    rays.set(ray.slice(0,3),id*3);aims.set(ray.slice(3),id*3);
    local.set(castHead(...ray,hit),id*3);
  };
  headRings.forEach((row,i)=>row.forEach((id,j)=>aim(id,loopRay(i,j,N))));
  faceGrid.forEach((row,r)=>row.forEach((id,c)=>aim(id,faceRay(1-r/4,c/4-1))));
  for(const s of ears){
    const shell=earShell(s.rim.map(id=>[...local.subarray(id*3,id*3+3)]),s.side);
    shell.rows.forEach((row,i)=>row.forEach((p,j)=>local.set(p,s.rows[i][j]*3)));
    local.set(shell.tip,s.end*3);
  }
  const size=refined.count*3,headSkin=new Float32Array(size);
  refined.evaluate(local,headSkin);
  // A refined vertex belongs to a set when all of its weight comes from it.
  const within=ids=>{
    const mark=new Float32Array(slots.length),share=new Float32Array(size);
    for(const id of ids)mark[id*3]=1;
    refined.evaluate(mark,share);
    return Array.from({length:refined.count},(_,i)=>i).filter(i=>share[i*3]>1-1e-5);
  };
  const origin=new Float32Array(size),heading=new Float32Array(size);
  refined.evaluate(rays,origin);refined.evaluate(aims,heading);
  for(const i of within(skullIds)){
    const k=i*3;
    headSkin.set(castHead(origin[k],origin[k+1],origin[k+2],heading[k],heading[k+1],heading[k+2],hit),k);
  }
  const rigid=Uint32Array.from(within(headIds),i=>i*3);
  for(let i=0;i<local.length;i++)local[i]*=HEAD_SCALE;
  for(let i=0;i<size;i++)headSkin[i]*=HEAD_SCALE;
  // Orient the complete shell consistently, including mirrored branch loops.
  const adjacency=new Map(),neighbors=Array.from({length:faces.length/3},()=>[]);
  for(let f=0;f<neighbors.length;f++)for(let i=0;i<3;i++){
    const a=faces[f*3+i],b=faces[f*3+(i+1)%3],id=Math.min(a,b)+':'+Math.max(a,b);
    const e=adjacency.get(id);
    if(e){neighbors[e.f].push([f,e.a===a]);neighbors[f].push([e.f,e.a===a]);e.g=f;}
    else adjacency.set(id,{a,b,f});
  }
  const sign=new Int8Array(neighbors.length);sign[0]=1;const stack=[0];
  while(stack.length){const f=stack.pop();for(const [g,flip] of neighbors[f])if(!sign[g]){sign[g]=flip?-sign[f]:sign[f];stack.push(g);}}
  for(let i=0;i<sign.length;i++)if(sign[i]<0)[faces[3*i],faces[3*i+1]]=[faces[3*i+1],faces[3*i]];
  const entries=[...adjacency.values()],edges=entries.flatMap(e=>[e.a,e.b]);
  const positions=new Float32Array(refined.count*3),attr=new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage);
  function geom(indices){const g=new THREE.BufferGeometry();g.setAttribute('position',attr);g.setIndex(indices);return g;}
  const depth=new THREE.Mesh(geom(faces),materials.depth);depth.name='continuous-feline-skin';depth.renderOrder=-10;
  depth.userData.skullVertices=headIds;
  depth.userData.faceVertices = faceGrid.flat();
  depth.userData.skullRingVertices=headRings.flat();
  depth.userData.earVertices=ears.flatMap(s=>[...s.rows.flat(),s.end]);
  const wire=new THREE.LineSegments(geom(edges),materials.grid);
  const contourGeom=geom(new THREE.BufferAttribute(new Uint16Array(edges.length),1).setUsage(THREE.DynamicDrawUsage));
  const contour=new THREE.LineSegments(contourGeom,materials.ink);
  const facing=new Uint8Array(faces.length/3),eye=new THREE.Vector3();
  // Update the silhouette before WebGL uploads the index buffer, so fast paws
  // and their outline belong to the same frame.
  const lastEye=new THREE.Vector3(Infinity,Infinity,Infinity);let lastVersion=-1;
  const updateContour=(camera)=>{
    camera.getWorldPosition(eye);depth.worldToLocal(eye);
    if(lastVersion===attr.version && lastEye.distanceToSquared(eye)<1e-14)return;
    lastVersion=attr.version;lastEye.copy(eye);
    for(let i=0;i<facing.length;i++){
      const a=faces[i*3]*3,b=faces[i*3+1]*3,c=faces[i*3+2]*3;
      const x=positions[a],y=positions[a+1],z=positions[a+2];
      const ux=positions[b]-x,uy=positions[b+1]-y,uz=positions[b+2]-z;
      const vx=positions[c]-x,vy=positions[c+1]-y,vz=positions[c+2]-z;
      facing[i]=(uy*vz-uz*vy)*(eye.x-x)+(uz*vx-ux*vz)*(eye.y-y)+(ux*vy-uy*vx)*(eye.z-z)>0;
    }
    let n=0;const dst=contourGeom.index;
    for(const e of entries)if(facing[e.f]!==facing[e.g]){dst.array[n++]=e.a;dst.array[n++]=e.b;}
    dst.needsUpdate=true;contourGeom.setDrawRange(0,n);
  };
  for(const obj of [depth,wire,contour]){obj.frustumCulled=false;parent.add(obj);}
  const put=(id,x,y,z)=>{const k=id*3;cage[k]=x;cage[k+1]=y;cage[k+2]=z;};
  function update(spine,cranial,tail,legs,sway){
    const h=cranial.head,cp=Math.cos(cranial.pitch),sp=Math.sin(cranial.pitch);
    const headPoint=(id,x,y,z)=>put(id,h.x+x*cp-y*sp,h.y+x*sp+y*cp,z);
    const last=tail.points.at(-1);put(tailTip,last.x,last.y,last.z);
    samples.forEach((s,i)=>{
      const a=tail.points[s+1],b=tail.points[s-1],c=tail.points[s],len=Math.hypot(b.x-a.x,b.y-a.y);
      const nx=(a.y-b.y)/len,ny=(b.x-a.x)/len;
      tailRows[i].forEach((id,j)=>{const u=Math.cos(j*TAU/8)*tail.radii[s][0],v=Math.sin(j*TAU/8)*tail.radii[s][1];
        put(id,c.x+nx*u,c.y+ny*u,c.z+v);});
    });
    // Keep volume under the ribcage as the loin rounds; otherwise the belly
    // mirrors the crest exactly and reads as the underside of a bent pipe.
    const bend=Math.max(0,Math.atan2(spine[1].y-spine[0].y,spine[1].x-spine[0].x)
      -Math.atan2(spine[7].y-spine[6].y,spine[7].x-spine[6].x)-.18);
    // Each trunk loop rolls about the spine with its end of the body: the
    // hindquarters with the pelvis, the ribcage with the shoulders, easing to
    // level at the neck so the head is not carried along.
    const rollAt=t=>sway.hindRoll*(1-ease((t-.8)/3.4))+sway.foreRoll*ease((t-3.2)/2.4)*(1-ease((t-6.9)/.7));
    // A loaded foreleg pushes its shoulder blade up through the back.
    const bladeAt=(t,angle)=>{
      const around=Math.acos(Math.cos(angle)),load=sway.foreLoad[Math.sin(angle)<0?-1:1];
      return .036*load*Math.exp(-(((t-6.15)/.8)**2)-(((around-.60)/.42)**2));
    };
    // frame: x, spine y, spine z, loop centre y, height radius, width radius, roll, t
    const skin=(f,angle)=>{
      const lift=bladeAt(f[7],angle),y=f[3]-f[1]+(f[4]+lift)*Math.cos(angle),z=(f[5]+lift)*Math.sin(angle);
      const cos=Math.cos(f[6]),sin=Math.sin(f[6]);
      return [f[0],f[1]+y*cos-z*sin,f[2]+y*sin+z*cos];
    };
    const trunkFrames=thorax.map(([t,dx,dy,r,w],i)=>{
      const k=Math.floor(t),c=between(spine[k],spine[k+1],t-k);
      const belly=.048*bend*bend*Math.exp(-((t-3.4)**2)/4);
      const crest=.022*bend*bend*Math.exp(-((t-2.35)**2)/2.8);
      const frame=[c.x+dx,c.y,c.z,c.y+dy-belly+crest/2,r+belly+crest/2,w,rollAt(t),t];
      rings[i].forEach((id,j)=>put(id,...skin(frame,j*TAU/N)));
      return frame;
    });
    for(const id of headIds){const k=id*3;headPoint(id,local[k],local[k+1],local[k+2]);}
    for(const s of sockets){
      if(s.kind==='ear')continue;
      const leg=legs.find(l=>l.front===s.front&&l.side===s.side);
      const {base,joint,ankle,toe,tip,toeAngle}=leg;
      // Round the shared opening on the flank; its updated vertices are also
      // used by adjacent belly and back faces, so there is never a seam.
      for(let j=0;j<s.rim.length;j++){
        const [u,v]=s.uv[j],x=mix(s.lo,s.hi,(u+1)/2),k=Math.min(s.hi-1,Math.floor(x));
        const a=trunkFrames[k],b=trunkFrames[k+1],f=x-k;
        const angle=mix(s.min,s.max,(1-v)/2)*TAU/N;
        put(s.rim[j],...skin(a.map((value,n)=>mix(value,b[n],f)),s.side*angle));
      }
      const rounded=(a,b,c,ta,tb)=>between(b,between(between(b,a,ta),between(b,c,tb),.5),.56);
      const profile=s.front?foreLimb:hindLimb;
      // Hide near the hip follows the thigh bone only part of the way: the
      // root of the thigh stays with the pelvis while the knee swings, so the
      // flank drapes onto the thigh without folding back on itself.
      const hang=Math.atan2(base.y-leg.pivot.y,base.x-leg.pivot.x);
      const swing=Math.atan2(joint.y-base.y,joint.x-base.x)-hang;
      const femur=Math.hypot(joint.x-base.x,joint.y-base.y);
      const thigh=t=>{
        const follow=s.front?1:Math.min(1,.42+.72*t);
        const angle=hang+follow*Math.atan2(Math.sin(swing),Math.cos(swing));
        return {x:base.x+Math.cos(angle)*femur*t,y:base.y+Math.sin(angle)*femur*t,z:mix(base.z,joint.z,t)};
      };
      const centers=profile.map(([part,t])=>part===UPPER?thigh(t):part===JOINT?rounded(base,joint,ankle,.20,.18):
        part===LOWER?between(joint,ankle,t):part===ANKLE?rounded(joint,ankle,toe,.18,.28):
        part===DISTAL?between(ankle,toe,t):between(toe,tip,t));
      const up=centers[0];
      let upperAngle=0;
      for(let i=0;i<centers.length;i++){
        const before=i?centers[i-1]:base,after=centers[i+1]||tip,c=centers[i];
        // Bisect unit bone directions, so an unequal-length pair cannot pull
        // the joint's ring back through one of the two bones in a deep fold.
        const a=Math.atan2(c.y-before.y,c.x-before.x),b=Math.atan2(after.y-c.y,after.x-c.x);
        const ang=profile[i][0]===TOES?toeAngle:a+.5*Math.atan2(Math.sin(b-a),Math.cos(b-a));
        if(i===0)upperAngle=ang;
        const [,,front,back,outer,inner=outer]=profile[i],sin=Math.sin(ang),cos=Math.cos(ang);
        for(let j=0;j<s.distalUV.length;j++){const [u,v]=s.distalUV[j],r=(u>0?front:back)*u;
          put(s.rows[i][j],c.x-sin*r,c.y+cos*r,c.z+s.side*v*(v>0?outer:inner));}
      }
      for(let j=0;j<s.rim.length;j++){
        const [u,v]=s.uv[j],k=s.rim[j]*3;
        const r=(u>0?profile[0][2]:profile[0][3])*u;
        const x=up.x-Math.sin(upperAngle)*r,y=up.y+Math.cos(upperAngle)*r,z=up.z+s.side*v*(v>0?profile[0][4]:profile[0][5]??profile[0][4]);
        for(let i=0;i<2;i++){
          const t=(i+1)/3,bulge=Math.sin(t*Math.PI);
          put(s.cuff[i][j],mix(cage[k],x,t)+(.028*u-(s.front?0:.030)*(1-u)/2)*bulge,
            mix(cage[k+1],y,t)+.025*Math.max(0,v)*bulge,
            mix(cage[k+2],z,t)+s.side*(.012+.016*v)*bulge);
        }
      }
      // Toe tips close just under the paw's centre line, as a blunt rounded end.
      put(s.end,tip.x+.043*Math.cos(toeAngle)+.012*Math.sin(toeAngle),tip.y+.043*Math.sin(toeAngle)-.012*Math.cos(toeAngle),tip.z);
    }
    refined.evaluate(cage,positions);
    for(const k of rigid){
      const x=headSkin[k],y=headSkin[k+1];
      positions[k]=h.x+x*cp-y*sp;positions[k+1]=h.y+x*sp+y*cp;positions[k+2]=headSkin[k+2];
    }
    attr.needsUpdate=true;
  }
  return {update,updateContour};
}
