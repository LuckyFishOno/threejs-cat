// Small, precompiled C2 curves for authored poses. Cubic segments share their
// second derivative; swing curves additionally satisfy contact velocity and
// acceleration constraints through quintic Hermite segments.
export function motionCurve(keys,{periodic=false,startSlope,endSlope,contactAcceleration=false}={}) {
  const size=keys.length-(periodic?1:0),dimensions=keys[0].length-1;
  const rows=Array.from({length:size},()=>new Float64Array(size+dimensions));
  for(let i=0;i<size;i++) {
    if(!periodic&&(i===0||i===size-1)) {
      const slope=i===0?startSlope:endSlope;
      if(!slope){rows[i][i]=1;continue;}
      const left=i===0?0:i-1,right=left+1,h=keys[right][0]-keys[left][0];
      rows[i][left]=i===0?2*h:h; rows[i][right]=i===0?h:2*h;
      for(let d=0;d<dimensions;d++) {
        const secant=(keys[right][d+1]-keys[left][d+1])/h;
        rows[i][size+d]=6*(i===0?secant-slope[d]:slope[d]-secant);
      }
      continue;
    }
    const previous=(i-1+size)%size,next=(i+1)%size;
    const hp=keys[i][0]-(i===0?keys[previous][0]-1:keys[previous][0]);
    const hn=(i===size-1?keys[next][0]+1:keys[next][0])-keys[i][0];
    rows[i][previous]=hp;rows[i][i]=2*(hp+hn);rows[i][next]=hn;
    for(let d=0;d<dimensions;d++)rows[i][size+d]=6*((keys[next][d+1]-keys[i][d+1])/hn-(keys[i][d+1]-keys[previous][d+1])/hp);
  }
  for(let column=0;column<size;column++) {
    let pivot=column;
    for(let row=column+1;row<size;row++)if(Math.abs(rows[row][column])>Math.abs(rows[pivot][column]))pivot=row;
    [rows[pivot],rows[column]]=[rows[column],rows[pivot]];
    const scale=rows[column][column];
    if(Math.abs(scale)<1e-12)throw new Error('Degenerate motion curve');
    for(let j=column;j<size+dimensions;j++)rows[column][j]/=scale;
    for(let row=0;row<size;row++)if(row!==column) {
      const factor=rows[row][column];
      for(let j=column;j<size+dimensions;j++)rows[row][j]-=factor*rows[column][j];
    }
  }
  const second=rows.map(row=>Array.from(row.slice(size)));
  if(periodic)second.push(second[0]);
  const velocity=keys.map((key,i)=>Array.from({length:dimensions},(_,d)=>{
    const k=Math.min(i,keys.length-2),h=keys[k+1][0]-keys[k][0];
    const secant=(keys[k+1][d+1]-keys[k][d+1])/h;
    return i===keys.length-1?secant+h*(second[k][d]+2*second[k+1][d])/6:secant-h*(2*second[k][d]+second[k+1][d])/6;
  }));
  if(contactAcceleration){second[0]=Array(dimensions).fill(0);second[second.length-1]=Array(dimensions).fill(0);}
  return (time)=>{
    const p=periodic?((time%1)+1)%1:Math.max(keys[0][0],Math.min(keys.at(-1)[0],time));
    let i=keys.findIndex((key,j)=>j<keys.length-1&&p>=key[0]&&p<keys[j+1][0]);
    if(i<0)i=keys.length-2;
    const h=keys[i+1][0]-keys[i][0],t=(p-keys[i][0])/h;
    return Array.from({length:dimensions},(_,d)=>{
      const a=keys[i][d+1],b=keys[i+1][d+1],ma=second[i][d],mb=second[i+1][d];
      if(!contactAcceleration) {
        const u=1-t;
        return ma*u*u*u*h*h/6+mb*t*t*t*h*h/6+(a-ma*h*h/6)*u+(b-mb*h*h/6)*t;
      }
      const c1=velocity[i][d]*h,c2=ma*h*h/2;
      const delta=b-a-c1-c2,v=velocity[i+1][d]*h-c1-2*c2,acc=mb*h*h-2*c2;
      return a+c1*t+c2*t*t+(10*delta-4*v+acc/2)*t**3+(-15*delta+7*v-acc)*t**4+(6*delta-3*v+acc/2)*t**5;
    });
  };
}

// Periodic uniform B-spline sampling: C2 even across the wrap, with no runtime
// simulation state. Used for the settled tail's densely sampled spring motion.
export function samplePeriodic(samples,phase) {
  const position=((phase%1)+1)%1*samples.length,i=Math.floor(position),t=position-i;
  const weights=[(1-t)**3/6,(3*t**3-6*t*t+4)/6,(-3*t**3+3*t*t+3*t+1)/6,t**3/6];
  return samples[0].map((_,d)=>weights.reduce((sum,w,j)=>sum+w*samples[(i+j-1+samples.length)%samples.length][d],0));
}
