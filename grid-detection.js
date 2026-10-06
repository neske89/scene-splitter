/* Straight, full-axis gutter detection. Coordinates are half-open pixel ranges. */
(function(root){
  function gutters(data,w,h,vertical){
    const n=vertical?w:h,other=vertical?h:w,step=Math.max(1,Math.floor(other/300));
    const means=[],types=[];
    for(let p=0;p<n;p++){
      let sum=0,light=0,dark=0,count=0;
      for(let q=0;q<other;q+=step){
        const i=((vertical?q:p)*w+(vertical?p:q))*4;
        const r=data[i],g=data[i+1],b=data[i+2],v=(r+g+b)/3;
        sum+=v;count++;
        if(v>=218&&Math.max(r,g,b)-Math.min(r,g,b)<=35)light++;
        if(v<=38)dark++;
      }
      means[p]=sum/count;types[p]=light/count>=.94?1:dark/count>=.94?-1:0;
    }
    const runs=[];
    for(let p=0;p<n;){
      if(!types[p]){p++;continue}
      const start=p,type=types[p];while(p<n&&types[p]===type)p++;
      const end=p,probe=Math.max(3,Math.round(n*.015));
      if(start<probe||end>n-probe||end-start>n*.08)continue;
      const center=(start+end)/2;
      let before=0,after=0;
      for(let j=1;j<=probe;j++){before+=means[start-j];after+=means[end+j-1]}
      const value=means[Math.floor(center)],contrast=Math.min(type*(value-before/probe),type*(value-after/probe));
      if(contrast>=18)runs.push({start,end,center,contrast});
    }
    // Reject very narrow cells and dense stripes rather than inventing a large grid.
    const chosen=[];
    for(const run of runs.sort((a,b)=>b.contrast-a.contrast)){
      if(run.start<16||n-run.end<16||chosen.some(c=>Math.abs(c.center-run.center)<Math.max(16,n*.06)))continue;
      chosen.push(run);
    }
    return chosen.sort((a,b)=>a.center-b.center).slice(0,11);
  }
  function axis(runs,n,count){
    if(count==null)return runs;
    if(!Number.isInteger(count)||count<1||count>12||n/count<8)throw Error('Mreža mora imati 1–12 redova i kolona i dovoljno velike ćelije.');
    const result=[];
    for(let i=1;i<count;i++){
      const center=n*i/count,radius=n/count*.25;
      const nearby=runs.filter(r=>Math.abs(r.center-center)<=radius).sort((a,b)=>Math.abs(a.center-center)-Math.abs(b.center-center));
      result.push(nearby[0]||{start:Math.round(center),end:Math.round(center),center});
    }
    return result;
  }
  function detect(data,w,h,options={}){
    const xs=axis(gutters(data,w,h,true),w,options.cols),ys=axis(gutters(data,w,h,false),h,options.rows);
    const cols=xs.length+1,rows=ys.length+1,crops=[];
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)crops.push({
      x0:c?xs[c-1].end:0,x1:c<xs.length?xs[c].start:w,
      y0:r?ys[r-1].end:0,y1:r<ys.length?ys[r].start:h
    });
    return {cols,rows,crops,hasGutters:xs.some(x=>x.end>x.start)||ys.some(y=>y.end>y.start)};
  }
  root.SceneGrid={detect};
})(typeof module==='object'?module.exports:globalThis);
