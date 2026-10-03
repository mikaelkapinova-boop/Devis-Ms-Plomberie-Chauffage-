/* Ms Plomberie & Chauffage — Swarm Core v1
   Cerveau collectif léger : soldats éphémères, mémoire de mission partagée,
   déduplication, tâches lentes non bloquantes et registre d'outils permanent.
*/
'use strict';
const SWARM_KEY='ms_swarm_core_v1', SWARM_MAX_KNOW=250, SWARM_MAX_TOOLS=250;
const SWARM_ROLES=[
{id:'planner',n:'Planificateur',icon:'🧭',focus:'décompose la mission en sous-problèmes indépendants'},
{id:'researcher',n:'Chercheur',icon:'🔎',focus:'cherche les faits et sources utiles'},
{id:'coder',n:'Codeur',icon:'🧑‍💻',focus:'architecture, code, tests et correction'},
{id:'critic',n:'Contradicteur',icon:'🕵️',focus:'cherche les erreurs, contradictions et hypothèses fragiles'},
{id:'verifier',n:'Vérificateur',icon:'✅',focus:'valide les résultats et arrête les recherches devenues inutiles'},
{id:'synth',n:'Synthèse',icon:'🧠',focus:'fusionne les résultats sans duplication'}
];
function swarmLoad(){try{return Object.assign({version:1,tools:[],knowledge:[],missions:0},JSON.parse(localStorage.getItem(SWARM_KEY)||'{}'));}catch(e){return{version:1,tools:[],knowledge:[],missions:0};}}
function swarmSave(x){try{localStorage.setItem(SWARM_KEY,JSON.stringify(x));}catch(e){}}
function swarmNorm(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim();}
function swarmHash(s){let h=2166136261,z=String(s);for(let i=0;i<z.length;i++){h^=z.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);}
function swarmAddTool(tool){const db=swarmLoad(),t=Object.assign({id:'tool_'+swarmHash(tool&&tool.name||Date.now()),name:'',kind:'generic',description:'',status:'ready',created:Date.now()},tool||{}),i=db.tools.findIndex(x=>x.id===t.id||swarmNorm(x.name)===swarmNorm(t.name));if(i>=0)db.tools[i]=Object.assign({},db.tools[i],t);else db.tools.unshift(t);db.tools=db.tools.slice(0,SWARM_MAX_TOOLS);swarmSave(db);return t;}
function swarmRemember(k){if(!k||!k.text)return;const db=swarmLoad(),key=swarmNorm(k.key||k.text).slice(0,300),item=Object.assign({key:key,text:'',source:'',confidence:.5,tags:[],ts:Date.now()},k,{key:key}),i=db.knowledge.findIndex(x=>x.key===key);if(i>=0)db.knowledge[i]=Object.assign({},db.knowledge[i],item);else db.knowledge.unshift(item);db.knowledge=db.knowledge.slice(0,SWARM_MAX_KNOW);swarmSave(db);}
function swarmFind(q,limit){const n=swarmNorm(q),db=swarmLoad();return db.knowledge.filter(x=>{const z=swarmNorm((x.key||'')+' '+(x.text||'')+' '+(x.tags||[]).join(' '));return n.split(' ').filter(w=>w.length>3).some(w=>z.includes(w));}).slice(0,limit||8);}
function swarmTools(){return swarmLoad().tools;}
function swarmMission(question,opts){const id='m_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),max=Math.max(1,Math.min(Number(opts&&opts.maxSoldiers)||1000,1000)),n=Math.max(1,Math.min(Number(opts&&opts.soldiers)||10,max)),db=swarmLoad();db.missions=(db.missions||0)+1;swarmSave(db);return{id:id,question:String(question||'').trim(),created:Date.now(),target:n,max:max,status:'running',facts:new Map(),urls:new Set(),tasks:new Map(),results:[],soldiers:[],pending:0,done:0,blocked:0,errors:0};}
function swarmPublish(m,fact){if(!fact)return false;const key=swarmNorm(fact.key||fact.claim||fact.text).slice(0,260);if(!key||m.facts.has(key))return false;m.facts.set(key,Object.assign({key:key,text:'',sources:[],confidence:.5},fact));return true;}
function swarmClaim(m,task){const key=swarmNorm(task.key||task.title||task.text);if(!key||m.tasks.has(key))return false;m.tasks.set(key,Object.assign({},task,{key:key,state:'running',started:Date.now()}));m.pending++;return true;}
function swarmTaskDone(m,key,patch){const t=m.tasks.get(key);if(!t)return;Object.assign(t,patch||{},{state:(patch&&patch.state)||'done',ended:Date.now()});m.pending=Math.max(0,m.pending-1);m.done++;}
function swarmKnownText(m){return Array.from(m.facts.values()).slice(-60).map(x=>'- '+(x.text||x.key)).join('\n');}
function swarmUrlKnown(m,url){const u=String(url||'').split('#')[0].replace(/\/$/,'');if(!/^https?:\/\//i.test(u))return true;if(m.urls.has(u))return true;m.urls.add(u);return false;}
function swarmConcurrency(n){n=Math.max(1,Number(n)||1);if(n<=10)return Math.min(5,n);if(n<=100)return Math.min(12,Math.ceil(n/5));return Math.min(24,Math.ceil(Math.sqrt(n)));}
function swarmRole(i,total){if(total<=SWARM_ROLES.length)return SWARM_ROLES[i%SWARM_ROLES.length];if(i<Math.ceil(total*.45))return SWARM_ROLES[1];if(i<Math.ceil(total*.65))return i%2?SWARM_ROLES[2]:SWARM_ROLES[3];return i%2?SWARM_ROLES[4]:SWARM_ROLES[1];}
function swarmModeFor(t){return t&&t.r==='profond'?'high':t&&t.r==='raison'?'medium':'low';}
async function swarmSoldier(m,idx,t,task){
 const role=swarmRole(idx,m.target),known=swarmKnownText(m).slice(-7000),prior=swarmFind(m.question,6).map(x=>'- '+x.text+' ['+(x.source||'mémoire')+']').join('\n');
 const prompt=[
 'Tu es le soldat '+(idx+1)+'/'+m.target+' d’un cerveau collectif.',
 'RÔLE: '+role.n+'. OBJECTIF: '+role.focus+'.',
 'MISSION: '+m.question,
 task?'SOUS-MISSION UNIQUE: '+(task.text||task.title):'',
 'INFORMATIONS DÉJÀ TROUVÉES. Ne les recherche pas à nouveau sauf pour les vérifier:\n'+(known||'(aucune)'),
 'CONNAISSANCES ANTÉRIEURES PERTINENTES:\n'+(prior||'(aucune)'),
 'RÈGLE: apporte une information nouvelle ou une vérification. Si quelque chose est déjà trouvé, passe à autre chose.',
 'Si une source est lente/inaccessible, signale-la comme WAITING et propose une autre piste. Ne reste pas bloqué.',
 'Pour le code: propose du code complet et testable. Pour la recherche: donne les sources. Pour une affirmation importante: niveau de confiance.',
 'SORTIE:\nRESULTAT: ...\nSOURCES: ...\nNOUVEAUX_FAITS: ...\nPROCHAINE_ACTION: ...'
 ].filter(Boolean).join('\n\n');
 if(typeof pk!=='function'||!pk())return{role:role.id,text:'Noyau local actif : aucune API IA disponible pour ce soldat.',sources:[],local:true};
 const model=typeof modEff==='function'?modEff(t):null;
 const body={model:model&&model.id?model.id:'sonar',instructions:prompt,input:[{role:'user',content:prompt}],max_output_tokens:(role.id==='critic'||role.id==='verifier')?2200:3000,max_steps:role.id==='researcher'?5:3,reasoning:{effort:swarmModeFor(t)},tools:[{type:'web_search',max_results:5},{type:'fetch_url'}]};
 const j=await apiPost(body);if(j._err)throw new Error(j._msg||'Erreur API');
 const out=j.output_text||(j.output||[]).flatMap(o=>o.content||[]).filter(c=>c.text).map(c=>c.text).join('\n')||'';
 const urls=(out.match(/https?:\/\/[^\s)\]>"']+/g)||[]).map(x=>x.replace(/[.,;]+$/,''));
 return{role:role.id,text:out,sources:urls,local:false};
}
function swarmPlan(question,count){const base=[
{key:'objectif',title:'Objectif',text:'Définir précisément le résultat attendu pour: '+question},
{key:'faits',title:'Faits',text:'Trouver les faits indispensables à: '+question},
{key:'solutions',title:'Solutions',text:'Chercher les meilleures solutions existantes pour: '+question},
{key:'risques',title:'Risques',text:'Chercher les erreurs, limites et contre-exemples liés à: '+question},
{key:'implementation',title:'Mise en œuvre',text:'Déterminer comment mettre en œuvre la solution retenue pour: '+question},
{key:'verification',title:'Vérification',text:'Définir comment vérifier que la solution fonctionne pour: '+question}];
const out=[];for(let i=0;i<count;i++)out.push(Object.assign({},base[i%base.length],{key:base[i%base.length].key+'_'+i+'_'+swarmHash(swarmNorm(question))}));return out;}
async function swarmRun(t,question,opts){
 const max=Math.max(1,Math.min(Number(opts&&opts.maxSoldiers)||1000,1000)),initial=Math.max(1,Math.min(Number(opts&&opts.soldiers)||10,max)),m=swarmMission(question,{soldiers:initial,maxSoldiers:max}),plan=swarmPlan(question,Math.min(initial,12)),queue=plan.slice(),slots=swarmConcurrency(initial),live=[];
 plan.forEach(x=>swarmClaim(m,x));
 async function worker(){
   while(queue.length){const task=queue.shift();if(!task)break;
     try{const r=await swarmSoldier(m,m.soldiers.length,t,task);m.soldiers.push({role:r.role,state:'done',ts:Date.now()});(r.sources||[]).forEach(u=>swarmUrlKnown(m,u));swarmPublish(m,{key:swarmHash(r.text),text:r.text,source:(r.sources||[])[0]||'',confidence:.65,tags:[r.role]});swarmTaskDone(m,task.key,{result:r.text,state:'done'});}
     catch(e){m.errors++;swarmTaskDone(m,task.key,{error:String(e.message||e),state:'error'});}
     if(typeof render==='function')render();
   }
 }
 for(let i=0;i<slots;i++)live.push(worker());
 await Promise.all(live);
 const facts=Array.from(m.facts.values()).map(x=>x.text).join('\n').slice(-18000);let final='';
 if(typeof pk==='function'&&pk()){
   const model=typeof modEff==='function'?modEff(t):null,synth='Tu es le commandant. Synthétise les résultats d’une équipe de soldats.\nMISSION: '+question+'\nRÉSULTATS:\n'+facts+'\n\nNe répète pas les recherches. Déduis ce qui est suffisamment établi, signale les contradictions et indique seulement les informations manquantes réellement bloquantes. Donne une réponse directement exploitable.';
   const j=await apiPost({model:model&&model.id?model.id:'sonar',instructions:synth,input:[{role:'user',content:synth}],max_output_tokens:t&&t.r==='profond'?6000:3500,max_steps:3,reasoning:{effort:swarmModeFor(t)}});
   if(!j._err)final=j.output_text||(j.output||[]).flatMap(o=>o.content||[]).filter(c=>c.text).map(c=>c.text).join('\n')||'';
 }
 if(!final)final=facts||'Mission terminée, mais aucun résultat exploitable n’a été produit.';
 m.status='complete';m.final=final;m.finished=Date.now();
 Array.from(m.facts.values()).slice(0,40).forEach(x=>swarmRemember({key:x.key,text:String(x.text||'').slice(0,1600),source:x.source||'',confidence:x.confidence||.5,tags:['swarm']}));
 return m;
}
function swarmStats(){const db=swarmLoad();return{tools:db.tools.length,knowledge:db.knowledge.length,missions:db.missions||0};}
function swarmUI(){const s=swarmStats();return'<div class="swarm-card"><b>🧠 Cerveau collectif</b><span>'+s.tools+' outils · '+s.knowledge+' connaissances compactes · '+s.missions+' missions</span></div>';}
window.SwarmCore={run:swarmRun,addTool:swarmAddTool,remember:swarmRemember,find:swarmFind,tools:swarmTools,stats:swarmStats,ui:swarmUI};
