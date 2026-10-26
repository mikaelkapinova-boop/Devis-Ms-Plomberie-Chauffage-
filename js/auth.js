/* Accès protégé + chiffrement des données qui quittent l'appareil (AES-GCM 256, clé dérivée du mot de passe). */
'use strict';
const AUTH={
  ksalt:'gIRolpAOEHxumriSyVGOpw==',   /* sel fixe : la clé de chiffrement est identique sur tous les appareils */
  iter:150000
};
let KEY=null; /* CryptoKey AES-GCM de la session */
let CLOUD_SYNC_TOKEN='',AUTH_SYNC_ERROR='';
const b2a=u=>btoa(String.fromCharCode(...new Uint8Array(u))),a2b=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),te=new TextEncoder(),tdd=new TextDecoder();
async function pbk(pass,salt,len=32){const k=await crypto.subtle.importKey('raw',te.encode(pass),'PBKDF2',false,['deriveBits']);return crypto.subtle.deriveBits({name:'PBKDF2',salt:a2b(salt),iterations:AUTH.iter,hash:'SHA-256'},k,len*8)}
async function mkKey(pass){const bits=await pbk(pass,AUTH.ksalt);return crypto.subtle.importKey('raw',bits,'AES-GCM',true,['encrypt','decrypt'])}
async function encJSON(obj){if(!KEY)throw new Error('non connecté');const iv=crypto.getRandomValues(new Uint8Array(12)),ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},KEY,te.encode(JSON.stringify(obj)));return{enc:1,alg:'AES-GCM-256/PBKDF2-SHA256',iv:b2a(iv),ct:b2a(ct)}}
async function decJSON(o){if(!o||o.enc!==1)return o;if(!KEY)throw new Error('non connecté');const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:a2b(o.iv)},KEY,a2b(o.ct));return JSON.parse(tdd.decode(pt))}
/* session */
async function authSyncSession(id,pass){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);let r;try{r=await fetch(CLOUD_SYNC_API+'/api/sync-auth',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({id:String(id||'').trim().toLowerCase(),pass:String(pass||'')}),signal:controller.signal})}catch(e){if(e&&e.name==='AbortError')throw new Error('Le serveur de synchronisation ne répond pas.');throw new Error('Le stockage partagé est inaccessible. Vérifie la connexion Internet.')}finally{clearTimeout(timeout)}let j={};try{j=await r.json()}catch(e){}if(!r.ok||!j.token){const error=new Error(r.status===429?'Trop de tentatives de connexion. Réessaie plus tard.':j.error||'Connexion au stockage en ligne impossible');error.status=r.status;throw error}return j.token}
function authClearStoredSession(){for(const name of ['ms_key','ms_cloud_token','ms_try','ms_lock']){try{localStorage.removeItem(name)}catch(e){}try{sessionStorage.removeItem(name)}catch(e){}}}
async function authLogin(id,pass){authClearStoredSession();CLOUD_SYNC_TOKEN='';KEY=null;AUTH_SYNC_ERROR='';try{CLOUD_SYNC_TOKEN=await authSyncSession(id,pass);KEY=await mkKey(pass);return true}catch(e){CLOUD_SYNC_TOKEN='';KEY=null;AUTH_SYNC_ERROR=e&&e.message||'Stockage en ligne indisponible';throw new Error('Connexion en ligne impossible : '+AUTH_SYNC_ERROR)}}
function authLogout(){authClearStoredSession();CLOUD_SYNC_TOKEN='';KEY=null;location.reload()}
/* écran de connexion */
function loginUI(){const el=document.createElement('div');el.id='login';el.innerHTML=`<form class="lg" onsubmit="return doLogin(event)"><img src="${typeof LGD!=='undefined'?LGD:''}" alt="" class="lgi"><h1>Ms Plomberie &amp; Chauffage</h1><p>Espace privé — devis, factures, planning</p><label><span>Identifiant</span><input id="lid" autocomplete="username" autocapitalize="none" required></label><label><span>Mot de passe</span><input id="lpw" type="password" autocomplete="current-password" required></label><button type="submit" id="lbt">Se connecter</button><small id="lerr"></small></form>`;document.body.appendChild(el);setTimeout(()=>document.getElementById('lid')?.focus(),50)}
function splashHide(){const s=document.getElementById('splash');if(s){s.classList.add('out');setTimeout(()=>s.remove(),600)}}
async function retrySharedBoot(){if(await window.boot())splashHide()}
async function doLogin(e){e.preventDefault();const b=document.getElementById('lbt'),er=document.getElementById('lerr'),pw=document.getElementById('lpw');b.disabled=true;b.textContent='Connexion…';er.textContent='';try{await authLogin(document.getElementById('lid').value,pw.value);pw.value='';b.textContent='Synchronisation…';const ready=await window.boot();document.getElementById('login')?.remove();if(ready)splashHide()}catch(x){pw.value='';er.textContent=x.message||'Erreur';b.disabled=false;b.textContent='Se connecter'}return false}
async function authStart(){authClearStoredSession();if(!crypto.subtle){document.body.innerHTML='<p style="padding:40px;text-align:center;font-family:-apple-system,sans-serif">Ouvre l\'application en https pour te connecter.</p>';return}loginUI();splashHide()}
