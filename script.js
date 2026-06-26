(function(){
"use strict";

// ─────────────────────────────────────────
// GIST CONFIG
// ─────────────────────────────────────────
const GIST_ID   = '4c966ef04fdf1c58809e0169f458f82e';
const GIST_FILE = 'calendar_db.json';
const GIST_URL  = 'https://api.github.com/gists/' + GIST_ID;

function getToken(){ return localStorage.getItem('cal_gist_token') || ''; }
function setToken(t){ localStorage.setItem('cal_gist_token', t); console.log('Токен сохранён. Обновите страницу.'); }
window.setToken = setToken; // вызывать из консоли: setToken('твой_токен')

const COLORS = ["#c02828","#c8922a","#e8b84a","#6a4a90","#2a6a8a","#5a8040"];
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const MONTHS_G = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const WD = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

const DEFAULT_EVENTS = {
  "2019-10-14": [
    { id:"d1", title:"Бал в Министерстве Магии", desc:"Парадный приём. Дресс-код — мантии.", link:"https://separation.rusff.me/", img:"", color:"#c8922a" }
  ],
  "2019-10-26": [
    { id:"d2", title:"Матч по квиддичу", desc:"Финал сезона.", link:"", img:"", color:"#c02828" },
    { id:"d3", title:"Встреча в «Дырявом котле»", desc:"После матча.", link:"", img:"", color:"#6a8060" }
  ]
};

let store = {};
let adminMode = false;
let saving = false;
let lastSnapshot = '';

const today = new Date();
const st = {y:today.getFullYear(), m:today.getMonth(), py:today.getFullYear(), ed:null};
let selC = COLORS[0];
let activeKey = null;

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function pad(n){ return n<10 ? "0"+n : ""+n; }
function key(y,m,d){ return y+"-"+pad(m+1)+"-"+pad(d); }
function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function $(id){ return document.getElementById(id); }

// ─────────────────────────────────────────
// SAVE STATUS UI
// ─────────────────────────────────────────
function showSaveStatus(state){
  let el = $('save-status');
  if(!el){
    el = document.createElement('div');
    el.id = 'save-status';
    el.className = 'save-status';
    document.body.appendChild(el);
  }
  const states = {
    saving: { text:'⟳ Сохранение…', bg:'#1a1410', color:'#c8922a' },
    ok:     { text:'✓ Сохранено',   bg:'#0f1f12', color:'#7ae0ab' },
    local:  { text:'⚠ Только локально (нет токена/сети)', bg:'#1f1410', color:'#e0ab7a' }
  };
  const s = states[state] || states.ok;
  el.textContent = s.text;
  el.style.background = s.bg;
  el.style.color = s.color;
  el.classList.add('show');
  if(state !== 'saving'){
    clearTimeout(el._t);
    el._t = setTimeout(()=>el.classList.remove('show'), 2500);
  }
}

// ─────────────────────────────────────────
// GIST LOAD / SAVE
// ─────────────────────────────────────────
async function loadFromGist(){
  try{
    const headers = { 'Accept':'application/vnd.github.v3+json' };
    const token = getToken();
    if(token) headers['Authorization'] = 'token ' + token;
    const r = await fetch(GIST_URL, { headers });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    const content = j.files && j.files[GIST_FILE] && j.files[GIST_FILE].content;
    if(!content) return false;
    const parsed = JSON.parse(content);
    const snap = JSON.stringify(parsed);
    if(snap === lastSnapshot) return false;
    lastSnapshot = snap;
    store = parsed;
    return true;
  }catch(e){
    console.warn('Gist load error:', e);
    return false;
  }
}

async function saveToGist(){
  if(saving) return;
  saving = true;
  showSaveStatus('saving');
  const body = JSON.stringify(store, null, 2);
  lastSnapshot = body;
  try{
    const token = getToken();
    if(!token) throw new Error('no token');
    const r = await fetch(GIST_URL, {
      method:'PATCH',
      headers:{
        'Authorization':'token '+token,
        'Accept':'application/vnd.github.v3+json',
        'Content-Type':'application/json'
      },
      body: JSON.stringify({ files:{ [GIST_FILE]:{ content: body } } })
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    showSaveStatus('ok');
  }catch(e){
    console.warn('Gist save error:', e);
    showSaveStatus('local');
  }finally{
    saving = false;
  }
}

async function poll(){
  if(!saving){
    const changed = await loadFromGist();
    if(changed) render();
  }
  setTimeout(poll, 8000);
}

// ─────────────────────────────────────────
// ADMIN MODE
// ─────────────────────────────────────────
function toggleAdmin(){
  adminMode = !adminMode;
  document.body.classList.toggle('admin-mode', adminMode);
  const badge = $('admin-badge');
  if(badge){
    badge.textContent = adminMode ? '✏ Редактирование: ВКЛ' : '✏ Редактирование: ВЫКЛ';
    badge.classList.toggle('off', !adminMode);
  }
}

function createAdminBadge(){
  if(!getToken()) return; // без токена бейдж не появляется — обычные посетители его не видят
  const badge = document.createElement('button');
  badge.id = 'admin-badge';
  badge.className = 'admin-badge off';
  badge.textContent = '✏ Редактирование: ВЫКЛ';
  badge.addEventListener('click', toggleAdmin);
  document.body.appendChild(badge);
}

// ─────────────────────────────────────────
// WEEKDAYS (один раз)
// ─────────────────────────────────────────
function initWeekdays(){
  const w = $("calWeekdays");
  w.innerHTML = "";
  WD.forEach((d,i)=>{
    const el = document.createElement("div");
    el.className = "cal-wd"+(i>4?" we":"");
    el.textContent = d;
    w.appendChild(el);
  });
}

// ─────────────────────────────────────────
// RENDER CALENDAR GRID
// ─────────────────────────────────────────
function render(){
  $("calMonth").textContent = MONTHS[st.m];
  $("calYear").textContent = st.y;
  const g = $("calGrid");
  g.innerHTML = "";
  g.classList.remove("swap"); void g.offsetWidth; g.classList.add("swap");

  const first = new Date(st.y, st.m, 1);
  let lead = first.getDay()-1; if(lead<0) lead=6;
  const dim = new Date(st.y, st.m+1, 0).getDate();
  const pd = new Date(st.y, st.m, 0).getDate();

  const cells = [];
  for(let i=lead-1;i>=0;i--) cells.push({d:pd-i, off:true});
  for(let d=1;d<=dim;d++) cells.push({d, off:false});
  while(cells.length<42) cells.push({d:cells.length-(lead+dim)+1, off:true});

  cells.forEach(c=>{
    const cell = document.createElement("button");
    cell.className = "cal-day"+(c.off?" muted":"");
    if(!c.off){
      const k = key(st.y, st.m, c.d);
      const isT = (st.y===today.getFullYear() && st.m===today.getMonth() && c.d===today.getDate());
      if(isT) cell.classList.add("today");
      const evs = store[k];
      if(evs && evs.length){
        cell.classList.add("has");
        cell.style.setProperty("--tint", evs[0].color||COLORS[0]);
      }
      cell.innerHTML = '<span class="dn">'+c.d+'</span>';
      if(evs && evs.length){
        const dots = document.createElement("div");
        dots.className = "cal-dots";
        evs.slice(0,3).forEach(e=>{
          const dot = document.createElement("span");
          dot.className = "cal-dot";
          dot.style.background = e.color||COLORS[0];
          dot.style.color = e.color||COLORS[0];
          dots.appendChild(dot);
        });
        if(evs.length>3){
          const mo = document.createElement("span");
          mo.className = "cal-more";
          mo.textContent = "+"+(evs.length-3);
          dots.appendChild(mo);
        }
        cell.appendChild(dots);
      }
      cell.addEventListener("click", ()=>openDay(k, c.d));
      cell.addEventListener("mouseenter", ()=>showPop(cell, k, c.d));
      cell.addEventListener("mouseleave", sHide);
    }else{
      cell.innerHTML = '<span class="dn">'+c.d+'</span>';
      cell.disabled = true;
    }
    g.appendChild(cell);
  });
}

// ─────────────────────────────────────────
// HOVER POPUP
// ─────────────────────────────────────────
let pop, hideT=null;
function clrHide(){ if(hideT){ clearTimeout(hideT); hideT=null; } }
function sHide(){ clrHide(); hideT=setTimeout(()=>pop.classList.remove("show"), 200); }

function showPop(cell, k, d){
  clrHide();
  const evs = store[k];
  if(!evs || !evs.length){ pop.classList.remove("show"); return; }
  let h = '<div class="cal-pop-date">'+d+" "+MONTHS_G[st.m]+" "+st.y+"</div>";
  evs.forEach(e=>{
    h += '<div class="pop-ev"><div class="pop-ev-top"><div class="pop-ev-bar" style="background:'+esc(e.color||COLORS[0])+'"></div><div class="pop-ev-title">'+esc(e.title)+'</div></div>';
    if(e.desc) h += '<div class="pop-ev-desc">'+esc(e.desc)+'</div>';
    if(e.img) h += '<img class="pop-ev-img" src="'+esc(e.img)+'" alt="" onerror="this.style.display=\'none\'">';
    if(e.link) h += '<a class="pop-ev-link" href="'+esc(e.link)+'" target="_blank" rel="noopener">Открыть &#x2192;</a>';
    h += '</div>';
  });
  pop.innerHTML = h;
  const r = cell.getBoundingClientRect();
  pop.classList.add("show");
  const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 8;
  let x = r.right+gap; if(x+pw>window.innerWidth-8) x = r.left-pw-gap; if(x<8) x=8;
  let y = r.top; if(y+ph>window.innerHeight-8) y = window.innerHeight-ph-8; if(y<8) y=8;
  pop.style.left = x+"px";
  pop.style.top = y+"px";
}

// ─────────────────────────────────────────
// DAY MODAL
// ─────────────────────────────────────────
function openDay(k, d){
  activeKey = k;
  pop.classList.remove("show");
  $("dayTitle").textContent = d+" "+MONTHS_G[st.m]+" "+st.y;
  resetForm();
  renderEvList();
  $("dayOverlay").classList.add("show");
}

function renderEvList(){
  const list = $("evList");
  const evs = store[activeKey] || [];
  if(!evs.length){
    list.innerHTML = '<div class="ev-empty">&#x2726; &nbsp; Событий нет &nbsp; &#x2726;</div>';
    return;
  }
  list.innerHTML = "";
  evs.forEach(e=>{
    const item = document.createElement("div");
    item.className = "ev-item";
    let h = '<div class="ev-item-bar" style="background:'+esc(e.color)+'"></div><div class="ev-item-main"><div class="ev-item-title">'+esc(e.title)+'</div>';
    if(e.desc) h += '<div class="ev-item-desc">'+esc(e.desc)+'</div>';
    if(e.link) h += '<div class="ev-item-desc"><a href="'+esc(e.link)+'" target="_blank" rel="noopener" style="color:#c8922a;font-family:Cinzel,serif;font-size:10px;letter-spacing:.08em">'+esc(e.link)+'</a></div>';
    h += '</div>';
    if(e.img) h += '<img class="ev-item-img" src="'+esc(e.img)+'" alt="" onerror="this.style.display=\'none\'">';
    h += '<div class="ev-item-acts admin-only"><button class="ev-act" data-edit="'+e.id+'" title="Изменить">&#x270E;</button><button class="ev-act" data-del="'+e.id+'" title="Удалить">&#x2715;</button></div>';
    item.innerHTML = h;
    list.appendChild(item);
  });
  list.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", ()=>startEdit(b.dataset.edit)));
  list.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", ()=>delEv(b.dataset.del)));
}

function resetForm(){
  st.ed = null;
  $("fTitle").value=""; $("fDesc").value=""; $("fLink").value=""; $("fImg").value="";
  selC = COLORS[0];
  renderSw();
  $("formMode").textContent = "Новое событие";
  $("btnSaveEv").textContent = "Добавить событие";
  $("btnCancelEdit").style.display = "none";
}

function startEdit(id){
  const e = (store[activeKey]||[]).find(x=>x.id===id);
  if(!e) return;
  st.ed = id;
  $("fTitle").value = e.title||"";
  $("fDesc").value = e.desc||"";
  $("fLink").value = e.link||"";
  $("fImg").value = e.img||"";
  selC = e.color||COLORS[0];
  renderSw();
  $("formMode").textContent = "Изменить событие";
  $("btnSaveEv").textContent = "Сохранить";
  $("btnCancelEdit").style.display = "block";
  $("fTitle").focus();
}

async function delEv(id){
  if(!store[activeKey]) return;
  store[activeKey] = store[activeKey].filter(x=>x.id!==id);
  if(!store[activeKey].length) delete store[activeKey];
  if(st.ed===id) resetForm();
  renderEvList();
  render();
  await saveToGist();
}

async function saveEv(){
  const title = $("fTitle").value.trim();
  if(!title){
    $("fTitle").focus();
    $("fTitle").style.borderColor = "#c02828";
    setTimeout(()=>$("fTitle").style.borderColor="", 900);
    return;
  }
  const data = { title, desc:$("fDesc").value.trim(), link:$("fLink").value.trim(), img:$("fImg").value.trim(), color:selC };
  if(!store[activeKey]) store[activeKey] = [];
  if(st.ed){
    const e = store[activeKey].find(x=>x.id===st.ed);
    if(e) Object.assign(e, data);
  }else{
    data.id = uid();
    store[activeKey].push(data);
  }
  resetForm();
  renderEvList();
  render();
  await saveToGist();
}

function renderSw(){
  const w = $("swatches");
  w.innerHTML = "";
  COLORS.forEach(c=>{
    const b = document.createElement("button");
    b.className = "sw"+(c===selC?" sel":"");
    b.style.background = c;
    b.addEventListener("click", ()=>{ selC=c; renderSw(); });
    w.appendChild(b);
  });
}

// ─────────────────────────────────────────
// MONTH/YEAR PICKER
// ─────────────────────────────────────────
function openPick(){
  st.py = st.y;
  $("pickYearVal").textContent = st.py;
  renderPickM();
  $("pickOverlay").classList.add("show");
}

function renderPickM(){
  const w = $("pickMonths");
  w.innerHTML = "";
  MONTHS.forEach((m,i)=>{
    const b = document.createElement("button");
    b.className = "pick-m"+(i===st.m && st.py===st.y ? " cur" : "");
    b.textContent = m.slice(0,3).toLowerCase();
    b.addEventListener("click", ()=>{
      st.y = st.py; st.m = i;
      $("pickOverlay").classList.remove("show");
      render();
    });
    w.appendChild(b);
  });
}

// ─────────────────────────────────────────
// EVENT WIRING
// ─────────────────────────────────────────
function wireEvents(){
  pop = $("calPop");
  pop.addEventListener("mouseenter", clrHide);
  pop.addEventListener("mouseleave", sHide);

  $("btnPrev").addEventListener("click", ()=>{ st.m--; if(st.m<0){st.m=11; st.y--;} render(); });
  $("btnNext").addEventListener("click", ()=>{ st.m++; if(st.m>11){st.m=0; st.y++;} render(); });
  $("btnToday").addEventListener("click", ()=>{ st.y=today.getFullYear(); st.m=today.getMonth(); render(); });
  $("calTitle").addEventListener("click", openPick);
  $("pickYearDown").addEventListener("click", ()=>{ st.py--; $("pickYearVal").textContent=st.py; renderPickM(); });
  $("pickYearUp").addEventListener("click", ()=>{ st.py++; $("pickYearVal").textContent=st.py; renderPickM(); });
  $("btnSaveEv").addEventListener("click", saveEv);
  $("btnCancelEdit").addEventListener("click", resetForm);

  document.querySelectorAll(".cal-overlay").forEach(ov=>{
    ov.addEventListener("click", e=>{ if(e.target===ov) ov.classList.remove("show"); });
    ov.querySelectorAll("[data-close]").forEach(x=>x.addEventListener("click", ()=>ov.classList.remove("show")));
  });
  document.addEventListener("keydown", e=>{
    if(e.key==="Escape") document.querySelectorAll(".cal-overlay.show").forEach(o=>o.classList.remove("show"));
  });
  window.addEventListener("scroll", ()=>pop.classList.remove("show"), true);
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
async function init(){
  initWeekdays();
  wireEvents();
  createAdminBadge();

  const loaded = await loadFromGist();
  if(!loaded || Object.keys(store).length===0){
    if(Object.keys(store).length===0){
      store = JSON.parse(JSON.stringify(DEFAULT_EVENTS));
      if(getToken()) await saveToGist();
    }
  }
  render();
  poll();
}

init();

})();
