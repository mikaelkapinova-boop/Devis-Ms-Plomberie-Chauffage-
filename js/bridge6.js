/* Ms Devis 6.0 — liaison PC/ChatGPT via Bridge */
'use strict';
const BRIDGE6_DEFAULT_URL = '';
let BRIDGE6 = (() => { try { return JSON.parse(localStorage.getItem('ms_bridge6') || '{}'); } catch(e){ return {}; } })();
let BRIDGE6_WS = null;

function bridge6SaveCfg(){
  try{localStorage.setItem('ms_bridge6',JSON.stringify(BRIDGE6));}catch(e){}
}
function bridge6Url(){
  return String(BRIDGE6.url || '').replace(/\/$/,'');
}
function bridge6Status(){
  return !!(BRIDGE6_WS && BRIDGE6_WS.readyState===WebSocket.OPEN);
}
function bridge6RenderPanel(){
  const el=document.getElementById('bridge6panel'); if(!el)return;
  const ok=bridge6Status();
  el.innerHTML=
    '<div style="padding:10px 0">'+
    '<div style="font-weight:700;margin-bottom:6px">🖥️ Bridge PC 6.0 <span class="mcdot '+(ok?'on':'')+'"></span></div>'+
    '<div style="font-size:12px;color:var(--mu);margin-bottom:8px">'+(ok?'PC connecté':'PC non connecté')+'</div>'+
    '<label>Adresse du Bridge<input id="b6url" value="'+esc(bridge6Url())+'" placeholder="https://…trycloudflare.com" autocapitalize="none" spellcheck="false"></label>'+
    '<label>Code de connexion<input id="b6token" value="'+esc(BRIDGE6.token||'')+'" placeholder="Code affiché sur le PC" autocapitalize="none" spellcheck="false"></label>'+
    '<div class="g2" style="margin-top:8px"><button class="b gh" data-a="bridge6save"><span>Enregistrer</span></button><button class="b" data-a="bridge6connect"><span>Connecter</span></button></div>'+
    '<a class="b cu" href="https://devis-ms-plomberie-chauffage.vercel.app/bridge" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;margin-top:8px"><span>🖥️ Télécharger le Bridge PC 6.0</span></a>'+
    '</div>';
}
function bridge6Connect(){
  if(BRIDGE6_WS)try{BRIDGE6_WS.close()}catch(e){}
  const base=bridge6Url(), token=String(BRIDGE6.token||'');
  if(!base||!token)return toast('Renseigne l’adresse et le code du Bridge PC');
  const wsUrl=base.replace(/^http:/,'ws:').replace(/^https:/,'wss:')+'/ws?token='+encodeURIComponent(token);
  try{
    BRIDGE6_WS=new WebSocket(wsUrl);
    BRIDGE6_WS.onopen=()=>{BRIDGE6_WS.send(JSON.stringify({type:'hello',app:'Ms Devis',version:'6.0'}));toast('PC connecté');bridge6RenderPanel();};
    BRIDGE6_WS.onclose=()=>{bridge6RenderPanel();};
    BRIDGE6_WS.onerror=()=>{toast('Connexion au Bridge impossible');bridge6RenderPanel();};
    BRIDGE6_WS.onmessage=e=>{
      let m={};try{m=JSON.parse(e.data)}catch(x){return}
      if(m.type==='status'){BRIDGE6Render?.();}
      if(m.type==='response'){
        ASBUSY=false;
        chatPush({r:'a',t:String(m.text||''),via:'ChatGPT · Bridge PC 6.0'});
        thSave(); render();
      }
      if(m.type==='error'){
        ASBUSY=false;
        chatPush({r:'a',t:String(m.message||'Erreur Bridge'),via:'Bridge PC 6.0'});render();
      }
    };
  }catch(e){toast('Erreur Bridge : '+e.message)}
}
function bridge6Send(t,txt,clear){
  if(!bridge6Status()) bridge6Connect();
  if(!BRIDGE6_WS || BRIDGE6_WS.readyState!==WebSocket.OPEN) return toast('Connecte le Bridge PC dans le menu IA');
  const text=txt||'Analyse les fichiers joints et réponds à ma demande.';
  const id='b6_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  chatPush({r:'u',t:text});
  clear(); ASBUSY=true; render();
  BRIDGE6_WS.send(JSON.stringify({type:'chat',id,text,thread_id:TH().tid||''}));
}
(function(){
  const old=window.asSend;
  if(typeof old==='function'){
    window.asSend=async function(){
      try{ if(TH().ai==='pcgpt') return bridge6Send(TH(),($('#cin')?.value||'').trim(),()=>{const e=$('#cin');if(e){e.value='';cinGrow(e)};draftClear('cin')}); }catch(e){}
      return old();
    };
  }
  const oldSheet=window.sheetAct;
  if(typeof oldSheet==='function'){
    window.sheetAct=function(a,v,b){
      if(a==='bridge6save'){
        BRIDGE6.url=(document.getElementById('b6url')?.value||'').trim();
        BRIDGE6.token=(document.getElementById('b6token')?.value||'').trim();
        bridge6SaveCfg(); toast('Configuration Bridge enregistrée'); bridge6Connect(); return;
      }
      if(a==='bridge6connect'){ return bridge6Connect(); }
      return oldSheet(a,v,b);
    };
  }
  const oldSheetOpen=window.sheetOpen;
  if(typeof oldSheetOpen==='function'){
    window.sheetOpen=function(v){
      const r=oldSheetOpen(v);
      if(v==='ia') setTimeout(()=>{
        const pn=document.querySelector('#sheet .pn'); if(!pn||document.getElementById('bridge6panel'))return;
        const d=document.createElement('div'); d.className='note'; d.id='bridge6panel'; pn.appendChild(d);
        if(typeof bridge6RenderPanel==='function')bridge6RenderPanel();
      },20);
      return r;
    };
  }
})();
