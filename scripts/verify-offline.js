const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const handlers = {}, stored = new Map();
const key = request => typeof request === 'string' ? request : request.url;
const context = vm.createContext({ URL, self: {
  location: { origin: 'https://neske89.github.io', href: 'https://neske89.github.io/scene-splitter/sw.js' },
  addEventListener: (name, handler) => handlers[name] = handler,
}, caches: { match: async request => stored.get(key(request)), open: async () => ({ put: async (request, response) => stored.set(key(request), response) }) },
  fetch: async () => ({ ok: true, clone() { return this; } }),
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), context);
async function request(url) {
  let response, background;
  handlers.fetch({ request: { url, method: 'GET', mode: 'cors' }, respondWith: promise => response = promise, waitUntil: promise => background = promise });
  const result = await response; await background; return result;
}
async function main() {
  for (const asset of ['translations.js', 'ai-worker.js', 'vendor/tf.min.js', 'vendor/upscaler.min.js', 'vendor/models/slim/x2/definition.js', 'vendor/models/slim/x2/model.json', 'vendor/models/slim/x2/group1-shard1of1.bin']) {
    const url = 'https://neske89.github.io/scene-splitter/' + asset;
    assert((await request(url)).ok); assert(stored.has(url));
  }
  context.fetch = async () => { throw Error('offline'); };
  for (const url of stored.keys()) assert((await request(url)).ok);
  assert.strictEqual(await request('https://other.example/model.json'), undefined);
  assert.strictEqual(await request('https://neske89.github.io/another-project/model.json'), undefined);
  context.fetch = async () => ({ ok: false });
  const bad = 'https://neske89.github.io/scene-splitter/vendor/missing.bin';
  assert.strictEqual((await request(bad)).ok, false); assert(!stored.has(bad));
  console.log('Lazy AI scripts/weights cached, offline reuse, scope isolation and failed-response exclusion: OK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
