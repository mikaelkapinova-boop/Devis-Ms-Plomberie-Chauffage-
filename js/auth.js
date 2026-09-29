/* Accès protégé + chiffrement des données qui quittent l'appareil (AES-GCM 256, clé dérivée du mot de passe). */
'use strict';
const AUTH={
  users:[{id:'albania54',salt:'df2hT+h1IZTfZUIY1ingzQ==',hash:'TokzZHQ9hyuo/x1TL5QJBozuXxNMnvNXQx1CURgu4Ms='}],
  ksalt:'gIRolpAOEHxumriSyVGOpw==',   /* sel fixe : la clé de chiffrement est identique sur tous les appareils */
  iter:150000,
  maxTry:5, lockMs:60000
};
let KEY=null; /* CryptoKey AES-GCM de la session */
const b2a=u=>btoa(String.fromCharCode(...new Uint8Array(u))),a2b=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),te=new TextEncoder(),tdd=new TextDecoder();
async function pbk(pass,salt,len=32){const k=await crypto.subtle.importKey('raw',te.encode(pass),'PBKDF2',false,['deriveBits']);return crypto.subtle.deriveBits({name:'PBKDF2',salt:a2b(salt),iterations:AUTH.iter,hash:'SHA-256'},k,len*8)}
async function mkKey(pass){const bits=await pbk(pass,AUTH.ksalt);return crypto.subtle.importKey('raw',bits,'AES-GCM',true,['encrypt','decrypt'])}
async function encJSON(obj){if(!KEY)throw new Error('non connecté');const iv=crypto.getRandomValues(new Uint8Array(12)),ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},KEY,te.encode(JSON.stringify(obj)));return{enc:1,alg:'AES-GCM-256/PBKDF2-SHA256',iv:b2a(iv),ct:b2a(ct)}}
async function decJSON(o){if(!o||o.enc!==1)return o;if(!KEY)throw new Error('non connecté');const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:a2b(o.iv)},KEY,a2b(o.ct));return JSON.parse(tdd.decode(pt))}
/* session */
async function authRestore(){try{const raw=localStorage.getItem('ms_key')||sessionStorage.getItem('ms_key');if(!raw)return false;const j=JSON.parse(raw);if(j.exp&&j.exp<Date.now()){localStorage.removeItem('ms_key');return false}KEY=await crypto.subtle.importKey('raw',a2b(j.k),'AES-GCM',true,['encrypt','decrypt']);return true}catch(e){return false}}
async function authLogin(id,pass,remember){const lk=Number(localStorage.getItem('ms_lock')||0);if(lk>Date.now())throw new Error('Trop d\'essais. Réessaie dans '+Math.ceil((lk-Date.now())/1000)+' s.');
const u=AUTH.users.find(x=>x.id===String(id||'').trim().toLowerCase());let ok=false;if(u){const h=b2a(await pbk(id.trim().toLowerCase()+':'+pass,u.salt));ok=h===u.hash}
if(!ok){const n=Number(localStorage.getItem('ms_try')||0)+1;localStorage.setItem('ms_try',String(n));if(n>=AUTH.maxTry){localStorage.setItem('ms_lock',String(Date.now()+AUTH.lockMs));localStorage.setItem('ms_try','0')}throw new Error('Identifiant ou mot de passe incorrect')}
localStorage.setItem('ms_try','0');KEY=await mkKey(pass);const raw=JSON.stringify({k:b2a(await crypto.subtle.exportKey('raw',KEY)),exp:remember?Date.now()+30*864e5:0});(remember?localStorage:sessionStorage).setItem('ms_key',raw);return true}
function authLogout(){localStorage.removeItem('ms_key');sessionStorage.removeItem('ms_key');KEY=null;location.reload()}
/* écran de connexion */
function loginUI(){const el=document.createElement('div');el.id='login';el.innerHTML=`<form class="lg" onsubmit="return doLogin(event)"><img src="${typeof LGD!=='undefined'?LGD:''}" alt="" class="lgi"><h1>Ms Plomberie &amp; Chauffage</h1><p>Espace privé — devis, factures, planning</p><label><span>Identifiant</span><input id="lid" autocomplete="username" autocapitalize="none" required></label><label><span>Mot de passe</span><input id="lpw" type="password" autocomplete="current-password" required></label><label class="rm"><input type="checkbox" id="lrm" checked> Rester connecté sur cet appareil (30 jours)</label><button type="submit" id="lbt">Se connecter</button><small id="lerr"></small></form>`;document.body.appendChild(el);setTimeout(()=>document.getElementById('lid')?.focus(),50)}
async function doLogin(e){e.preventDefault();const b=document.getElementById('lbt'),er=document.getElementById('lerr');b.disabled=true;b.textContent='Vérification…';er.textContent='';try{await authLogin(document.getElementById('lid').value,document.getElementById('lpw').value,document.getElementById('lrm').checked);document.getElementById('login').classList.add('out');setTimeout(()=>document.getElementById('login')?.remove(),350);boot()}catch(x){er.textContent=x.message||'Erreur';b.disabled=false;b.textContent='Se connecter'}return false}
async function authStart(){if(!crypto.subtle){document.body.innerHTML='<p style="padding:40px;text-align:center;font-family:-apple-system,sans-serif">Ouvre l\'application en https pour te connecter.</p>';return}if(await authRestore())boot();else loginUI()}
