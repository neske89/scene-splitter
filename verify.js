const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements = new Map();
const drawCalls = [];
const strokeCalls = [];
const textCalls = [];
function canvas() {
  const element = {
    width: 0, height: 0,
    style: {},
    getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 400}),
    getContext: () => ({
      drawImage: (...args) => drawCalls.push(args),
      fillRect: () => {},
      strokeRect: (...args) => strokeCalls.push(args),
      translate: () => {},
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      fillText: (...args) => textCalls.push(args)
    })
  };
  return element;
}
const document = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, selector === '#preview' ? canvas() : {style: {}, disabled: true, children: [], querySelectorAll:()=>[], getBoundingClientRect:()=>({left:0,top:0,width:400,height:400}),setPointerCapture:()=>{},setAttribute:()=>{}});
    return elements.get(selector);
  },
  createElement(tag) { return tag === 'canvas' ? canvas() : {style: {}}; }
};
const context = vm.createContext({document, navigator: {}, window: {addEventListener:()=>{}}, TextEncoder, Uint8Array, Blob, Map, Math, Float32Array});
vm.runInContext(script, context);
vm.runInContext('cv.width=800;cv.height=800;img={naturalWidth:800,naturalHeight:800}; crops=[{x0:20,y0:30,x1:120,y1:150}, ...Array.from({length:15},()=>({x0:0,y0:0,x1:100,y1:100}))]', context);
elements.get('#exportSize').value = 'original';
let exported = vm.runInContext('exportCanvas(crops[0])', context);
assert.deepStrictEqual([exported.width, exported.height], [100, 120]);
assert.deepStrictEqual(drawCalls.at(-1).slice(1), [20, 30, 100, 120, 0, 0, 100, 120]);
for (const size of [2048, 3072, 4096]) {
  elements.get('#exportSize').value = String(size);
  exported = vm.runInContext('exportCanvas(crops[0])', context);
  assert.deepStrictEqual([exported.width, exported.height], [size, size]);
}
vm.runInContext('crops[0].x0=25', context);
assert.strictEqual(vm.runInContext('crops[1].x0', context), 0);
assert.strictEqual(vm.runInContext('sceneAt({x:30,y:40})', context), 0);
const archive = vm.runInContext("zipBlob([{name:'scene-01.jpg',data:new Uint8Array([1,2,3])}])", context);
archive.arrayBuffer().then(buffer => {
  const bytes = Buffer.from(buffer);
  assert.strictEqual(bytes.readUInt32LE(0), 0x04034b50);
  assert.strictEqual(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  assert.strictEqual(bytes.readUInt16LE(bytes.length - 12), 1);
  console.log('crop coordinates, independent edits, export sizes, ZIP structure: OK');
}).catch(error => { console.error(error); process.exitCode = 1; });

// Pointer coordinates remain in original pixels even at a 2× view transform.
const preview=elements.get('#preview');
preview.getBoundingClientRect=()=>({left:-100,top:-50,width:800,height:800});
assert.strictEqual(vm.runInContext('pt({clientX:0,clientY:0}).x',context),100);
assert.strictEqual(vm.runInContext('pt({clientX:0,clientY:0}).y',context),50);
preview.getBoundingClientRect=()=>({left:0,top:0,width:400,height:400});
vm.runInContext('crops=Array.from({length:16},(_,i)=>({x0:i%4*200,y0:Math.floor(i/4)*200,x1:i%4*200+194,y1:Math.floor(i/4)*200+194}));selected=0',context);
const viewer=elements.get('#viewer');
const event=(pointerId,clientX,clientY)=>({pointerId,clientX,clientY});
// The selected right edge takes priority over the neighbouring crop's interior.
viewer.onpointerdown(event(1,103,50));
assert.strictEqual(vm.runInContext('drag.type',context),'edge');
viewer.onpointermove(event(1,130,50));
assert.strictEqual(vm.runInContext('crops[0].x1',context),260);
assert.strictEqual(vm.runInContext('crops[1].x0',context),200);
assert.strictEqual(vm.runInContext('dirty.has(0)',context),true);
viewer.onpointerdown(event(2,150,100));
assert.strictEqual(vm.runInContext('drag',context),null);
viewer.onpointerup(event(2,150,100));
viewer.onpointerup(event(1,130,50));
assert.strictEqual(vm.runInContext('dirty.size',context),0);
// A two-finger translation pans even if the distance (zoom) does not change.
vm.runInContext('zoom=2;panX=0;panY=0',context);
viewer.onpointerdown(event(1,200,200));viewer.onpointerdown(event(2,300,200));
viewer.onpointermove(event(1,220,230));viewer.onpointermove(event(2,320,230));
assert.strictEqual(vm.runInContext('zoom',context),2);
assert.strictEqual(vm.runInContext('panX',context),20);
assert.strictEqual(vm.runInContext('panY',context),30);
viewer.onpointerup(event(1,220,230));viewer.onpointerup(event(2,320,230));
vm.runInContext('resetView()',context);
assert.strictEqual(vm.runInContext('zoom',context),1);
assert.strictEqual(vm.runInContext('panX',context),0);
vm.runInContext('setBusy(true)',context);
assert.strictEqual(elements.get('#file').disabled,true);
viewer.onpointerdown(event(1,50,50));
assert.strictEqual(vm.runInContext('pointers.size',context),0);
vm.runInContext('setBusy(false)',context);
assert.strictEqual(elements.get('#file').disabled,false);
// Large downscales run through intermediate canvases before the final square.
elements.get('#exportSize').value='2048';
const start=drawCalls.length;
exported=vm.runInContext('exportCanvas({x0:0,y0:0,x1:12000,y1:8000})',context);
assert.deepStrictEqual([exported.width,exported.height],[2048,2048]);
assert(drawCalls.length-start>=4);
assert.strictEqual(vm.runInContext("crc32(new TextEncoder().encode('123456789'))",context),0xcbf43926);
console.log('edge priority, touch selection, independent drag, interrupted gestures, pinch pan, original coordinates, export lock, progressive scaling, CRC32: OK');

(async()=>{
  const data=new Uint8Array([1,2,3]);
  const archive=vm.runInContext("zipBlob(Array.from({length:16},(_,i)=>({name:'scene-'+String(i+1).padStart(2,'0')+'.jpg',data:new Uint8Array([1,2,3])})))",context);
  fs.writeFileSync('/tmp/scene-splitter-verify.zip',Buffer.from(await archive.arrayBuffer()));
  const handlers={},deleted=[],stored=[];
  const cache={addAll:async assets=>assert(assets.includes('./index.html')),put:async(key,response)=>stored.push(key)};
  const swContext=vm.createContext({self:{location:{origin:'https://neske89.github.io'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(type,handler)=>handlers[type]=handler},URL,caches:{open:async()=>cache,keys:async()=>['scene-splitter-v2','scene-splitter-v3','scene-splitter-v4','scene-splitter-v5','scene-splitter-v6','unrelated-cache'],delete:async key=>deleted.push(key),match:async()=>({offline:true})},fetch:async()=>({ok:true,clone:()=>({})})});
  vm.runInContext(fs.readFileSync(__dirname+'/sw.js','utf8'),swContext);
  let pending;
  handlers.install({waitUntil:p=>pending=p});await pending;
  handlers.activate({waitUntil:p=>pending=p});await pending;
  assert.deepStrictEqual(deleted,['scene-splitter-v2','scene-splitter-v3','scene-splitter-v4','scene-splitter-v5']);
  let response,background;
  handlers.fetch({request:{method:'GET',url:'https://neske89.github.io/scene-splitter/',mode:'navigate'},respondWith:p=>response=p,waitUntil:p=>background=p});
  assert((await response).ok);await background;assert.deepStrictEqual(stored,['./index.html']);
  swContext.fetch=async()=>{throw Error('offline')};
  handlers.fetch({request:{method:'GET',url:'https://neske89.github.io/scene-splitter/',mode:'navigate'},respondWith:p=>response=p});
  assert((await response).offline);
  let intercepted=false;
  handlers.fetch({request:{method:'POST',url:'https://neske89.github.io/'},respondWith:()=>intercepted=true});
  handlers.fetch({request:{method:'GET',url:'https://example.org/'},respondWith:()=>intercepted=true});
  assert.strictEqual(intercepted,false);
  console.log('service worker install, scoped old-cache cleanup, navigation refresh and offline fallback: OK');
})().catch(error=>{console.error(error);process.exitCode=1});

// Padded preview coordinates still address original image pixels.
vm.runInContext('canvasOffset=40;cv.width=cv.height=880',context);
assert.strictEqual(vm.runInContext('pt({clientX:200,clientY:200}).x',context),400);
assert.strictEqual(vm.runInContext('pt({clientX:200,clientY:200}).y',context),400);
// Focus every crop, including all corners, inside a short landscape viewport.
viewer.getBoundingClientRect=()=>({left:0,top:0,width:400,height:180});
for(let i=0;i<16;i++){
  vm.runInContext(`selected=${i};focusScene()`,context);
  const bounds=vm.runInContext('({left:panX+(canvasOffset+crops[selected].x0)/cv.width*400*zoom,right:panX+(canvasOffset+crops[selected].x1)/cv.width*400*zoom,top:panY+(canvasOffset+crops[selected].y0)/cv.width*400*zoom,bottom:panY+(canvasOffset+crops[selected].y1)/cv.width*400*zoom})',context);
  assert(bounds.left>=18-1e-8&&bounds.right<=382+1e-8);
  assert(bounds.top>=18-1e-8&&bounds.bottom<=162+1e-8);
}
vm.runInContext('selected=0;showBoundaries=false',context);
let count=strokeCalls.length;
vm.runInContext('draw()',context);
assert.strictEqual(strokeCalls.length-count,1);
elements.get('#boundaries').onclick();
count=strokeCalls.length;
vm.runInContext('draw()',context);
assert.strictEqual(strokeCalls.length-count,16);
assert.strictEqual(vm.runInContext('showBoundaries',context),true);
// Double click selects the scene under the pointer and centers it.
viewer.ondblclick({clientX:310,clientY:310});
assert.strictEqual(vm.runInContext('selected',context),15);
// Every edge copies the matching coordinate from the reference, independently.
for(const edge of ['x0','x1','y0','y1']){
  vm.runInContext('selected=0;crops[0]={x0:10,y0:10,x1:190,y1:190};crops[1]={x0:20,y0:30,x1:180,y1:170}',context);
  elements.get('#alignScene').value='1';elements.get('#alignEdge').value=edge;
  elements.get('#align').onclick();
  assert.strictEqual(vm.runInContext(`crops[0].${edge}===crops[1].${edge}`,context),true);
  assert.strictEqual(vm.runInContext('JSON.stringify(crops[1])',context),'{"x0":20,"y0":30,"x1":180,"y1":170}');
}
vm.runInContext('crops[0]={x0:10,y0:10,x1:190,y1:190};crops[1].x0=300',context);
elements.get('#alignEdge').value='x0';elements.get('#align').onclick();
assert.strictEqual(vm.runInContext('crops[0].x0',context),10);
vm.runInContext('setBusy(true)',context);
assert.strictEqual(elements.get('#align').disabled,true);
assert.strictEqual(elements.get('#boundaries').disabled,true);
console.log('padded coordinates, corner focus, double click, boundary visibility, all four alignments and invalid alignment: OK');

vm.runInContext('setBusy(false);selected=0;aspectLocks.clear();crops[0]={x0:700,y0:700,x1:800,y1:800}',context);
elements.get('#cropWidth').value='300';elements.get('#cropHeight').value='200';
elements.get('#applyDimensions').onclick();
assert.strictEqual(vm.runInContext('JSON.stringify(crops[0])',context),'{"x0":500,"y0":600,"x1":800,"y1":800}');
const unchanged=vm.runInContext('JSON.stringify(crops[0])',context);
for(const invalid of ['801','0','NaN','25.5']){
  elements.get('#cropWidth').value=invalid;elements.get('#applyDimensions').onclick();
  assert.strictEqual(vm.runInContext('JSON.stringify(crops[0])',context),unchanged);
}
elements.get('#aspectRatio').value='16:9';elements.get('#applyAspect').onclick();
assert.strictEqual(vm.runInContext('aspectLocks.get(0).ratio',context),16/9);
elements.get('#cropWidth').value='320';elements.get('#cropWidth').oninput();
assert.strictEqual(elements.get('#cropHeight').value,180);
elements.get('#applyDimensions').onclick();
assert.strictEqual(vm.runInContext('crops[0].x1-crops[0].x0',context),320);
assert.strictEqual(vm.runInContext('crops[0].y1-crops[0].y0',context),180);
// Locked dragging in every direction stays within the source and retains ratio.
for(const handle of ['l','r','t','b','lt','rt','lb','rb']){
  vm.runInContext('crops[0]={x0:200,y0:200,x1:520,y1:380}',context);
  for(const [x,y] of [[-500,-500],[1300,1300],[300,300]]){
    vm.runInContext(`resizeLocked({x:${x},y:${y}},'${handle}')`,context);
    const c=vm.runInContext('crops[0]',context),w=c.x1-c.x0,h=c.y1-c.y0;
    assert(c.x0>=0&&c.y0>=0&&c.x1<=800&&c.y1<=800);
    assert(w>=8&&h>=8);
    assert(Math.abs(w-h*16/9)<=2);
  }
}
vm.runInContext('crops[0]={x0:200,y0:200,x1:520,y1:380};crops[1]={x0:210,y0:220,x1:550,y1:400}',context);
elements.get('#alignScene').value='1';elements.get('#alignEdge').value='y0';elements.get('#align').onclick();
assert.strictEqual(vm.runInContext('crops[0].y0',context),220);
assert.strictEqual(vm.runInContext('crops[0].y1-crops[0].y0',context),180);
vm.runInContext('select(1)',context);
assert.strictEqual(elements.get('#aspectRatio').value,'free');
vm.runInContext('select(0)',context);
assert.strictEqual(elements.get('#aspectRatio').value,'16:9');
elements.get('#aspectRatio').value='custom';elements.get('#aspectRatio').onchange();
assert.strictEqual(elements.get('#customAspect').hidden,false);
elements.get('#aspectWidth').value='2';elements.get('#aspectHeight').value='3';elements.get('#applyAspect').onclick();
assert.strictEqual(vm.runInContext('aspectLocks.get(0).ratio',context),2/3);
elements.get('#aspectHeight').value='0';elements.get('#applyAspect').onclick();
assert.strictEqual(vm.runInContext('aspectLocks.get(0).ratio',context),2/3);
elements.get('#aspectRatio').value='free';elements.get('#applyAspect').onclick();
assert.strictEqual(vm.runInContext('aspectLocks.has(0)',context),false);
vm.runInContext('setBusy(true)',context);
assert.strictEqual(elements.get('#cropWidth').disabled,true);
assert.strictEqual(elements.get('#applyAspect').disabled,true);
console.log('manual dimensions, image limits, per-scene presets and custom ratio, locked edge/corner dragging, alignment and export lock: OK');

// A freshly loaded image can be drawn before detection creates its crops.
vm.runInContext('crops=[];draw()',context);

vm.runInContext('setBusy(false);canvasOffset=0;cv.width=cv.height=800;zoom=1;panX=panY=0;showBoundaries=false;aspectLocks.clear();crops=Array.from({length:16},(_,i)=>({x0:i%4*200,y0:Math.floor(i/4)*200,x1:i%4*200+194,y1:Math.floor(i/4)*200+194}));selected=0',context);
// No row wrapping: corner scenes expose only their actual grid neighbours.
for(let i=0;i<16;i++){
  const points=vm.runInContext(`alignmentPoints(${i})`,context);
  const row=Math.floor(i/4),col=i%4;
  assert.strictEqual(points.length,2*((col>0)+(col<3)+(row>0)+(row<3)));
  for(const p of points){
    assert(p.reference>=0&&p.reference<16);
    if(p.arrow==='←')assert.strictEqual(p.reference,i-1);
    if(p.arrow==='→')assert.strictEqual(p.reference,i+1);
    if(p.arrow==='↑')assert.strictEqual(p.reference,i-4);
    if(p.arrow==='↓')assert.strictEqual(p.reference,i+4);
  }
}
function clickArrow(scene,edge,arrow){
  vm.runInContext(`select(${scene})`,context);
  const p=vm.runInContext(`alignmentPoints(${scene}).find(p=>p.edge==='${edge}'&&p.arrow==='${arrow}')`,context);
  const e=event(50,p.x/2,p.y/2);
  viewer.onpointerdown(e);
  assert.strictEqual(vm.runInContext('drag.type',context),'align');
  viewer.onpointerup(e);
  assert.strictEqual(vm.runInContext(`crops[${scene}].${edge}===crops[${p.reference}].${edge}`,context),true);
}
vm.runInContext('crops[1].y0=12;crops[4].x0=12',context);
clickArrow(0,'y0','→');clickArrow(0,'x0','↓');
vm.runInContext('crops[5].y1=380;crops[5].x1=380',context);
clickArrow(6,'y1','←');clickArrow(9,'x1','↑');
// Moving away from an arrow or cancelling it does not align.
vm.runInContext('select(0);crops[1].y0=30',context);
let point=vm.runInContext("alignmentPoints(0).find(p=>p.edge==='y0'&&p.arrow==='→')",context);
let e=event(51,point.x/2,point.y/2);
viewer.onpointerdown(e);viewer.onpointermove(event(51,e.clientX+20,e.clientY+20));viewer.onpointerup(event(51,e.clientX+20,e.clientY+20));
assert.strictEqual(vm.runInContext('crops[0].y0',context),12);
viewer.onpointerdown(e);viewer.onpointercancel(e);
assert.strictEqual(vm.runInContext('crops[0].y0',context),12);
// Pinching over an arrow cancels its action.
viewer.onpointerdown(e);viewer.onpointerdown(event(52,350,350));
viewer.onpointerup(event(52,350,350));viewer.onpointerup(e);
assert.strictEqual(vm.runInContext('crops[0].y0',context),12);
// Every visible border gets its scene number; the selected scene draws last.
vm.runInContext('showBoundaries=true',context);
const before=textCalls.length;vm.runInContext('draw()',context);
const labels=textCalls.slice(before).map(call=>call[0]).filter(text=>/^\d+$/.test(text));
assert.strictEqual(labels.length,16);assert.strictEqual(labels.at(-1),'1');
assert.deepStrictEqual([...labels].sort((a,b)=>Number(a)-Number(b)),Array.from({length:16},(_,i)=>String(i+1)));
// Hidden boundaries expose no arrow targets, and exporting blocks clicks.
vm.runInContext('showBoundaries=false;setBusy(true)',context);
viewer.onpointerdown(e);
assert.strictEqual(vm.runInContext('pointers.size',context),0);
assert(html.includes('grid-template-columns:minmax(0,1fr) 360px'));
console.log('scene numbers, neighbour arrows, all alignment directions, cancelled clicks, pinch priority, cache upgrade and desktop sidebar: OK');

// Arrow hit testing follows the canvas after zoom/pan, using original coordinates.
vm.runInContext('setBusy(false);selected=0;crops[1].y1=180',context);
preview.getBoundingClientRect=()=>({left:-100,top:-50,width:800,height:800});
point=vm.runInContext("alignmentPoints(0).find(p=>p.edge==='y1'&&p.arrow==='→')",context);
e=event(60,point.x-100,point.y-50);
viewer.onpointerdown(e);assert.strictEqual(vm.runInContext('drag.type',context),'align');viewer.onpointerup(e);
assert.strictEqual(vm.runInContext('crops[0].y1',context),180);
preview.getBoundingClientRect=()=>({left:0,top:0,width:400,height:400});
