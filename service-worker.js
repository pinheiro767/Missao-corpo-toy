const CACHE='missao-corpo-v1';
const FILES=[
  './','./index.html','./styles.css','./game.js','./manifest.webmanifest',
  './assets/scene/lab.png',
  './assets/player/walk.png','./assets/player/jump.png','./assets/player/pick.png','./assets/player/carry_heart.png','./assets/player/celebrate.png',
  './assets/body/body_base.png',
  './assets/organs/heart.png','./assets/organs/lungs.png','./assets/organs/stomach.png','./assets/organs/intestines.png',
  './assets/tiles/support.png','./assets/tiles/ramp_down.png','./assets/tiles/block_heart.png','./assets/tiles/ground.png','./assets/tiles/platform.png','./assets/tiles/ramp_up.png',
  './assets/icons/icon-192.png','./assets/icons/icon-512.png'
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp;}).catch(()=>caches.match('./index.html'))));
});
