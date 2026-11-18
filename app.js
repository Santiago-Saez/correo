/* Cliente correo 10k — virtualización manual, teclado, lote+undo, estados, perf HUD */
const ROW_H = 76;
const OVERSCAN = 8;
const TOTAL = 10000;
const UNDO_MS = 5000;

/* ---------- utils ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rand = mulberry32(42);
const pick = (arr)=>arr[Math.floor(rand()*arr.length)];
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

/* ---------- datos falsos ---------- */
const FIRST=["Lucía","Mateo","Sofía","Valentina","Santiago","Camila","Diego","Paula","Andrés","Carolina","Javier","Mariana","Felipe","Daniela","Carlos","Ana","Pedro","Laura","Jorge","Natalia","Ricardo","Elena","Miguel","Isabel","Tomás","Gabriela","Hugo","Elena","Martín","Olivia"];
const LAST=["García","Fernández","López","Martínez","Sánchez","Pérez","Gómez","Ruiz","Díaz","Torres","Vargas","Castillo","Morales","Reyes","Cruz","Ortiz","Gutiérrez","Ramos","Mendoza","Aguilar"];
const DOMAINS=["gmail.com","outlook.com","empresa.co","startup.io","universidad.edu","correo.com"];
const SUBJECTS=["Propuesta Q4 — revisión urgente","Fotos del evento de ayer","Tu factura de noviembre está lista","¿Revisamos el roadmap mañana?","[GitHub] PR #4821 listo para review","Oferta: 30% solo esta semana","Acta de la reunión + próximos pasos","Deploy a producción completado ✅","Recordatorio: 1:1 el jueves","Nuevo comentario en Figma","Resultados de la encuesta interna","Viaje a Bogotá — itinerario","Contrato firmado (adjunto)","Retro de la sprint 34","Acceso a la VPN renovado","Bienvenido al beta privado","Error 500 en /api/checkout — logs","Nómina de noviembre disponible","Invitación: webinar de IA aplicada","Tu resumen semanal de actividad"];
const SNIPPETS=["Hola, te comparto el avance para que lo revises antes de la reunión de mañana. Quedé atento a tus comentarios.","Adjunto el documento con los cambios marcados. Creo que la sección 3 necesita una segunda pasada.","El deploy salió sin errores y el p95 bajó de 420ms a 180ms. Dejo los dashboards enlazados.","¿Te parece si movemos el daily a las 9:30? Así no se cruza con la demo del cliente.","Dejé varios comentarios en el PR, la mayoría menores. El approach del caché me gusta.","Confirmada la reserva para 4 personas. Te envío el comprobante y la política de cancelación.","El cliente aprobó la primera fase. La segunda queda sujeta al ajuste de alcance que hablamos.","Resumen: 12 tareas cerradas, 3 en progreso, 1 bloqueada por dependencia de datos.","Te agendé 30 min para revisar métricas. Traigo propuesta de experimento A/B.","Si puedes, échale un ojo hoy — mañana presentamos y quiero llegar con eso cerrado."];
const BODIES=["Hola,\n\nTe escribo para compartir el estado actual del proyecto. Avanzamos bien en los tres frentes: diseño, backend y datos.\n\nPuntos clave:\n• El rendimiento mejoró un 40% tras el cambio de caché.\n• Quedan 2 riesgos abiertos (dependencia de pagos y migración).\n• Propongo una revisión conjunta el jueves a las 10:00.\n\nQuedo atento,\n","¡Hola!\n\nAdjunto encontrarás la versión 2 del documento. Marqué en amarillo lo que cambió respecto a la v1.\n\nMis sugerencias:\n1. Acortar la introducción (está en 3 párrafos, con 1 basta).\n2. Mover la tabla de costos al anexo.\n3. Añadir un ejemplo concreto de uso.\n\n¿Lo vemos 15 min mañana?\n\nSaludos,\n","Equipo,\n\nEl despliegue a producción terminó sin incidentes:\n\n- Duración: 6m 12s\n- Errores 5xx: 0\n- p95 checkout: 180ms (antes 420ms)\n- Rollback disponible: sí (tag v2.14.3)\n\nGracias a todos por el esfuerzo. Seguimos monitoreando.\n"];
const LABELS=[{n:"Trabajo",c:"#2563eb"},{n:"Personal",c:"#16a34a"},{n:"Facturas",c:"#d97706"},{n:"Viajes",c:"#7c3aed"}];

function makeMessages(n, folder){
  const now = Date.now();
  const arr = new Array(n);
  for(let i=0;i<n;i++){
    const fn=pick(FIRST), ln=pick(LAST);
    const from=`${fn} ${ln}`;
    const email=`${fn.toLowerCase()}.${ln.toLowerCase()}@${pick(DOMAINS)}`;
    arr[i]={
      id:`${folder}-${i}`,
      from, email,
      subject:pick(SUBJECTS),
      snippet:pick(SNIPPETS),
      body:pick(BODIES)+`Ref: ${folder.toUpperCase()}-${1000+i}.`,
      ts: now - Math.floor(rand()*30*24*3600*1000) - i*86000*0.002,
      read: rand()<0.55,
      star: rand()<0.08,
      attach: rand()<0.18,
      label: rand()<0.3?pick(LABELS):null,
      folder
    };
  }
  arr.sort((a,b)=>b.ts-a.ts);
  return arr;
}

const store = {
  inbox: makeMessages(TOTAL,"inbox"),
  sent: makeMessages(800,"sent"),
  spam: makeMessages(240,"spam"),
  archive: [],
  trash: [],
};
store.starred = []; // vista derivada

/* ---------- estado UI ---------- */
const ui = {
  folder:"inbox",
  query:"",
  filtered:[],
  focus:0,
  anchor:0,
  selected:new Set(),
  openedId:null,
  demoState:"ok", // ok | loading | empty | error
  undo:null,
};

/* ---------- dom ---------- */
const $ = (id)=>document.getElementById(id);
const viewport=$("viewport"), spacer=$("spacer"), pool=$("pool");
const foldersEl=$("folders"), labelsEl=$("labels");
const searchInput=$("search"), countLabel=$("count-label"), filterTime=$("filter-time");
const batchBar=$("batch-bar"), batchCount=$("batch-count"), selectAll=$("select-all");
const statusbar=$("statusbar");
const readerEmpty=$("reader-empty"), readerContent=$("reader-content");

const FOLDERS=[
  {id:"inbox",icon:"📥",name:"Recibidos"},
  {id:"starred",icon:"⭐",name:"Destacados"},
  {id:"sent",icon:"📤",name:"Enviados"},
  {id:"archive",icon:"🗄️",name:"Archivados"},
  {id:"spam",icon:"🚫",name:"Spam"},
  {id:"trash",icon:"🗑️",name:"Papelera"},
];
function folderList(id){
  if(id==="starred") return store.inbox.filter(m=>m.star&&m.folder==="inbox").concat(store.sent.filter(m=>m.star));
  return store[id]||[];
}
function counts(){return {inbox:store.inbox.length,sent:store.sent.length,spam:store.spam.length,archive:store.archive.length,trash:store.trash.length,starred:store.inbox.filter(m=>m.star).length};}

function renderSidebar(){
  const c=counts();
  foldersEl.innerHTML=FOLDERS.map(f=>`<button class="folder ${ui.folder===f.id?"active":""}" data-folder="${f.id}"><span>${f.icon}</span><span>${f.name}</span><span class="count">${(c[f.id]??0).toLocaleString("es")}</span></button>`).join("");
  labelsEl.innerHTML=LABELS.map(l=>`<div class="label"><span class="dot" style="background:${l.c}"></span>${l.n}</div>`).join("");
}
foldersEl.addEventListener("click",(e)=>{
  const b=e.target.closest("[data-folder]"); if(!b) return;
  switchFolder(b.dataset.folder);
});

/* ---------- filtrado ---------- */
function applyFilter(){
  const t0=performance.now();
  let base = ui.demoState==="empty" ? [] : folderList(ui.folder);
  const q=ui.query.trim().toLowerCase();
  if(q){
    base=base.filter(m=>(m.from+" "+m.subject+" "+m.snippet+" "+m.email).toLowerCase().includes(q));
  }
  ui.filtered=base;
  const dt=performance.now()-t0;
  filterTime.textContent = base.length? `${base.length.toLocaleString("es")} mensajes · filtro en ${dt.toFixed(1)} ms` : "";
  countLabel.textContent = FOLDERS.find(f=>f.id===ui.folder)?.name ?? ui.folder;
  ui.focus=Math.min(ui.focus,Math.max(0,ui.filtered.length-1));
  spacer.style.height=(ui.filtered.length*ROW_H)+"px";
  updateOverlays();
  scheduleRender();
  renderBatchBar();
}

function updateOverlays(){
  const loading=ui.demoState==="loading", err=ui.demoState==="error";
  $("state-loading").classList.toggle("hidden",!loading);
  $("state-error").classList.toggle("hidden",!err);
  const empty=!loading&&!err&&ui.filtered.length===0;
  $("state-empty").classList.toggle("hidden",!empty);
  if(empty){
    const q=ui.query.trim();
    $("empty-title").textContent = q? `Sin resultados para “${q}”` : (ui.folder==="archive"?"Nada archivado todavía":ui.folder==="trash"?"Papelera vacía":"Todo al día");
    $("empty-desc").textContent = q? `Probamos en ${ui.filtered.length} mensajes... bueno, en todos los de esta carpeta. Prueba con otro término.` : "No hay mensajes aquí. Archiva, busca o cambia de carpeta.";
  }
}

/* esqueletos */
$("skeleton-list").innerHTML=Array.from({length:12},()=>'<div class="skeleton"></div>').join("");

function setDemoState(s){
  ui.demoState=s;
  document.querySelectorAll("[data-state]").forEach(b=>b.classList.toggle("active",b.dataset.state===s));
  if(s==="loading"){ updateOverlays(); simulateLoad(()=>{ setDemoState("ok"); }); return; }
  if(s==="error"){ updateOverlays(); scheduleRender(); return; }
  applyFilter();
}
document.querySelectorAll("[data-state]").forEach(b=>b.onclick=()=>setDemoState(b.dataset.state));
$("btn-retry").onclick=()=>{ setDemoState("loading"); };
$("btn-offline").onclick=()=>{ setDemoState("ok"); };
$("empty-cta").onclick=()=>switchFolder("inbox");
$("empty-clear-search").onclick=()=>{ searchInput.value=""; ui.query=""; applyFilter(); };

function simulateLoad(done){
  updateOverlays();
  setTimeout(()=>{ done&&done(); },1100);
}

function switchFolder(f){
  ui.folder=f; ui.focus=0; ui.anchor=0; ui.selected.clear(); ui.openedId=null;
  selectAll.checked=false;
  renderSidebar(); renderReader();
  if(f==="spam"){ // spam simula latencia + error diseñado la 1ª vez? no: carga con esqueleto
    setDemoState("loading");
  } else applyFilter();
}

/* ---------- virtualización manual ---------- */
let poolNodes=[];
let scheduled=false;
const renderTimes=[]; // ms de cada render de lista
let scrollVel=0, lastScrollTop=0, lastScrollT=performance.now();
let fpsFrames=0, fpsVal=60, fpsLastT=performance.now();

function ensurePool(){
  const visible=Math.ceil(viewport.clientHeight/ROW_H)+OVERSCAN*2+2;
  while(poolNodes.length<visible){
    const d=document.createElement("div");
    d.className="row"; d.setAttribute("role","option");
    d._mid=null;
    d.addEventListener("click",(ev)=>{
      const idx=+d.dataset.idx; if(Number.isNaN(idx))return;
      if(ev.shiftKey){ extendSelection(idx); }
      else { setFocus(idx,{anchorReset:!ev.ctrlKey&&!ev.metaKey}); if(ev.target.closest(".row-check input")||ev.ctrlKey||ev.metaKey){ toggleSelect(idx);} else openMessage(idx); }
    });
    pool.appendChild(d);
    poolNodes.push(d);
  }
}

function avatarColor(name){let h=0;for(const c of name)h=(h*31+c.charCodeAt(0))%360;return `hsl(${h} 60% 45%)`;}
function initials(name){return name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();}
function fmtTime(ts){const d=new Date(ts),now=new Date();const sameDay=d.toDateString()===now.toDateString();if(sameDay)return d.toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});const diff=(now-d)/86400000;if(diff<7)return d.toLocaleDateString("es",{weekday:"short"});return d.toLocaleDateString("es",{day:"numeric",month:"short"});}

function rowHTML(m,idx){
  const sel=ui.selected.has(m.id), foc=idx===ui.focus;
  return `<label class="row-check"><input type="checkbox" data-act="check" ${sel?"checked":""} tabindex="-1"/></label>
  <div class="avatar" style="background:${avatarColor(m.from)}">${esc(initials(m.from))}</div>
  <div class="row-main">
    <div class="row-top"><span class="sender">${esc(m.from)}</span><span class="time">${fmtTime(m.ts)}</span></div>
    <div class="subject">${esc(m.subject)}</div>
    <div class="snippet">${esc(m.snippet)}</div>
  </div>
  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
    <button class="star-btn ${m.star?"on":""}" data-act="star" tabindex="-1">${m.star?"★":"☆"}</button>
    ${m.attach?'<span class="badge">📎</span>':""}
    ${m.label?`<span class="badge" style="color:${m.label.c}">${esc(m.label.n)}</span>`:""}
    ${!m.read?'<span class="badge unread-dot">● nuevo</span>':""}
  </div>`;
}

function renderList(){
  scheduled=false;
  if(ui.demoState==="loading"||ui.demoState==="error"){ updatePerfHUD(0); return; }
  const t0=performance.now();
  ensurePool();
  const st=viewport.scrollTop;
  const vh=viewport.clientHeight||600;
  const total=ui.filtered.length;
  let start=Math.max(0,Math.floor(st/ROW_H)-OVERSCAN);
  let end=Math.min(total,Math.ceil((st+vh)/ROW_H)+OVERSCAN);
  if(total===0){ poolNodes.forEach(n=>{n.style.display="none";n._mid=null;}); updatePerfHUD(performance.now()-t0,start,end); return; }
  // reciclar
  let pi=0;
  for(let i=start;i<end;i++){
    const node=poolNodes[pi++];
    const m=ui.filtered[i];
    node.style.display="flex";
    node.style.transform=`translateY(${i*ROW_H}px)`;
    node.dataset.idx=i;
    if(node._mid!==m.id){
      node._mid=m.id;
      node.innerHTML=rowHTML(m,i);
      node.classList.toggle("unread",!m.read);
      node.classList.toggle("read",m.read);
    }
    node.classList.toggle("focused",i===ui.focus);
    node.classList.toggle("selected",ui.selected.has(m.id));
    const cb=node.querySelector('[data-act="check"]');
    if(cb) cb.checked=ui.selected.has(m.id);
  }
  for(let k=pi;k<poolNodes.length;k++){poolNodes[k].style.display="none";poolNodes[k]._mid=null;}
  const dt=performance.now()-t0;
  renderTimes.push(dt); if(renderTimes.length>400)renderTimes.shift();
  scrollVel=Math.abs(st-lastScrollTop)/Math.max(1,(performance.now()-lastScrollT)/1000);
  lastScrollTop=st; lastScrollT=performance.now();
  // delegación star (una vez por render es caro; usamos listener global abajo)
  updatePerfHUD(dt,start,end);
  // mantener foco visible se hace en setFocus, no aquí
}

function scheduleRender(){ if(!scheduled){scheduled=true;requestAnimationFrame(renderList);} }

/* delegación para star/check sin re-render completo */
pool.addEventListener("click",(e)=>{
  const btn=e.target.closest('[data-act="star"]');
  const row=e.target.closest(".row");
  if(!row)return;
  const idx=+row.dataset.idx; const m=ui.filtered[idx]; if(!m)return;
  if(btn){ e.stopPropagation(); m.star=!m.star; row._mid=null; renderSidebar(); scheduleRender(); return; }
  if(e.target.closest('[data-act="check"]')){ toggleSelect(idx); e.stopPropagation(); }
});

viewport.addEventListener("scroll",()=>{ scheduleRender(); },{passive:true});
window.addEventListener("resize",()=>{ poolNodes=[]; pool.innerHTML=""; scheduleRender(); });

/* ---------- perf HUD ---------- */
const barsEl=$("perf-bars");
const barNodes=Array.from({length:60},()=>{const i=document.createElement("i");barsEl.appendChild(i);return i;});
let barTick=0;
function stats(arr){if(!arr.length)return{avg:0,p95:0,max:0};const s=[...arr].sort((a,b)=>a-b);return{avg:arr.reduce((a,b)=>a+b,0)/arr.length,p95:s[Math.min(s.length-1,Math.floor(s.length*0.95))],max:s[s.length-1]};}
function updatePerfHUD(last,start,end){
  const s=stats(renderTimes.slice(-120));
  $("m-last").textContent=`${last.toFixed(2)} ms`;
  $("m-avg").textContent=`${s.avg.toFixed(2)} ms`;
  $("m-p95").textContent=`${s.p95.toFixed(2)} ms`;
  if(start!==undefined) $("m-range").textContent=`${start}–${end} / ${ui.filtered.length.toLocaleString("es")}`;
  $("m-extra").textContent=`${(end??0)-(start??0)} filas · scroll ${Math.round(scrollVel).toLocaleString("es")} px/s · pool ${poolNodes.length}`;
  // barras (throttle: solo cada render)
  barNodes[barTick%60].style.height=`${Math.min(100,last/8*100)}%`;
  barNodes[barTick%60].style.background=last>8?"#f87171":last>3.5?"#fbbf24":"#38bdf8";
  barTick++;
}
(function fpsLoop(){
  const now=performance.now();
  fpsFrames++;
  if(now-fpsLastT>=500){ fpsVal=Math.round(fpsFrames*1000/(now-fpsLastT)); fpsFrames=0; fpsLastT=now; $("fps-val").textContent=fpsVal; $("fps-val").style.color=fpsVal>=55?"#4ade80":fpsVal>=30?"#fbbf24":"#f87171"; }
  requestAnimationFrame(fpsLoop);
})();

/* stress test: scroll rápido programático y reporte */
$("btn-stress").onclick=async ()=>{
  if(!ui.filtered.length) return;
  const samples=[];
  const origPush=renderTimes.push.bind(renderTimes);
  const start=performance.now();
  let frames=0;
  const max=viewport.scrollHeight-viewport.clientHeight;
  statusbar.textContent="⚡ Scroll test en curso: de 0 → final a máxima velocidad…";
  viewport.scrollTop=0;
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const t0=performance.now();
  await new Promise((resolve)=>{
    const dur=2200; let lastFpsT=t0;
    function step(now){
      const p=Math.min(1,(now-t0)/dur);
      viewport.scrollTop=max*p; // scroll nativo → render vía rAF
      frames++;
      if(p<1) requestAnimationFrame(step); else resolve();
    }
    requestAnimationFrame(step);
  });
  await new Promise(r=>setTimeout(r,400)); // deja asentar
  const s=stats(renderTimes.slice(-Math.min(300,renderTimes.length)));
  const total=(performance.now()-start)/1000;
  const msg=`⚡ Scroll test: ${(max|0).toLocaleString("es")}px en ${total.toFixed(2)}s · ${frames} frames · render medio ${s.avg.toFixed(2)} ms · p95 ${s.p95.toFixed(2)} ms · máx ${s.max.toFixed(2)} ms · FPS ${fpsVal} · ${ui.filtered.length.toLocaleString("es")} mensajes`;
  statusbar.textContent=msg;
  console.log("[scroll-test]",msg,{renderTimes:renderTimes.slice(-120)});
};

/* ---------- selección / foco / teclado ---------- */
function setFocus(idx,{anchorReset=true,scroll=true}={}){
  if(!ui.filtered.length)return;
  ui.focus=Math.max(0,Math.min(ui.filtered.length-1,idx));
  if(anchorReset)ui.anchor=ui.focus;
  if(scroll)ensureVisible(ui.focus);
  scheduleRender();
}
function ensureVisible(idx){
  const top=idx*ROW_H, bottom=top+ROW_H;
  const st=viewport.scrollTop, vh=viewport.clientHeight;
  if(top<st)viewport.scrollTop=top-OVERSCAN*ROW_H*0.2;
  else if(bottom>st+vh)viewport.scrollTop=bottom-vh+OVERSCAN*ROW_H*0.2;
}
function toggleSelect(idx){const m=ui.filtered[idx];if(!m)return;ui.selected.has(m.id)?ui.selected.delete(m.id):ui.selected.add(m.id);renderBatchBar();scheduleRender();}
function extendSelection(to){
  const a=Math.min(ui.anchor,to), b=Math.max(ui.anchor,to);
  for(let i=a;i<=b;i++){const m=ui.filtered[i];if(m)ui.selected.add(m.id);}
  ui.focus=to; ensureVisible(to); renderBatchBar(); scheduleRender();
}
function renderBatchBar(){
  const n=ui.selected.size;
  batchBar.classList.toggle("hidden",n===0);
  batchCount.textContent=`${n.toLocaleString("es")} sel.`;
  const allVisible=ui.filtered.length>0&&ui.filtered.every(m=>ui.selected.has(m.id));
  selectAll.checked=allVisible; selectAll.indeterminate=n>0&&!allVisible;
}
selectAll.onchange=()=>{
  if(selectAll.checked){ui.filtered.forEach(m=>ui.selected.add(m.id));}
  else ui.selected.clear();
  renderBatchBar();scheduleRender();
};
document.querySelectorAll("[data-batch]").forEach(b=>b.onclick=()=>batchAction(b.dataset.batch));

function batchAction(kind){
  let ids=[...ui.selected];
  if(kind==="clear"){ui.selected.clear();renderBatchBar();scheduleRender();return;}
  if(kind==="archive"||kind==="delete"){
    if(!ids.length&&ui.filtered[ui.focus])ids=[ui.filtered[ui.focus].id];
    moveMessages(ids,kind==="archive"?"archive":"trash",kind==="archive"?"archivados":"eliminados");
  } else if(kind==="read"||kind==="unread"){
    if(!ids.length&&ui.filtered[ui.focus])ids=[ui.filtered[ui.focus].id];
    const ops=ids.map(id=>{const m=findMsg(id);return m?{id,prev:m.read}:null;}).filter(Boolean);
    ids.forEach(id=>{const m=findMsg(id);if(m)m.read=(kind==="read");});
    pushUndo(`${ids.length} marcados como ${kind==="read"?"leídos":"no leídos"}`,()=>{ops.forEach(o=>{const m=findMsg(o.id,true);if(m)m.read=o.prev;});});
    ui.selected.clear();applyFilter();renderSidebar();
  }
}
function findMsg(id,includeMoved=false){
  for(const k of["inbox","sent","spam","archive","trash"]){const m=store[k].find(x=>x.id===id);if(m)return m;}
  return null;
}
function moveMessages(ids,dest,label){
  const ops=[];
  ids.forEach(id=>{
    for(const k of["inbox","sent","spam","archive","trash"]){
      const i=store[k].findIndex(x=>x.id===id);
      if(i>-1){const[m]=store[k].splice(i,1);ops.push({msg:m,from:k});m.folder=dest;store[dest].unshift(m);break;}
    }
  });
  if(!ops.length)return;
  ui.selected.clear(); ui.openedId=null;
  renderSidebar(); applyFilter(); renderReader();
  pushUndo(`${ops.length} ${label}`,()=>{
    ops.forEach(({msg,from})=>{
      const j=store[dest].findIndex(x=>x.id===msg.id);
      if(j>-1)store[dest].splice(j,1);
      msg.folder=from; store[from].unshift(msg);
    });
    store.inbox.sort((a,b)=>b.ts-a.ts);
    renderSidebar();applyFilter();renderReader();
  });
}

/* toast deshacer con temporizador */
let undoRaf=null;
function pushUndo(text,fn){
  clearTimeout(ui.undo?.timer); cancelAnimationFrame(undoRaf);
  const toast=$("toast"); toast.classList.remove("hidden");
  $("toast-text").textContent=text;
  const bar=$("toast-bar"), count=$("toast-count");
  const t0=performance.now();
  ui.undo={fn,timer:setTimeout(()=>{toast.classList.add("hidden");ui.undo=null;},UNDO_MS)};
  (function tick(){
    const p=1-(performance.now()-t0)/UNDO_MS;
    if(p<=0){return;}
    bar.style.width=(p*100)+"%";
    count.textContent=(p*UNDO_MS/1000).toFixed(1)+"s · Ctrl+Z";
    undoRaf=requestAnimationFrame(tick);
  })();
  $("toast-undo").onclick=doUndo;
}
function doUndo(){ if(!ui.undo)return; clearTimeout(ui.undo.timer); cancelAnimationFrame(undoRaf); ui.undo.fn(); ui.undo=null; $("toast").classList.add("hidden"); }

/* lector */
function openMessage(idx){
  const m=ui.filtered[idx]; if(!m)return;
  ui.openedId=m.id; m.read=true; renderReader(); scheduleRender();
}
function renderReader(){
  const m=ui.openedId?findMsg(ui.openedId):null;
  readerEmpty.classList.toggle("hidden",!!m);
  readerContent.classList.toggle("hidden",!m);
  if(!m)return;
  $("r-subject").textContent=m.subject;
  $("r-from").textContent=`${m.from} <${m.email}>`;
  $("r-date").textContent=new Date(m.ts).toLocaleString("es");
  const av=$("r-avatar");av.textContent=initials(m.from);av.style.background=avatarColor(m.from);
  $("r-tags").innerHTML=`${m.label?`<span class="badge">${esc(m.label.n)}</span>`:""}${m.attach?'<span class="badge">📎 adjunto</span>':""}${m.star?'<span class="badge star">★ destacado</span>':""}<span class="badge">${esc(m.folder)}</span>`;
  $("r-body").textContent=`${m.snippet}\n\n${m.body}\n\n—\nEnviado el ${new Date(m.ts).toLocaleString("es")} · ID ${m.id}`;
}
$("r-close").onclick=()=>{ui.openedId=null;renderReader();viewport.focus();};
$("r-archive").onclick=()=>{if(ui.openedId)moveMessages([ui.openedId],"archive","archivado");};

/* teclado */
document.addEventListener("keydown",(e)=>{
  const inSearch=document.activeElement===searchInput;
  if(e.key==="/"&&!inSearch){e.preventDefault();searchInput.focus();return;}
  if(inSearch){
    if(e.key==="Escape"){searchInput.blur();viewport.focus();}
    return; // mientras se busca, j/k escriben
  }
  if(e.key==="?"|| (e.shiftKey&&e.key==="/")){$("help").classList.remove("hidden");return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();doUndo();return;}
  const k=e.key;
  if(k==="j"||k==="J"||k==="ArrowDown"){e.preventDefault();e.shiftKey?extendSelection(ui.focus+1):setFocus(ui.focus+1);}
  else if(k==="k"||k==="K"||k==="ArrowUp"){e.preventDefault();e.shiftKey?extendSelection(ui.focus-1):setFocus(ui.focus-1);}
  else if(k==="Enter"||k==="o"){e.preventDefault();openMessage(ui.focus);}
  else if(k==="e"||k==="E"){e.preventDefault();const ids=ui.selected.size?[...ui.selected]:(ui.filtered[ui.focus]?[ui.filtered[ui.focus].id]:[]);if(ids.length)moveMessages(ids,ui.folder==="trash"?"trash":"archive","archivado(s)");}
  else if(k==="x"){e.preventDefault();toggleSelect(ui.focus);}
  else if(k==="*"){e.preventDefault();ui.filtered.forEach(m=>ui.selected.add(m.id));renderBatchBar();scheduleRender();}
  else if(k==="Escape"){ui.selected.clear();ui.openedId=null;renderBatchBar();renderReader();scheduleRender();viewport.blur();}
});
$("btn-help").onclick=()=>$("help").classList.remove("hidden");
$("help-close").onclick=()=>$("help").classList.add("hidden");
$("help").addEventListener("click",(e)=>{if(e.target.id==="help")$("help").classList.add("hidden");});
$("btn-compose").onclick=()=>{alert("Demo: redactar no envía nada. Todo es local.");};

/* búsqueda */
let searchT=null;
searchInput.addEventListener("input",()=>{
  clearTimeout(searchT);
  searchT=setTimeout(()=>{ui.query=searchInput.value;ui.focus=0;ui.anchor=0;applyFilter();},120);
});

/* ---------- init ---------- */
renderSidebar();
statusbar.textContent=`Generando ${TOTAL.toLocaleString("es")} mensajes…`;
setDemoState("loading"); // muestra esqueletos diseñados al arrancar
viewport.focus();
