/* Service worker — Ms Plomberie & Chauffage. Cache de l'application pour un usage hors connexion. */
const V='ms-v3.1.0';
const SHELL=['./','index.html','js/logo.js','js/ext.js','manifest.webmanifest','img/icon-192.png','img/icon-512.png',
'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>Promise.allSettled(SHELL.map(u=>c.add(u)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
if(u.pathname.includes('/inbox/')||u.pathname.includes('/data/')||u.hostname.startsWith('api.'))return; /* toujours en direct */
const isShell=u.origin===location.origin||u.hostname==='cdnjs.cloudflare.com';if(!isShell)return;
e.respondWith((async()=>{const c=await caches.open(V);
if(r.mode==='navigate'||u.pathname.endsWith('index.html')||u.pathname.endsWith('/')){try{const n=await fetch(r);if(n.ok)c.put(r,n.clone());return n}catch(err){return (await c.match(r))||(await c.match('index.html'))||(await c.match('./'))}}
const hit=await c.match(r);if(hit){fetch(r).then(n=>{if(n.ok)c.put(r,n)}).catch(()=>{});return hit}
const n=await fetch(r);if(n.ok)c.put(r,n.clone());return n})())});
