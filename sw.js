/* Service worker — Ms Plomberie & Chauffage. v3.5 : réseau d'abord pour les fichiers de l'appli
   (les mises à jour apparaissent tout de suite), cache en secours hors connexion. */
const V='ms-v6.0.4';
const SHELL=['./','index.html','js/logo.js','js/pdfpages.js','js/ext.js','js/chat2.js','js/models.js','js/assist.js','js/call.js','js/cam.js','js/pro.js','js/panneau.js','js/outils.js','js/connect.js','js/auth.js','manifest.webmanifest','img/icon-192.png','img/icon-512.png','img/drop-hd.png','apple-touch-icon.png',
'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>Promise.allSettled(SHELL.map(u=>c.add(new Request(u,{cache:'reload'}))))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
if(u.pathname.includes('/inbox/')||u.pathname.includes('/data/')||u.hostname.startsWith('api.'))return; /* toujours en direct */
if(u.origin===location.origin){ /* réseau d'abord */
e.respondWith((async()=>{const c=await caches.open(V);try{const n=await fetch(r,{cache:'no-cache'});if(n.ok)c.put(r,n.clone());return n}catch(err){return (await c.match(r))||(r.mode==='navigate'?(await c.match('index.html'))||(await c.match('./')):Response.error())}})());return}
if(u.hostname==='cdnjs.cloudflare.com'){ /* bibliothèques versionnées : cache d'abord */
e.respondWith((async()=>{const c=await caches.open(V);const hit=await c.match(r);if(hit)return hit;const n=await fetch(r);if(n.ok)c.put(r,n.clone());return n})())}});
