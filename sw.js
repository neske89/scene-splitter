const CACHE='scene-splitter-v27';
const ASSETS=['./','./index.html','./ai.js','./grid-detection.js','./translations.js','./ai-worker.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const SCOPE=new URL('./',self.location.href).href;

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith('scene-splitter-')&&k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(SCOPE))return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(response=>{
      if(!response.ok)throw Error('Navigation failed');
      const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put('./index.html',copy)));return response;
    }).catch(()=>caches.match('./index.html')));
    return;
  }
  // Lazy-loaded AI scripts and model weights stay available after the first use.
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(response=>{
    if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)))}
    return response;
  })));
});
