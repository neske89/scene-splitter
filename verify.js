const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
assert.strictEqual((html.match(/id="exportSize"/g)||[]).length,1);
assert(html.indexOf('>Izvoz slika</h2>')<html.indexOf('id="exportSize"'));
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements = new Map();
const drawCalls = [];
const strokeCalls = [];
const fillRects = [];
const textCalls = [];
const textStyles = [],fillStyles = [],strokeStyles = [];
const blobCalls = [];
function canvas() {
  const element = {
    width: 0, height: 0,
    style: {setProperty(name,value){this[name]=value}},
    getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 400}),
    toBlob(callback, mime, quality){blobCalls.push({width:this.width,height:this.height,mime,quality});callback(new Blob([new Uint8Array([1,2,3])],{type:mime}))},
    getContext: () => ({
      globalAlpha: 1,
      drawImage: (...args) => drawCalls.push(args),
      fillRect(...args){fillRects.push({args,style:this.fillStyle})},
      strokeRect(...args){strokeCalls.push(args);strokeStyles.push(this.strokeStyle)},
      translate: () => {},
      putImageData: () => {},
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill(){fillStyles.push(this.globalAlpha)},
      fillText(...args){textCalls.push(args);textStyles.push({text:args[0],opacity:this.globalAlpha})}
    })
  };
  return element;
}
const document = {
  body: {style: {overflow: ''}},
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, selector === '#preview' ? canvas() : {style: {setProperty(name,value){this[name]=value}}, disabled: true, children: [], querySelectorAll:()=>[], getBoundingClientRect:()=>({left:0,top:0,width:400,height:400}),setPointerCapture:()=>{},setAttribute:()=>{},removeAttribute:()=>{}});
    return elements.get(selector);
  },
  createElement(tag) { return tag === 'canvas' ? canvas() : {style: {}}; }
};
const context = vm.createContext({document, navigator: {}, window: {addEventListener:()=>{},innerWidth:1200,innerHeight:800}, TextEncoder, Uint8Array, Blob, Map, Math, Float32Array});
vm.runInContext(script, context);
vm.runInContext("gridCols=gridRows=4",context);
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
elements.get('#overlayScene').onclick();
assert.strictEqual(elements.get('#overlayLabel').textContent,'Isključi isticanje');
assert.deepStrictEqual(fillRects.at(-1),{args:[25,30,95,120],style:'rgba(12,22,38,.65)'});
assert.strictEqual(vm.runInContext('hit({x:25,y:60})',context),null);
assert.strictEqual(vm.runInContext('alignmentHit({x:25,y:60})',context),null);
let marks=textCalls.length;vm.runInContext('draw()',context);
assert.strictEqual(textCalls.length,marks);
vm.runInContext('exportCanvas(crops[0])',context);
assert.strictEqual(fillRects.at(-1).style,'#fff');
elements.get('#overlayScene').onclick();
assert.strictEqual(elements.get('#overlayLabel').textContent,'Istakni ivice');
assert.notStrictEqual(vm.runInContext('hit({x:25,y:60})',context),null);
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
const viewerClasses=new Set();viewer.classList={add:name=>viewerClasses.add(name),remove:name=>viewerClasses.delete(name),contains:name=>viewerClasses.has(name)};
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
  const cache={addAll:async assets=>assert(assets.includes('./index.html')&&assets.includes('./grid-detection.js')),put:async(key,response)=>stored.push(key)};
  const swContext=vm.createContext({self:{location:{origin:'https://neske89.github.io',href:'https://neske89.github.io/scene-splitter/sw.js'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(type,handler)=>handlers[type]=handler},URL,caches:{open:async()=>cache,keys:async()=>[...Array.from({length:17},(_,i)=>'scene-splitter-v'+(i+2)),'unrelated-cache'],delete:async key=>deleted.push(key),match:async()=>({offline:true})},fetch:async()=>({ok:true,clone:()=>({})})});
  vm.runInContext(fs.readFileSync(__dirname+'/sw.js','utf8'),swContext);
  let pending;
  handlers.install({waitUntil:p=>pending=p});await pending;
  handlers.activate({waitUntil:p=>pending=p});await pending;
  assert.deepStrictEqual(deleted,Array.from({length:17},(_,i)=>'scene-splitter-v'+(i+2)));
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
vm.runInContext('selected=0;showBoundaries=false;focusedScene=null;focusSnapshot=null;zoom=1.7;panX=23;panY=-11',context);
let count=strokeCalls.length;
vm.runInContext('draw()',context);
assert.strictEqual(strokeCalls.length-count,1);
elements.get('#boundaries').onclick();
count=strokeCalls.length;
vm.runInContext('draw()',context);
assert.strictEqual(strokeCalls.length-count,16);
assert.strictEqual(vm.runInContext('showBoundaries',context),true);
// Double click focuses another scene; repeating it or pressing the button restores the full view.
viewer.ondblclick({clientX:310,clientY:310});
assert.strictEqual(vm.runInContext('selected',context),15);
assert.strictEqual(vm.runInContext('focusedScene',context),15);
assert.strictEqual(elements.get('#focusLabel').textContent,'Ukloni fokus');
viewer.ondblclick({clientX:310,clientY:310});
assert.strictEqual(vm.runInContext('focusedScene',context),null);
assert.strictEqual(vm.runInContext('zoom',context),1.7);
assert.strictEqual(vm.runInContext('panX',context),23);
assert.strictEqual(vm.runInContext('panY',context),-11);
assert.strictEqual(elements.get('#focusLabel').textContent,'Fokusiraj');
elements.get('#focus').onclick();
assert.strictEqual(vm.runInContext('focusedScene',context),15);
elements.get('#focus').onclick();
assert.strictEqual(vm.runInContext('focusedScene',context),null);
assert.strictEqual(vm.runInContext('zoom',context),1.7);
viewer.ondblclick({clientX:50,clientY:50});
assert.strictEqual(vm.runInContext('selected',context),0);
assert.strictEqual(vm.runInContext('focusedScene',context),0);
viewer.ondblclick({clientX:150,clientY:50});
assert.strictEqual(vm.runInContext('selected',context),1);
assert.strictEqual(vm.runInContext('focusedScene',context),1);
viewer.onpointerdown(event(81,50,50));
assert.strictEqual(vm.runInContext('selected',context),0);
assert.strictEqual(vm.runInContext('focusedScene',context),0);
viewer.onpointerup(event(81,50,50));
viewer.ondblclick({clientX:50,clientY:50});
assert.strictEqual(vm.runInContext('focusedScene',context),0);
elements.get('#focus').onclick();
assert.strictEqual(vm.runInContext('zoom',context),1.7);
assert.strictEqual(vm.runInContext('panX',context),23);
assert.strictEqual(vm.runInContext('panY',context),-11);
assert(html.includes('<details id="gallery" class="gallery" open>'));
assert(!html.includes('id="split"'));
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
// Numbered resize handles appear only in single-scene editing.
vm.runInContext('showBoundaries=false',context);
let before=textCalls.length;vm.runInContext('draw()',context);
let labels=textCalls.slice(before).map(call=>call[0]).filter(text=>/^\d+$/.test(text));
assert.strictEqual(labels.length,8);
vm.runInContext('showBoundaries=true',context);
before=textCalls.length;vm.runInContext('draw()',context);
labels=textCalls.slice(before).map(call=>call[0]).filter(text=>/^\d+$/.test(text));
assert.strictEqual(labels.length,0);
// Hidden boundaries expose no arrow targets, and exporting blocks clicks.
vm.runInContext('showBoundaries=false;setBusy(true)',context);
viewer.onpointerdown(e);
assert.strictEqual(vm.runInContext('pointers.size',context),0);
assert(html.includes('grid-template-columns:minmax(0,1fr) minmax(420px,.61fr)'));
console.log('scene numbers, neighbour arrows, all alignment directions, cancelled clicks, pinch priority, cache upgrade and desktop sidebar: OK');

// Arrow hit testing follows the canvas after zoom/pan, using original coordinates.
vm.runInContext('setBusy(false);selected=0;crops[1].y1=180',context);
preview.getBoundingClientRect=()=>({left:-100,top:-50,width:800,height:800});
point=vm.runInContext("alignmentPoints(0).find(p=>p.edge==='y1'&&p.arrow==='→')",context);
e=event(60,point.x-100,point.y-50);
viewer.onpointerdown(e);assert.strictEqual(vm.runInContext('drag.type',context),'align');viewer.onpointerup(e);
assert.strictEqual(vm.runInContext('crops[0].y1',context),180);
preview.getBoundingClientRect=()=>({left:0,top:0,width:400,height:400});

// Overview only aligns via arrow clicks; resize gestures and manual sizes are locked.
vm.runInContext('crops=Array.from({length:16},(_,i)=>({x0:i%4*200,y0:Math.floor(i/4)*200,x1:i%4*200+200,y1:Math.floor(i/4)*200+200}));selected=0;setBoundaries(true);zoom=1',context);
assert.strictEqual(elements.get('#applyDimensions').disabled,true);
assert.strictEqual(elements.get('#applyAspect').disabled,true);
assert.strictEqual(vm.runInContext('hit({x:200,y:100})',context),null);
const cropsBefore=vm.runInContext('JSON.stringify(crops)',context);
viewer.onpointerdown(event(70,100,50));
assert.strictEqual(vm.runInContext('drag.type',context),'scene');
viewer.onpointermove(event(70,140,50));viewer.onpointerup(event(70,140,50));
assert.strictEqual(vm.runInContext('JSON.stringify(crops)',context),cropsBefore);
assert.strictEqual(vm.runInContext('showBoundaries',context),true);
assert.strictEqual(vm.runInContext('resizeCrop(120,120)',context),false);
// Exact shared borders still have separated arrow circles and hit targets.
const points=vm.runInContext('crops.flatMap((c,i)=>alignmentPoints(i).map(p=>({...p,r:dotSizes(i).green,hit:dotSizes(i).hit})))',context);
for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++){
  const distance=Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y);
  assert(distance>points[a].r+points[b].r);
  assert(distance>points[a].hit+points[b].hit);
}
for(let i=0;i<16;i++){
  if(i%4<3)assert.notStrictEqual(vm.runInContext(`arrowColor(${i})`,context),vm.runInContext(`arrowColor(${i+1})`,context));
  if(i<12)assert.notStrictEqual(vm.runInContext(`arrowColor(${i})`,context),vm.runInContext(`arrowColor(${i+4})`,context));
}
const styleStart=textStyles.length,fillStart=fillStyles.length,strokeStart=strokeStyles.length;
vm.runInContext('draw()',context);
for(const call of textStyles.slice(styleStart))assert.strictEqual(call.opacity,/^\d+$/.test(call.text)?.55:1);
assert(fillStyles.slice(fillStart).every(opacity=>opacity===1));
assert(strokeStyles.slice(strokeStart).every(color=>color==='#fff2a8'));
// A nonselected scene can be aligned without exiting the overview.
vm.runInContext('crops[5].y0=215',context);
point=vm.runInContext("alignmentPoints(4).find(p=>p.edge==='y0'&&p.arrow==='→')",context);
e=event(71,point.x/2,point.y/2);viewer.onpointerdown(e);viewer.onpointerup(e);
assert.strictEqual(vm.runInContext('crops[4].y0',context),215);
assert.strictEqual(vm.runInContext('selected',context),4);
assert.strictEqual(vm.runInContext('showBoundaries',context),true);
assert.strictEqual(elements.get('#applyDimensions').disabled,true);
// Clicking the body exits overview; cancellation, pinch and hidden handles do not.
viewer.onpointerdown(event(72,250,250));viewer.onpointercancel(event(72,250,250));
assert.strictEqual(vm.runInContext('showBoundaries',context),true);
viewer.onpointerdown(event(73,250,250));viewer.onpointerdown(event(74,280,280));viewer.onpointerup(event(74,280,280));viewer.onpointerup(event(73,250,250));
assert.strictEqual(vm.runInContext('showBoundaries',context),true);
viewer.onpointerdown(event(75,250,250));viewer.onpointerup(event(75,250,250));
assert.strictEqual(vm.runInContext('showBoundaries',context),false);
assert.strictEqual(vm.runInContext('selected',context),10);
assert.strictEqual(elements.get('#applyDimensions').disabled,false);
assert.strictEqual(elements.get('#boundaries').textContent,'Prikaži sve granice');
vm.runInContext('setBoundaries(true)',context);
viewer.onpointerdown(event(76,-3,-3));viewer.onpointerup(event(76,-3,-3));
assert.strictEqual(vm.runInContext('showBoundaries',context),true);
viewer.onpointerdown(event(77,50,50));viewer.onpointerup(event(77,50,50));
assert.strictEqual(vm.runInContext('showBoundaries',context),false);
assert.strictEqual(vm.runInContext('selected',context),0);
console.log('all numbered handles, text-only opacity, separated checkerboard arrows, pale-yellow overview, resize lock and click-to-exit: OK');

(async()=>{
  const calls=[],downloads=[],revoked=[];
  const opened=[];context.window.open=(url,target,features)=>opened.push({url,target,features});
  context.requestAnimationFrame=callback=>setTimeout(callback,0);
  context.setTimeout=setTimeout;
  context.ImageData=class {constructor(data,width,height){this.data=data;this.width=width;this.height=height}};
  context.URL={createObjectURL:()=>`blob:test-${Math.random()}`,revokeObjectURL:url=>revoked.push(url)};
  context.SceneAI={settings:(profile,scale)=>({family:'slim',scale,maxPixels:16777216}),abort:()=>{},upscale:async(canvas,options,progress)=>{
    calls.push([canvas.width,canvas.height,options.scale]);
    progress({stage:'processing',value:1});
    if(vm.runInContext('exporting',context)){
      assert.strictEqual(elements.get('#loadingOverlay').hidden,false);
      assert.strictEqual(elements.get('#appShell').inert,true);
      assert.strictEqual(document.body.style.overflow,'hidden');
      assert.strictEqual(elements.get('#loaderProgress').value,100);
    }
    return {width:canvas.width*options.scale,height:canvas.height*options.scale,pixels:new ArrayBuffer(canvas.width*canvas.height*options.scale**2*4)};
  }};
  context.captureDownload=(blob,name)=>downloads.push({blob,name});
  vm.runInContext('download=captureDownload;setBusy(false);showBoundaries=false;cancelRequested=false;img={naturalWidth:800,naturalHeight:800};crops=Array.from({length:16},()=>({x0:10,y0:20,x1:30,y1:35}))',context);
  // Upload size cap and the AI toggle preserve the active processing choice.
  vm.runInContext('loadFile({size:51*1024*1024})',context);
  assert(elements.get('#status').textContent.includes('50 MB'));
  elements.get('#aiEnabled').checked=false;elements.get('#aiEnabled').onchange();
  assert.strictEqual(vm.runInContext('aiActive',context),false);assert.strictEqual(elements.get('#previewAI').disabled,true);
  elements.get('#aiEnabled').checked=true;elements.get('#aiEnabled').onchange();
  assert.strictEqual(vm.runInContext('aiActive',context),true);assert.strictEqual(elements.get('#aiEnabledLabel').textContent,'Uključeno');
  elements.get('#processingMode').value='photo';elements.get('#aiProfile').value='auto';elements.get('#exportFormat').value='png';elements.get('#exportSize').value='original';
  await vm.runInContext('saveScene(0)',context);
  assert.strictEqual(elements.get('#loadingOverlay').hidden,true);
  assert.strictEqual(elements.get('#appShell').inert,false);
  assert.strictEqual(downloads.at(-1).name,'deo-01.png');
  assert.deepStrictEqual(blobCalls.at(-1),{width:40,height:30,mime:'image/png',quality:.98});
  assert.strictEqual(elements.get('#cancelExport').disabled,true);
  elements.get('#exportSize').value='2048';elements.get('#exportFormat').value='jpeg';
  await vm.runInContext('saveScene(1)',context);
  assert.strictEqual(downloads.at(-1).name,'deo-02.jpg');
  assert.deepStrictEqual(calls.at(-1),[20,15,4]);
  assert.deepStrictEqual(blobCalls.at(-1),{width:2048,height:2048,mime:'image/jpeg',quality:.98});
  elements.get('#exportFormat').value='png';
  for(const size of [3072,4096]){
    elements.get('#exportSize').value=String(size);
    await vm.runInContext('saveScene(0)',context);
    assert.deepStrictEqual(calls.at(-1),[20,15,4]);
    assert.deepStrictEqual(blobCalls.at(-1),{width:size,height:size,mime:'image/png',quality:.98});
  }
  elements.get('#exportSize').value='original';elements.get('#exportFormat').value='png';
  const start=calls.length;
  const files=await vm.runInContext('makeFiles()',context);
  assert.strictEqual(files.length,16);assert.strictEqual(calls.length-start,16);
  assert(files.every(file=>file.name.endsWith('.png')));
  // The plain part preview uses the dimensions and encoding chosen for export.
  const beforePlain=calls.length;
  await elements.get('#showScene').onclick();
  assert.strictEqual(calls.length,beforePlain);
  assert.deepStrictEqual(blobCalls.at(-1),{width:40,height:30,mime:'image/png',quality:.98});
  assert.strictEqual(elements.get('#compareFrame').style.width,'40px');
  assert.strictEqual(elements.get('#openFullImage').textContent,'Otvori deo u punoj veličini');
  elements.get('#closeComparison').onclick();
  elements.get('#aiEnabled').checked=false;elements.get('#aiEnabled').onchange();
  elements.get('#exportSize').value='2048';elements.get('#exportFormat').value='jpeg';
  await elements.get('#showScene').onclick();
  assert.strictEqual(calls.length,beforePlain);
  assert.deepStrictEqual(blobCalls.at(-1),{width:2048,height:2048,mime:'image/jpeg',quality:.98});
  assert.strictEqual(vm.runInContext('comparisonSize.width',context),2048);
  assert(elements.get('#aiResultInfo').textContent.includes('2048 × 2048 px · JPEG · Bez AI'));
  elements.get('#openFullImage').onclick();
  assert.strictEqual(opened.at(-1).target,'_blank');
  elements.get('#closeComparison').onclick();
  elements.get('#aiEnabled').checked=true;elements.get('#aiEnabled').onchange();
  elements.get('#exportSize').value='original';elements.get('#exportFormat').value='png';
  const releasedBeforeAI=revoked.length;
  // AI preview and source preview use separate full-resolution images.
  await elements.get('#previewAI').onclick();
  assert.strictEqual(elements.get('#aiComparison').hidden,false);
  assert.strictEqual(elements.get('#comparisonBackdrop').hidden,false);
  assert.strictEqual(document.body.style.overflow,'hidden');
  assert.strictEqual(elements.get('#compareFrame').style.width,'40px');
  assert.strictEqual(elements.get('#compareFrame').style.height,'30px');
  vm.runInContext('comparisonSize={width:2000,height:1000};sizeComparison()',context);
  assert.strictEqual(elements.get('#compareFrame').style.width,'1150px');
  assert.strictEqual(elements.get('#compareFrame').style.height,'575px');
  assert(elements.get('#aiResultInfo').textContent.includes('20 × 15 px → 40 × 30 px · PNG · AI 2×'));
  assert.strictEqual(elements.get('#openFullImage').textContent,'Otvori AI rezultat u punoj veličini');
  const enhancedURL=elements.get('#comparisonImage').src;
  elements.get('#showOriginal').onclick();assert.notStrictEqual(elements.get('#comparisonImage').src,enhancedURL);
  assert.strictEqual(elements.get('#openFullImage').textContent,'Otvori original u punoj veličini');
  elements.get('#openFullImage').onclick();
  const originalTab=opened.at(-1).url;
  elements.get('#compareSlider').value='75';elements.get('#compareSlider').oninput();
  assert.strictEqual(elements.get('#comparisonImage').src,enhancedURL);
  assert.strictEqual(elements.get('#compareFrame').style['--split'],'75%');
  assert.strictEqual(elements.get('#openFullImage').textContent,'Otvori AI rezultat u punoj veličini');
  elements.get('#compareSlider').value='100';elements.get('#compareSlider').oninput();
  assert.strictEqual(elements.get('#openFullImage').textContent,'Otvori original u punoj veličini');
  assert.strictEqual(elements.get('#comparisonTitle').textContent,'Deo 1');
  elements.get('#showEnhanced').onclick();assert.strictEqual(elements.get('#comparisonImage').src,enhancedURL);
  elements.get('#openFullImage').onclick();
  assert.strictEqual(opened.at(-1).target,'_blank');
  assert.strictEqual(opened.at(-1).features,'noopener');
  assert.notStrictEqual(opened.at(-1).url,enhancedURL);
  assert.notStrictEqual(opened.at(-1).url,originalTab);
  elements.get('#comparisonBackdrop').onclick();assert.strictEqual(revoked.length,releasedBeforeAI+2);
  assert.strictEqual(elements.get('#aiComparison').hidden,true);
  assert.strictEqual(elements.get('#comparisonBackdrop').hidden,true);
  assert.strictEqual(document.body.style.overflow,'');
  // The comparison displays the selected square JPEG, and its download reuses that exact Blob.
  elements.get('#exportSize').value='2048';elements.get('#exportFormat').value='jpeg';
  const beforePreview=blobCalls.length,beforeAI=calls.length;
  await elements.get('#previewAI').onclick();
  assert.strictEqual(calls.length,beforeAI+1);assert.deepStrictEqual(calls.at(-1),[20,15,4]);
  assert.deepStrictEqual(blobCalls.slice(beforePreview),[
    {width:2048,height:2048,mime:'image/jpeg',quality:.98},
    {width:2048,height:2048,mime:'image/jpeg',quality:.98}
  ]);
  assert(elements.get('#aiResultInfo').textContent.includes('2048 × 2048 px · JPEG · AI 4× + dodatno uvećanje'));
  const compared=vm.runInContext('comparisonDownload.blob',context),aiCount=calls.length;
  elements.get('#downloadCompared').onclick();
  assert.strictEqual(downloads.at(-1).blob,compared);
  assert.strictEqual(downloads.at(-1).name,'deo-01.jpg');
  assert.strictEqual(calls.length,aiCount);
  elements.get('#closeComparison').onclick();assert.strictEqual(revoked.length,releasedBeforeAI+4);
  // Text mode upscales without loading an AI model and previews the selected format.
  elements.get('#processingMode').value='text';elements.get('#processingMode').onchange();
  const textCalls=calls.length;
  await vm.runInContext('saveScene(0)',context);
  assert.strictEqual(calls.length,textCalls);
  assert.deepStrictEqual(blobCalls.at(-1),{width:2048,height:2048,mime:'image/jpeg',quality:.98});
  await elements.get('#previewAI').onclick();
  assert.strictEqual(calls.length,textCalls);
  assert.strictEqual(elements.get('#showEnhanced').textContent,'Očuvaj slova');
  assert.strictEqual(elements.get('#enhancedTag').textContent,'Očuvaj slova · JPEG');
  assert.strictEqual(elements.get('#aiEnabled').disabled,true);
  elements.get('#closeComparison').onclick();
  elements.get('#processingMode').value='photo';elements.get('#processingMode').onchange();
  // A mobile-sized 4× AI result may be interpolated to the 4096 px print target.
  const oldSettings=context.SceneAI.settings;
  context.SceneAI.settings=(profile,scale)=>({family:'slim',scale,maxPixels:8388608});
  vm.runInContext('crops[0]={x0:0,y0:0,x1:500,y1:500}',context);
  elements.get('#exportFormat').value='png';elements.get('#exportSize').value='4096';
  await vm.runInContext('saveScene(0)',context);
  assert.deepStrictEqual(calls.at(-1),[500,500,4]);
  assert.deepStrictEqual(blobCalls.at(-1),{width:4096,height:4096,mime:'image/png',quality:.98});
  vm.runInContext('crops[0]={x0:0,y0:0,x1:800,y1:800}',context);
  await vm.runInContext('saveScene(0)',context);
  assert.deepStrictEqual(calls.at(-1),[800,800,2]);
  vm.runInContext('crops[0]={x0:0,y0:0,x1:1500,y1:1500}',context);
  const beforeLimit=calls.length;
  await vm.runInContext('saveScene(0)',context);
  assert.strictEqual(calls.length,beforeLimit);
  assert.strictEqual(elements.get('#aiNotice').hidden,false);
  assert(elements.get('#aiNotice').textContent.includes('prevelik'));
  vm.runInContext('crops[0]={x0:0,y0:0,x1:3000,y1:2000}',context);
  elements.get('#exportSize').value='2048';const enoughPixels=calls.length;
  await vm.runInContext('saveScene(0)',context);
  assert.strictEqual(calls.length,enoughPixels);
  assert.deepStrictEqual(blobCalls.at(-1),{width:2048,height:2048,mime:'image/png',quality:.98});
  vm.runInContext('crops[0]={x0:10,y0:20,x1:30,y1:35}',context);
  context.SceneAI.settings=oldSettings;
  // With AI off, export goes directly from the source pixels.
  elements.get('#aiEnabled').checked=false;elements.get('#aiEnabled').onchange();elements.get('#exportSize').value='original';elements.get('#exportFormat').value='png';const withoutAI=calls.length;
  await vm.runInContext('saveScene(2)',context);
  assert.strictEqual(calls.length,withoutAI);assert.strictEqual(blobCalls.at(-1).width,20);
  // Cancellation between scenes must suppress downloading a partial archive.
  elements.get('#aiEnabled').checked=true;elements.get('#aiEnabled').onchange();const downloadCount=downloads.length;
  context.SceneAI.upscale=async()=>{elements.get('#loaderCancel').onclick();assert.strictEqual(elements.get('#loaderCancel').disabled,true);throw Object.assign(Error('cancelled'),{name:'AbortError'})};
  await elements.get('#zip').onclick();
  assert.strictEqual(downloads.length,downloadCount);
  assert.strictEqual(elements.get('#loadingOverlay').hidden,true);
  assert.strictEqual(elements.get('#zip').disabled,false);
  assert.strictEqual(elements.get('#file').disabled,false);
  assert.strictEqual(elements.get('#status').textContent,'Obrada je prekinuta.');
  // Canvas selection and drop use the same loader; removing clears the image state.
  let chooserClicks=0;elements.get('#file').click=()=>chooserClicks++;
  elements.get('#chooseFileCanvas').onclick();
  assert.strictEqual(chooserClicks,1);
  let dropped=null;context.captureDropped=f=>{dropped=f};vm.runInContext('loadFile=captureDropped',context);
  const droppedFile={name:'nova.png'};
  viewer.ondragover({preventDefault(){}});assert(viewerClasses.has('drag-over'));
  viewer.ondrop({preventDefault(){},dataTransfer:{files:[droppedFile]}});
  assert.strictEqual(dropped,droppedFile);assert.strictEqual(viewerClasses.has('drag-over'),false);
  elements.get('#removeImage').onclick();
  assert.strictEqual(vm.runInContext('img',context),null);
  assert.strictEqual(vm.runInContext('crops.length',context),0);
  assert.strictEqual(elements.get('#emptyCanvas').hidden,false);
  assert.strictEqual(elements.get('#removeImage').hidden,true);
  assert.strictEqual(elements.get('#removeImage').disabled,true);
  console.log('AI single-scene/ZIP export, PNG/JPEG, final sizing, comparison cleanup, AI-off path and cancellation without partial download: OK');
})().catch(error=>{console.error(error);process.exitCode=1});
