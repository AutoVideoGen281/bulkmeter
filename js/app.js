/* ============================================
   BULKMETER - App Logic
   ============================================ */

// ===================== WORKOUT DEFINITIONS =====================

const R = { set: 120, ex: 180 };

const WORKOUTS = {
  upper: {
    name: 'Upper Body',
    totalSets: 18,
    exercises: [
      { id: 'pull-ups', name: 'Pull Ups', sets: 4 },
      { id: 'push-ups', name: 'Push Ups', sets: 4 },
      { id: 'trx-rows', name: 'TRX Rows', sets: 3 },
      { id: 'dips', name: 'Dips', sets: 3 },
      {
        id: 'shoulder-press-laterals',
        name: 'Shoulder Press + Lateral Raises',
        sets: 2,
        superset: [
          { id: 'shoulder-press', name: 'Shoulder Press' },
          { id: 'lateral-raises', name: 'Lateral Raises' }
        ]
      },
      { id: 'bicep-curls', name: 'Bicep Curls', sets: 2 }
    ]
  },
  legs: {
    name: 'Legs',
    totalSets: 14,
    exercises: [
      { id: 'squats', name: 'Squats', sets: 2 },
      { id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', sets: 2 },
      { id: 'lunges', name: 'Lunges', sets: 2 },
      { id: 'sl-hip-thrust', name: 'SL Hip Thrust', sets: 2 },
      { id: 'calf-raises', name: 'Calf Raises', sets: 2 },
      { id: 'nordic-curls', name: 'Nordic Curls', sets: 2 },
      { id: 'isometric-side-glutes', name: 'Isometric Side Glutes Plank Hold', sets: 2 }
    ]
  },
  core: {
    name: 'Core',
    totalSets: 5,
    exercises: [{
      id: 'plank-side-plank',
      name: 'Plank + Side Plank',
      sets: 5,
      superset: [
        { id: 'plank', name: 'Plank' },
        { id: 'side-plank', name: 'Side Plank' }
      ]
    }]
  }
};

// ===================== STORAGE =====================

const Storage = {
  _get(k, d) { try { const v=localStorage.getItem('b_'+k); return v!==null?JSON.parse(v):d; } catch(e) { return d; } },
  _set(k, v) { try { localStorage.setItem('b_'+k,JSON.stringify(v)); } catch(e) {} },

  getMaxReps() { return this._get('max',{}); },
  updateMaxRep(id, reps) {
    const m = this.getMaxReps();
    if (!m[id] || reps > m[id]) { m[id] = reps; this._set('max', m); }
    return m[id] || 0;
  },
  getMax(id) { return this.getMaxReps()[id] || 0; },
  target(id) { const m = this.getMax(id); return m > 0 ? m + 1 : 0; },

  weight() { return this._get('weight',[]); },
  addWeight(w) {
    const h = this.weight();
    const t = new Date().toISOString().slice(0,10);
    const ex = h.findIndex(e => e.date===t);
    if (ex>=0) h[ex].weight = w; else h.push({date:t,weight:w});
    h.sort((a,b)=>a.date.localeCompare(b.date));
    this._set('weight',h);
  },
  currentWeight() { const h=this.weight(); return h.length?h[h.length-1].weight:null; },

  tasks(d) { return this._get('t_'+d,null); },
  saveTasks(d, t) { this._set('t_'+d, t); },

  streak() { return this._get('streak',0); },
  lastStreakDate() { return this._get('lsd',''); },
  updateStreak(today) {
    const last = this.lastStreakDate();
    let s = this.streak();
    if (last===today) return s;
    const yst = new Date(Date.now()-86400000).toISOString().slice(0,10);
    s = last===yst ? s+1 : 1;
    this._set('streak',s);
    this._set('lsd',today);
    return s;
  },

  coreDays() { return this._get('cr',[]); },
  canCore() {
    const d = this.coreDays();
    const cut = new Date(Date.now()-6*86400000).toISOString().slice(0,10);
    return d.filter(x=>x>=cut).length < 2;
  },
  addCoreDay(date) {
    const d = this.coreDays(); d.push(date);
    const cut = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    this._set('cr',d.filter(x=>x>=cut));
  }
};

// ===================== TIMER ENGINE =====================

let tId = null;
let tEnd = 0;
let tTotal = 0;
let tSecs = 0;
let tStopped = false;

function timeStr(s) { return Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60); }

function runTimer(s, onEnd) {
  stopTimer();
  tId = setInterval(() => tick(), 1000);
  tEnd = Date.now() + s*1000;
  tTotal = s; tSecs = s; tStopped = false;
  // Store callback on body for skip to access
  document.getElementById('workout-body')._onEnd = onEnd;
}

function tick() {
  tSecs = Math.max(0, Math.ceil((tEnd - Date.now()) / 1000));
  if (tSecs <= 0) timerDone();
  else updateRestUI();
}

function stopTimer() {
  if (tId) { clearInterval(tId); tId = null; }
  document.getElementById('workout-body')._onEnd = null;
}

function skip() {
  const cb = document.getElementById('workout-body')._onEnd;
  stopTimer();
  beep();
  if (cb) cb();
}

function timerDone() {
  const cb = document.getElementById('workout-body')._onEnd;
  stopTimer();
  beep();
  if (cb) cb();
}

function beep() {
  try {
    const a = new (window.AudioContext||window.webkitAudioContext)();
    const o = a.createOscillator(); const g = a.createGain();
    o.connect(g); g.connect(a.destination);
    o.frequency.value = 880; o.type = 'sine';
    g.gain.setValueAtTime(.3, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime+.3);
    o.start(a.currentTime); o.stop(a.currentTime+.3);
  } catch(e) {}
  if (navigator.vibrate) navigator.vibrate(200);
}

// ===================== WORKOUT STATE =====================

let wo = null;
// wo = { type, exIdx, setIdx, totalSets, completedSets, done }

function wDef(t) { return WORKOUTS[t]; }
function curEx() { return wo ? wDef(wo.type).exercises[wo.exIdx] || null : null; }

function isLastSet() {
  const ex = curEx();
  return !ex || wo.setIdx >= ex.sets-1;
}
function isLastEx() {
  return !wo || wo.exIdx >= wDef(wo.type).exercises.length-1;
}
function isLast() { return isLastEx() && isLastSet(); }

function advance() {
  if (!wo) return;
  wo.completedSets++;
  const ex = curEx();
  if (!ex) { wo.done=true; return; }
  wo.setIdx++;
  if (wo.setIdx >= ex.sets) { wo.setIdx=0; wo.exIdx++; }
  if (wo.exIdx >= wDef(wo.type).exercises.length) wo.done=true;
}

function nextInfo() {
  if (!wo || wo.done) return null;
  const w = wDef(wo.type);
  let ei = wo.exIdx, si = wo.setIdx + 1;
  const ex = w.exercises[ei];
  if (!ex) return null;
  const isNewEx = si >= ex.sets;
  if (isNewEx) { ei++; si=0; }
  const ne = w.exercises[ei];
  if (!ne) return null;
  if (isNewEx) return 'Next: ' + ne.name;
  return 'Next: ' + ex.name + ' ' + (si+1) + '/' + ex.sets;
}

// ===================== WORKOUT UI =====================

function renderActive() {
  const body = document.getElementById('workout-body');
  const ex = curEx();
  if (!ex) return;

  if (ex.superset) {
    body.innerHTML = '<div class="wbody-state">' +
      '<div class="ex-name">'+ex.name+'</div>' +
      '<div class="ex-set">Superset '+(wo.setIdx+1)+'/'+ex.sets+'</div>' +
      ex.superset.map((s,i) =>
        '<div class="ss-row">' +
          '<div class="ss-label">'+
            '<div class="ss-ex-name">'+s.name+'</div>'+
            (Storage.getMax(s.id)>0?'<div class="ex-stats">Max '+Storage.getMax(s.id)+' &middot; Target '+Storage.target(s.id)+'</div>':'')+
          '</div>'+
          '<input type="number" min="0" inputmode="numeric" class="ss-inp" data-id="'+s.id+'" placeholder="0" autocomplete="off">'+
        '</div>'
      ).join('') +
      '<button class="mark-btn" id="sup-done">Mark Complete</button>' +
    '</div>';
    const inps = body.querySelectorAll('.ss-inp');
    inps.forEach((inp,i) => {
      inp.addEventListener('keydown', e => {
        if (e.key==='Enter') { e.preventDefault(); i<inps.length-1 ? inps[i+1].focus() : completeSuperset(); }
      });
    });
    body.querySelector('#sup-done').addEventListener('click', completeSuperset);
    setTimeout(() => inps[0].focus(), 150);
  } else {
    body.innerHTML = '<div class="wbody-state">' +
      '<div class="ex-name">'+ex.name+'</div>' +
      '<div class="ex-set">Set '+(wo.setIdx+1)+'/'+ex.sets+'</div>' +
      (Storage.getMax(ex.id)>0 ? '<div class="ex-stats">Max '+Storage.getMax(ex.id)+' &middot; Target '+Storage.target(ex.id)+'</div>' : '') +
      '<input type="number" min="0" inputmode="numeric" id="rep-inp" placeholder="0" autocomplete="off">' +
      '<button class="mark-btn" id="done-btn">Mark Complete</button>' +
    '</div>';
    const inp = body.querySelector('#rep-inp');
    inp.addEventListener('keydown', e => { if (e.key==='Enter') completeSet(); });
    body.querySelector('#done-btn').addEventListener('click', completeSet);
    setTimeout(() => inp.focus(), 150);
  }
  updateProgress();
}

function renderRest(remaining, total) {
  const body = document.getElementById('workout-body');
  const ringOff = (2*Math.PI*50) * (1 - remaining/total);
  body.innerHTML = '<div class="wbody-state'+(remaining<=5?' pulse':'')+'">' +
    '<div class="rest-ring-wrap">'+
      '<svg class="rest-ring-svg" viewBox="0 0 120 120">'+
        '<circle cx="60" cy="60" r="50" class="ring-bg"/>'+
        '<circle cx="60" cy="60" r="50" class="ring-p" stroke-dasharray="'+Math.round(2*Math.PI*50)+'" stroke-dashoffset="'+ringOff+'"/>'+
      '</svg>'+
      '<div class="rest-time">'+timeStr(remaining)+'</div>'+
    '</div>'+
    '<div class="rest-next">'+(nextInfo()||'')+'</div>'+
    '<button class="skip-btn" id="skip-btn">Skip</button>'+
  '</div>';
  body.querySelector('#skip-btn').addEventListener('click', skip);
}

function updateRestUI() {
  const ring = document.querySelector('.ring-p');
  if (!ring) return;
  const circ = 2*Math.PI*50;
  ring.style.strokeDashoffset = circ * (1 - tSecs/tTotal);
  document.querySelector('.rest-time').textContent = timeStr(tSecs);
  const state = document.querySelector('.wbody-state');
  state.classList.toggle('pulse', tSecs <= 5);
}

function completeSet() {
  const inp = document.getElementById('rep-inp');
  if (!inp) return;
  const reps = parseInt(inp.value);
  if (isNaN(reps) || reps < 0) { inp.focus(); return; }
  const ex = curEx();
  if (ex) Storage.updateMaxRep(ex.id, reps);
  finishSet();
}

function completeSuperset() {
  const inps = document.querySelectorAll('.ss-inp');
  const ex = curEx();
  if (!ex || !ex.superset) return;
  let ok = true;
  inps.forEach(inp => {
    const v = parseInt(inp.value);
    if (isNaN(v) || v < 0) ok = false;
    else Storage.updateMaxRep(inp.dataset.id, v);
  });
  if (!ok) return;
  finishSet();
}

function finishSet() {
  if (isLast()) { finishWorkout(); return; }
  const restSec = isLastSet() ? R.ex : R.set;
  advance();
  runTimer(restSec, () => renderActive());
  renderRest(restSec, restSec);
}

function finishWorkout() {
  if (!wo) return;
  wo.done = true;
  stopTimer();
  const w = wDef(wo.type);
  const body = document.getElementById('workout-body');
  body.innerHTML = '';
  updateProgress();
  document.getElementById('complete-sub').textContent = w.name + ' complete!';
  document.getElementById('complete-modal').style.display = 'flex';

  const today = new Date().toISOString().slice(0,10);
  const tasks = Storage.tasks(today) || {};
  if (wo.type==='upper') tasks.upperDone=true;
  else if (wo.type==='legs') tasks.legsDone=true;
  else if (wo.type==='core') tasks.coreDone=true;
  Storage.saveTasks(today, tasks);
}

function updateProgress() {
  if (!wo) return;
  const w = wDef(wo.type);
  const pct = w.totalSets ? (wo.completedSets/w.totalSets)*100 : 0;
  document.getElementById('wo-progress-fill').style.width = Math.min(pct,100)+'%';
  document.getElementById('wo-progress-text').textContent = wo.completedSets+' / '+w.totalSets+' sets';
}

// ===================== DASHBOARD =====================

function renderDashboard() {
  renderWeight();
  renderChart();
  renderTasks();
  renderStreak();
}

function renderWeight() {
  const w = Storage.currentWeight();
  document.getElementById('current-weight').textContent = w!==null ? w.toFixed(1) : '\u2014';
  const diff = document.getElementById('weight-diff');
  const fill = document.getElementById('weight-progress');
  if (w!==null) {
    fill.style.width = Math.max(0,Math.min(100,((w-70)/5)*100))+'%';
    const d = 75-w;
    diff.textContent = d>0 ? '+'+(d.toFixed(1))+' kg to go' : 'Target reached!';
  } else {
    fill.style.width='0%'; diff.textContent='Log your first weight';
  }
}

function renderChart() {
  const c = document.getElementById('weight-chart');
  const ctx = c.getContext('2d');
  const r = c.parentElement.getBoundingClientRect();
  c.width = r.width || 320; c.height = 155;
  const d = Storage.weight();
  const p = {t:14,b:22,l:6,r:6};
  const w = c.width-p.l-p.r, h = c.height-p.t-p.b;

  ctx.clearRect(0,0,c.width,c.height);
  if (d.length < 2) {
    ctx.fillStyle='#64748B'; ctx.font='13px Barlow'; ctx.textAlign='center';
    ctx.fillText(d.length===1?'Log more weights to see trend':'Start logging your weight',c.width/2,c.height/2+4);
    if (d.length===1) { ctx.fillStyle='#22C55E'; ctx.beginPath(); ctx.arc(c.width/2,p.t+h/2,4,0,Math.PI*2); ctx.fill(); }
    return;
  }
  const vs = d.map(x=>x.weight);
  const mn = Math.min(...vs)-.5, mx = Math.max(...vs)+.5, rg = mx-mn||1;
  const sx = w/(d.length-1);

  // Grid
  ctx.strokeStyle='#1E293B'; ctx.lineWidth=1;
  for (let i=0;i<4;i++) {
    const y = p.t+(h/3)*i;
    ctx.beginPath(); ctx.moveTo(p.l,y); ctx.lineTo(p.l+w,y); ctx.stroke();
    ctx.fillStyle='#64748B'; ctx.font='9px Barlow'; ctx.textAlign='right';
    ctx.fillText((mx-i*(rg/3)).toFixed(1),p.l-3,y+3);
  }
  // Line
  ctx.beginPath(); ctx.strokeStyle='#22C55E'; ctx.lineWidth=2.5; ctx.lineJoin='round';
  d.forEach((x,i) => { const px=p.l+i*sx, py=p.t+h-((x.weight-mn)/rg)*h; i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); });
  ctx.stroke();
  // Dots
  d.forEach((x,i) => {
    const px=p.l+i*sx, py=p.t+h-((x.weight-mn)/rg)*h;
    ctx.beginPath(); ctx.fillStyle=i===d.length-1?'#22C55E':'#0F172A'; ctx.arc(px,py,i===d.length-1?3.5:3,0,Math.PI*2); ctx.fill();
    if (i===d.length-1) { ctx.strokeStyle='#22C55E'; ctx.lineWidth=2; ctx.stroke(); }
  });
}

function renderStreak() { document.getElementById('streak-count').textContent = Storage.streak(); }

function renderTasks() {
  const today = new Date().toISOString().slice(0,10);
  const saved = Storage.tasks(today) || {};
  const dt = saved.dayType || 'upper';

  document.querySelectorAll('.do').forEach(el => el.classList.toggle('active', el.dataset.day===dt));

  const defs = [
    { id:'food', label:'5 Good Meals' },
    { id:'creatine', label:'Creatine 5g' },
    { id:'weightLogged', label:'Log Weight' }
  ];

  if (dt==='upper') {
    defs.push({ id:'football', label:'Football' });
    defs.push({ id:'upperDone', label:'Upper Body Workout' });
  } else if (dt==='legs') {
    defs.push({ id:'legsDone', label:'Legs Workout' });
  } else if (dt==='core') {
    defs.push({ id:'coreDone', label:'Core + Rest' });
  }

  let html=''; let done=0;
  defs.forEach(t => {
    const ch = saved[t.id]||false; if (ch) done++;
    html += '<label class="task-item '+(ch?'checked':'')+'" data-task="'+t.id+'">'+
      '<span class="tk"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#020617" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>'+
      '<span class="tlbl">'+t.label+'</span>'+
    '</label>';
  });

  if (dt==='core' && !Storage.canCore()) {
    html += '<div class="twarn">Max 2 Core+Rest days per week</div>';
  }

  const list = document.getElementById('task-list');
  list.innerHTML = html;
  document.getElementById('task-summary').textContent = done+'/'+defs.length;

  list.querySelectorAll('.task-item').forEach(el => {
    el.addEventListener('click', () => {
      const tid = el.dataset.task;
      const td = Storage.tasks(today) || { dayType: dt };
      if (dt==='core' && tid==='coreDone' && !td.coreDone && !Storage.canCore()) return;
      td[tid] = !td[tid];
      td.dayType = dt;
      Storage.saveTasks(today, td);
      el.classList.toggle('checked', td[tid]);
      const all = list.querySelectorAll('.task-item');
      let d=0; all.forEach(l => { if(l.classList.contains('checked')) d++; });
      document.getElementById('task-summary').textContent = d+'/'+all.length;
      checkAllDone(today);
    });
  });

  checkAllDone(today);
}

function checkAllDone(today) {
  const ts = Storage.tasks(today);
  if (!ts) return;
  if (!(ts.food && ts.creatine && ts.weightLogged)) return;
  let cd = true;
  if (ts.dayType==='upper') cd = ts.football && ts.upperDone;
  else if (ts.dayType==='legs') cd = ts.legsDone;
  else if (ts.dayType==='core') cd = ts.coreDone;
  if (cd) { Storage.updateStreak(today); renderStreak(); if (ts.dayType==='core') Storage.addCoreDay(today); }
}

function initDaySelector() {
  document.querySelectorAll('.do').forEach(b => {
    b.addEventListener('click', () => {
      const day = b.dataset.day;
      const today = new Date().toISOString().slice(0,10);
      if (day==='core' && !Storage.canCore()) return;
      const ts = Storage.tasks(today) || {};
      ts.dayType = day;
      delete ts.football; delete ts.upperDone; delete ts.legsDone; delete ts.coreDone;
      Storage.saveTasks(today, ts);
      renderTasks();
    });
  });
}

// ===================== NAVIGATION =====================

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el = document.getElementById('screen-'+id);
  if (el) el.classList.add('active');
  stopTimer();
}

function startWorkout(type) {
  const w = wDef(type);
  wo = { type, exIdx:0, setIdx:0, totalSets:w.totalSets, completedSets:0, done:false };
  document.getElementById('workout-title').textContent = w.name;
  showScreen('workout');
  renderActive();
}

// ===================== MODALS =====================

function initModals() {
  const wm = document.getElementById('weight-modal');
  const wi = document.getElementById('weight-input');
  const cw = Storage.currentWeight();

  document.getElementById('add-weight-btn').addEventListener('click', () => {
    wi.value = '';
    wi.placeholder = cw!==null ? cw.toFixed(1) : '70.0';
    wm.style.display = 'flex';
    setTimeout(() => wi.focus(), 150);
  });

  document.getElementById('weight-cancel').addEventListener('click', () => { wm.style.display='none'; });
  document.getElementById('weight-save').addEventListener('click', () => {
    const v = parseFloat(wi.value);
    if (isNaN(v)||v<30||v>200) { wi.focus(); return; }
    Storage.addWeight(v); wm.style.display='none';
    const today = new Date().toISOString().slice(0,10);
    const ts = Storage.tasks(today) || {};
    ts.weightLogged = true;
    Storage.saveTasks(today, ts);
    renderDashboard();
  });
  wi.addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('weight-save').click(); });
  wm.addEventListener('click', e => { if (e.target===wm) wm.style.display='none'; });

  document.getElementById('complete-done').addEventListener('click', () => {
    document.getElementById('complete-modal').style.display='none';
    wo = null; showScreen('dashboard'); renderDashboard();
  });
}

// ===================== INIT =====================

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.wb').forEach(b => {
    b.addEventListener('click', () => startWorkout(b.dataset.workout));
  });
  document.getElementById('workout-back').addEventListener('click', () => {
    stopTimer(); wo=null; showScreen('dashboard'); renderDashboard();
  });

  initDaySelector();
  initModals();

  // Collapse
  const ct = document.getElementById('tasks-toggle');
  const tc = document.getElementById('tasks-collapsible');
  const cv = document.getElementById('tasks-chevron');
  const ic = Storage._get('tc', false);
  if (ic) { tc.classList.add('cl'); cv.classList.add('c'); }
  ct.addEventListener('click', () => {
    const cl = tc.classList.toggle('cl');
    cv.classList.toggle('c', cl);
    Storage._set('tc', cl);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(r => r.forEach(x=>x.unregister()))
      .then(() => navigator.serviceWorker.register('sw.js'))
      .catch(() => navigator.serviceWorker.register('sw.js'));
  }

  renderDashboard();
  showScreen('dashboard');
});
