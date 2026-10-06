const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const {SceneGrid}=require('../grid-detection.js');
function fixture(cols,rows,{dark=false,noisy=false,xs,ys,w=480,h=360}={}){
  const data=new Uint8ClampedArray(w*h*4);
  xs=xs||Array.from({length:cols-1},(_,i)=>Math.round(w*(i+1)/cols));
  ys=ys||Array.from({length:rows-1},(_,i)=>Math.round(h*(i+1)/rows));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const gutter=xs.some(v=>x>=v-3&&x<v+3)||ys.some(v=>y>=v-3&&y<v+3);
    const i=(y*w+x)*4,v=gutter?(dark?8:244)+(noisy?(x+y)%9:0):70+(x*17+y*13)%70;
    data.set([v,gutter?v:v+45,gutter?v:v+10,255],i);
  }
  return {w,h,data};
}
for(const [cols,rows] of [[3,3],[4,4],[2,3],[1,4],[3,1],[1,1],[6,5]]){
  for(const options of [{},{dark:true},{noisy:true}]){
    const f=fixture(cols,rows,options),r=SceneGrid.detect(f.data,f.w,f.h);
    assert.deepStrictEqual([r.cols,r.rows,r.crops.length],[cols,rows,cols*rows]);
    assert(r.crops.every(c=>c.x1>c.x0&&c.y1>c.y0));
    if(cols>1){assert.strictEqual(r.crops[0].x1,Math.round(f.w/cols)-3);assert.strictEqual(r.crops[1].x0,Math.round(f.w/cols)+3)}
  }
}
const uneven=fixture(3,2,{xs:[120,330],ys:[220]});
const irregular=SceneGrid.detect(uneven.data,uneven.w,uneven.h);
assert.deepStrictEqual([irregular.cols,irregular.rows],[3,2]);assert.strictEqual(irregular.crops[1].x1,327);
const f=fixture(1,1);
assert.deepStrictEqual(SceneGrid.detect(f.data,f.w,f.h,{cols:3,rows:2}).crops[0],{x0:0,x1:160,y0:0,y1:180});
for(const bad of [0,1.5,13,NaN])assert.throws(()=>SceneGrid.detect(f.data,f.w,f.h,{cols:bad,rows:2}));
for(const v of [0,255]){
  const data=new Uint8ClampedArray(f.w*f.h*4).fill(v);
  assert.strictEqual(SceneGrid.detect(data,f.w,f.h).crops.length,1);
}
// A white patch that does not span the full image must not split a scene.
for(let y=0;y<100;y++)for(let x=230;x<245;x++)f.data.set([255,255,255,255],(y*f.w+x)*4);
assert.strictEqual(SceneGrid.detect(f.data,f.w,f.h).crops.length,1);
// Use a separate app VM to exercise detection, controls, topology and ZIP count.
const elements=new Map();let pixels=fixture(3,3);
const drawing=new Proxy({getImageData:()=>({data:pixels.data})},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
function element(){return {value:'',style:{},disabled:true,children:[],getContext:()=>drawing,getBoundingClientRect:()=>({left:0,top:0,width:480,height:360}),querySelectorAll:()=>[],setAttribute(){},removeAttribute(){}}}
const document={querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s)},createElement:element};
const app=vm.createContext({document,SceneGrid,navigator:{},window:{addEventListener(){}},Map,Blob,TextEncoder,Uint8Array,requestAnimationFrame:cb=>cb()});
vm.runInContext(fs.readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],app);
elements.get('#gridMode').value='auto';
vm.runInContext('img={naturalWidth:480,naturalHeight:360};cv.width=480;cv.height=360;detect()',app);
assert.strictEqual(vm.runInContext('crops.length',app),9);
assert.strictEqual(elements.get('#sceneLabel').textContent,'Scena 1 / 9');
assert.strictEqual(elements.get('#manualGrid').hidden,true);
assert.strictEqual(vm.runInContext('alignmentPoints(8).some(p=>p.reference>8)',app),false);
assert.strictEqual(vm.runInContext('alignmentPoints(8).filter(p=>p.arrow==="→"||p.arrow==="↓").length',app),0);
vm.runInContext('select(100)',app);assert.strictEqual(vm.runInContext('selected',app),8);assert.strictEqual(elements.get('#next').disabled,true);
elements.get('#gridMode').value='manual';elements.get('#gridMode').onchange();
assert.strictEqual(elements.get('#manualGrid').hidden,false);
elements.get('#gridCols').value='2';elements.get('#gridRows').value='3';elements.get('#applyGrid').onclick();
assert.strictEqual(vm.runInContext('crops.length',app),6);
assert.strictEqual(vm.runInContext('alignmentPoints(4).filter(p=>p.arrow==="↓").length',app),0);
elements.get('#gridRows').value='0';elements.get('#applyGrid').onclick();assert.strictEqual(vm.runInContext('crops.length',app),6);
vm.runInContext('setBusy(true)',app);assert(elements.get('#gridMode').disabled);assert(elements.get('#applyGrid').disabled);
vm.runInContext('setBusy(false)',app);
elements.get('#gridCols').value='1';elements.get('#gridRows').value='3';elements.get('#applyGrid').onclick();
assert.strictEqual(elements.get('#alignScene').value,'1');assert.strictEqual(elements.get('#alignScene').disabled,false);
elements.get('#gridRows').value='1';elements.get('#applyGrid').onclick();
assert.strictEqual(vm.runInContext('alignmentPoints(0).length',app),0);assert(elements.get('#align').disabled);assert(elements.get('#alignScene').disabled);
// An invalid manual input when loading a new image falls back to fresh automatic crops.
elements.get('#gridRows').value='0';pixels=fixture(3,3);
vm.runInContext('detect({newImage:true})',app);
assert.strictEqual(vm.runInContext('crops.length',app),9);assert.strictEqual(elements.get('#gridMode').value,'auto');
// Detection preview coordinates must map back to original pixels.
pixels=fixture(3,3,{w:1200,h:900});
vm.runInContext('img={naturalWidth:2400,naturalHeight:1800};detect()',app);
assert.strictEqual(vm.runInContext('crops[0].x1',app),794);
assert.strictEqual(vm.runInContext('crops.at(-1).x1',app),2400);
pixels=fixture(3,3);vm.runInContext('img={naturalWidth:480,naturalHeight:360};detect()',app);
let exportCount=0;
app.fakeExport=async()=>{exportCount++;return {}};
app.fakeBlob=async()=>new Blob(['pixels']);
elements.get('#exportFormat').value='png';
vm.runInContext('prepareExport=fakeExport;imageBlob=fakeBlob',app);
(async()=>{
 const files=await vm.runInContext('makeFiles()',app);
 assert.strictEqual(files.length,9);assert.strictEqual(exportCount,9);assert.strictEqual(files.at(-1).name,'scene-09.png');
 const zip=await vm.runInContext('zipBlob',app)(files).arrayBuffer();assert.strictEqual(Buffer.from(zip).readUInt16LE(zip.byteLength-12),9);
 console.log('Auto 3×3/4×4/rectangular/uneven grids, bright/dark/noisy gutters, no-grid fallback, manual controls, neighbor topology and 9-scene ZIP: OK');
})().catch(e=>{console.error(e);process.exitCode=1});
