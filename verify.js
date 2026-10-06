const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements = new Map();
const drawCalls = [];
function canvas() {
  const element = {
    width: 0, height: 0,
    style: {},
    getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 400}),
    getContext: () => ({
      drawImage: (...args) => drawCalls.push(args),
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {}
    })
  };
  return element;
}
const document = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, selector === '#preview' ? canvas() : {style: {}, disabled: true, children: [], querySelectorAll:()=>[], getBoundingClientRect:()=>({left:0,top:0,width:400,height:400}),setPointerCapture:()=>{}});
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
  const swContext=vm.createContext({self:{location:{origin:'https://neske89.github.io'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(type,handler)=>handlers[type]=handler},URL,caches:{open:async()=>cache,keys:async()=>['scene-splitter-v2','scene-splitter-v3','scene-splitter-v4','unrelated-cache'],delete:async key=>deleted.push(key),match:async()=>({offline:true})},fetch:async()=>({ok:true,clone:()=>({})})});
  vm.runInContext(fs.readFileSync(__dirname+'/sw.js','utf8'),swContext);
  let pending;
  handlers.install({waitUntil:p=>pending=p});await pending;
  handlers.activate({waitUntil:p=>pending=p});await pending;
  assert.deepStrictEqual(deleted,['scene-splitter-v2','scene-splitter-v3']);
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
