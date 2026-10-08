// Converted fixed-input TensorFlow.js graphs from the pinned web-realesrgan commit.
// The browser only loads the committed, same-origin copies in vendor/models/.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { createHash } = require('crypto');
const root = path.resolve(__dirname, '..');
const commit = '7a5c9f0a82643f7ae4ba4967c039ea03f630a90c';
const files = {
  'real-general/model.json': ['general/model.json', '274e2f03f65333ee243604e73a0ae3bdd6921b05979f9367891c19390dea27dd'],
  'real-general/group1-shard1of2.bin': ['general/group1-shard1of2.bin', '232caa6328ce43d81c286f2180d678d33757c5c86a4cc237bf12663c72f606f1'],
  'real-general/group1-shard2of2.bin': ['general/group1-shard2of2.bin', '97ccb261dadce19cd1315f3d5dc6aa96482a068439c15e2dd531b7ec27b59d67'],
  'real-anime/model.json': ['anime_4x/model.json', '4a9ad72e665cc1e4873465f1fee59d8eeb02fbe8a0757bd405e0345c5eab5ecf'],
  'real-anime/group1-shard1of1.bin': ['anime_4x/group1-shard1of1.bin', '729fca397dbed232662c2b90aa635f703ab1163755dba979536398cad8407720'],
};
function download(url) {
  return new Promise((resolve, reject) => https.get(url, response => {
    if (response.statusCode !== 200) { response.resume(); reject(Error(`Download failed: ${response.statusCode} ${url}`)); return; }
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve(Buffer.concat(chunks)));
    response.on('error', reject);
  }).on('error', reject));
}
async function main() {
  for (const [target, [source, expected]] of Object.entries(files)) {
    const destination = path.join(root, 'vendor/models', target);
    let data = fs.existsSync(destination) ? fs.readFileSync(destination) : null;
    if (!data) {
      data = await download(`https://raw.githubusercontent.com/Aaaou/-web-realesrgan/${commit}/public/${source}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
    }
    const actual = createHash('sha256').update(data).digest('hex');
    if (actual !== expected) throw Error(`Checksum mismatch: ${target}`);
    if (!fs.existsSync(destination)) fs.writeFileSync(destination, data);
  }
  const license = path.join(root, 'vendor/licenses/web-realesrgan.txt');
  if (!fs.existsSync(license)) fs.writeFileSync(license, await download(`https://raw.githubusercontent.com/Aaaou/-web-realesrgan/${commit}/LICENSE`));
  console.log('Verified pinned Real-ESRGAN browser models.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
