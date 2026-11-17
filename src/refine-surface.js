// One adaptive Loop subdivision step. Build the weights and index buffers
// once; evaluate the same stencils every pose so wire edges never crawl.
export function refineSurface(cageFaces, count, band, smoothing, fixed){
  const adjacency=Array.from({length:count},()=>new Set()),edges=new Map();
  const key=(a,b)=>Math.min(a,b)*count+Math.max(a,b);
  for(let i=0;i<cageFaces.length;i+=3)for(let j=0;j<3;j++){
    const a=cageFaces[i+j],b=cageFaces[i+(j+1)%3],opposite=cageFaces[i+(j+2)%3];
    const id=key(a,b);adjacency[a].add(b);adjacency[b].add(a);
    if(edges.has(id))edges.get(id).opposite.push(opposite);
    else edges.set(id,{a,b,opposite:[opposite],mid:-1});
  }
  const ids=[],weights=[],offsets=[0];
  const stencil=(indices,coefficients)=>{ids.push(...indices);weights.push(...coefficients);offsets.push(ids.length);};
  for(let i=0;i<count;i++){
    const ns=[...adjacency[i]],n=ns.length;
    if(!n||fixed.has(i)||smoothing[i]===0){stencil([i],[1]);continue;}
    const beta=(n===3?3/16:3/(8*n))*smoothing[i];
    stencil([i,...ns],[1-n*beta,...ns.map(()=>beta)]);
  }
  for(const e of edges.values()){
    const {a,b,opposite:[c,d]}=e;
    // Large muscles, head and trunk get four triangles per original face.
    // In narrow distal tubes split along their length, not around each ring.
    if(band[a]===band[b]&&band[a]!==0)continue;
    const v=.125*Math.min(smoothing[a],smoothing[b]);
    e.mid=offsets.length-1;stencil([a,b,c,d],[.5-v,.5-v,v,v]);
  }
  const faces=[];
  for(let i=0;i<cageFaces.length;i+=3){
    const p=cageFaces.slice(i,i+3),m=p.map((a,j)=>edges.get(key(a,p[(j+1)%3])).mid);
    const n=m.filter(id=>id>=0).length;
    if(!n){faces.push(...p);continue;}
    if(n===3){for(let j=0;j<3;j++)faces.push(p[j],m[j],m[(j+2)%3]);faces.push(...m);continue;}
    const j=n===1?m.findIndex(id=>id>=0):(m.findIndex(id=>id<0)+1)%3;
    const a=p[j],b=p[(j+1)%3],c=p[(j+2)%3],ab=m[j],bc=m[(j+1)%3];
    if(n===1)faces.push(a,ab,c,ab,b,c);
    else faces.push(ab,b,bc,a,ab,bc,a,bc,c);
  }
  const start=Uint32Array.from(offsets),src=Uint32Array.from(ids,i=>i*3),w=Float32Array.from(weights);
  function evaluate(cage,out){
    for(let i=0;i<start.length-1;i++){
      let x=0,y=0,z=0;
      for(let k=start[i];k<start[i+1];k++){
        const j=src[k],b=w[k];x+=cage[j]*b;y+=cage[j+1]*b;z+=cage[j+2]*b;
      }
      const j=3*i;out[j]=x;out[j+1]=y;out[j+2]=z;
    }
  }
  return {faces,count:offsets.length-1,evaluate};
}
