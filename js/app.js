/* ============================================
   BULKMETER - App Logic
   ============================================ */

// ===================== WORKOUT DEFINITIONS =====================

const R = { set: 120, ex: 180 }; // rest seconds: between sets, between exercises

const WORKOUTS = {
  upper: {
    name: 'Upper Body',
    icon: 'upper',
    totalSets: 18,
    exercises: [
      { id: 'pull-ups', name: 'Pull Ups', sets: 4, restSet: R.set, restEx: R.ex },
      { id: 'push-ups', name: 'Push Ups', sets: 4, restSet: R.set, restEx: R.ex },
      { id: 'trx-rows', name: 'TRX Rows', sets: 3, restSet: R.set, restEx: R.ex },
      { id: 'dips', name: 'Dips', sets: 3, restSet: R.set, restEx: R.ex },
      {
        id: 'shoulder-press-laterals',
        name: 'Shoulder Press + Lateral Raises',
        sets: 2, restSet: R.set, restEx: R.ex,
        superset: [
          { id: 'shoulder-press', name: 'Shoulder Press' },
          { id: 'lateral-raises', name: 'Lateral Raises' }
        ]
      },
      { id: 'bicep-curls', name: 'Bicep Curls', sets: 2, restSet: R.set, restEx: R.ex }
    ]
  },
  legs: {
    name: 'Legs',
    icon: 'legs',
    totalSets: 14,
    exercises: [
      { id: 'squats', name: 'Squats', sets: 2, restSet: R.set, restEx: R.ex },
      { id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', sets: 2, restSet: R.set, restEx: R.ex },
      { id: 'lunges', name: 'Lunges', sets: 2, restSet: R.set, restEx: R.ex },
      { id: 'sl-hip-thrust', name: 'SL Hip Thrust', sets: 2, restSet: R.set, restEx: R.ex },
      { id: 'calf-raises', name: 'Calf Raises', sets: 2, restSet: R.set, restEx: R.ex },
      { id: 'nordic-curls', name: 'Nordic Curls', sets: 2, restSet: R.set, restEx: R.ex },
      { id: 'isometric-side-glutes', name: 'Isometric Side Glutes Plank Hold', sets: 2, restSet: R.set, restEx: R.ex }
    ]
  },
  core: {
    name: 'Core',
    icon: 'core',
    totalSets: 5,
    exercises: [{
      id: 'plank-side-plank',
      name: 'Plank + Side Plank',
      sets: 5, restSet: 120, restEx: 120,
      superset: [
        { id: 'plank', name: 'Plank (seconds)' },
        { id: 'side-plank', name: 'Side Plank (seconds)' }
      ]
    }]
  }
};

// ===================== STORAGE =====================

const Storage = {
  _get(key, def) {
    try {
      const v = localStorage.getItem('bulkmeter_' + key);
      return v !== null ? JSON.parse(v) : def;
    } catch { return def; }
  },
  _set(key, val) {
    try { localStorage.setItem('bulkmeter_' + key, JSON.stringify(val)); } catch {}
  },

  getMaxReps() { return this._get('maxReps', {}); },
  updateMaxRep(id, reps) {
    const max = this.getMaxReps();
    if (!max[id] || reps > max[id]) { max[id] = reps; this._set('maxReps', max); }
    return max[id];
  },
  getMaxRep(id) { return this.getMaxReps()[id] || 0; },
  getTarget(id) { const m = this.getMaxRep(id); return m > 0 ? m + 1 : 0; },

  getWeightHistory() { return this._get('weightHistory', []); },
  addWeight(weight) {
    const h = this.getWeightHistory();
    const today = new Date().toISOString().slice(0, 10);
    const existing = h.findIndex(e => e.date === today);
    if (existing >= 0) h[existing].weight = weight;
    else h.push({ date: today, weight });
    h.sort((a, b) => a.date.localeCompare(b.date));
    this._set('weightHistory', h);
  },
  getCurrentWeight() {
    const h = this.getWeightHistory();
    return h.length > 0 ? h[h.length - 1].weight : null;
  },

  getTasks(date) { return this._get('tasks_' + date, null); },
  saveTasks(date, tasks) { this._set('tasks_' + date, tasks); },

  getStreak() { return this._get('streak', 0); },
  getLastStreakDate() { return this._get('lastStreakDate', ''); },
  updateStreak(today) {
    const last = this.getLastStreakDate();
    let s = this.getStreak();
    if (last === today) return s;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (last === yesterday) s++;
    else s = 1;
    this._set('streak', s);
    this._set('lastStreakDate', today);
    return s;
  },

  getCoreRestDays() { return this._get('coreRestDays', []); },
  canDoCoreRest() {
    const days = this.getCoreRestDays();
    const cutoff = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const recent = days.filter(d => d >= cutoff);
    return recent.length < 2;
  },
  addCoreRestDay(date) {
    const days = this.getCoreRestDays();
    days.push(date);
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    this._set('coreRestDays', days.filter(d => d >= cutoff));
  }
};

// ===================== TIMER =====================

let timerState = null; // { interval, remaining, total, onEnd, type }

function startTimer(seconds, onEnd) {
  stopTimer();
  const total = seconds;
  let remaining = seconds;
  showRestOverlay(remaining, total);

  timerState = {
    interval: setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        stopTimer();
        playBeep();
        onEnd && onEnd();
      } else {
        updateRestOverlay(remaining, total);
      }
    }, 1000),
    remaining, total, onEnd, type
  };
}

function stopTimer() {
  if (timerState) {
    clearInterval(timerState.interval);
    timerState = null;
  }
  hideRestOverlay();
}

function skipTimer() {
  const end = timerState && timerState.onEnd;
  stopTimer();
  playBeep();
  end && end();
}

function getTimerRemaining() { return timerState ? timerState.remaining : 0; }

// ===================== REST OVERLAY UI =====================

function showRestOverlay(remaining, total) {
  const overlay = document.getElementById('rest-overlay');
  const ring = document.getElementById('timer-ring');
  const timeEl = document.getElementById('rest-time');
  const nextEl = document.getElementById('rest-next');

  overlay.style.display = 'flex';
  const circ = 2 * Math.PI * 52;
  ring.style.strokeDasharray = circ;
  ring.style.strokeDashoffset = circ;
  timeEl.textContent = formatTime(remaining);

  const info = getNextInfo();
  nextEl.textContent = info ? info.label : '';

  requestAnimationFrame(() => {
    const offset = circ * (1 - remaining / total);
    ring.style.strokeDashoffset = circ - offset;
  });
}

function updateRestOverlay(remaining, total) {
  const ring = document.getElementById('timer-ring');
  const timeEl = document.getElementById('rest-time');
  const circ = 2 * Math.PI * 52;

  timeEl.textContent = formatTime(remaining);
  const offset = circ * (1 - remaining / total);
  ring.style.strokeDashoffset = circ - offset;

  if (remaining <= 5) {
    document.querySelector('.rest-card').classList.add('timer-end-pulse');
  } else {
    document.querySelector('.rest-card').classList.remove('timer-end-pulse');
  }
}

function hideRestOverlay() {
  document.getElementById('rest-overlay').style.display = 'none';
  document.querySelector('.rest-card').classList.remove('timer-end-pulse');
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
  if (navigator.vibrate) navigator.vibrate(200);
}

// ===================== WORKOUT STATE =====================

let woState = null;
/*
woState = {
  type: 'upper'|'legs'|'core',
  exIdx: number,
  setIdx: number,
  totalSets: number,
  completedSets: number,
  done: boolean
}
*/

function getWorkoutDef(type) { return WORKOUTS[type]; }

function getCurrentExercise() {
  if (!woState) return null;
  const w = getWorkoutDef(woState.type);
  return w.exercises[woState.exIdx] || null;
}

function getNextInfo() {
  if (!woState || woState.done) return null;
  const w = getWorkoutDef(woState.type);
  let exIdx = woState.exIdx;
  let setIdx = woState.setIdx + 1;
  const ex = w.exercises[exIdx];
  if (!ex) return null;

  const isNewEx = setIdx >= ex.sets;
  if (isNewEx) {
    exIdx++;
    setIdx = 0;
  }

  const nextEx = w.exercises[exIdx];
  if (!nextEx) return null;

  if (isNewEx) {
    return { name: nextEx.name, label: 'Next: ' + nextEx.name };
  }

  return {
    name: ex.name,
    label: 'Next: ' + ex.name + ' Set ' + (setIdx + 1) + '/' + ex.sets
  };
}

function isLastSetOfExercise() {
  if (!woState) return true;
  const ex = getCurrentExercise();
  if (!ex) return true;
  return woState.setIdx >= ex.sets - 1;
}

function isLastExercise() {
  if (!woState) return true;
  const w = getWorkoutDef(woState.type);
  return woState.exIdx >= w.exercises.length - 1;
}

function isLastSetOfWorkout() {
  if (!woState) return true;
  return isLastExercise() && isLastSetOfExercise();
}

function advanceWorkout() {
  if (!woState) return;
  woState.completedSets++;
  const w = getWorkoutDef(woState.type);
  const ex = getCurrentExercise();
  if (!ex) { woState.done = true; return; }

  woState.setIdx++;
  if (woState.setIdx >= ex.sets) {
    woState.setIdx = 0;
    woState.exIdx++;
  }
  if (woState.exIdx >= w.exercises.length) {
    woState.done = true;
  }
}

// ===================== WORKOUT UI =====================

function renderExercise() {
  const area = document.getElementById('exercise-area');
  const ex = getCurrentExercise();
  if (!ex || woState.done) return;

  if (ex.superset) {
    area.innerHTML = `
      <div class="ex-card">
        <div class="ex-header">${ex.name}</div>
        <div class="ex-meta">Superset ${woState.setIdx + 1}/${ex.sets}</div>
        ${ex.superset.map((s, i) => {
          const max = Storage.getMaxRep(s.id);
          const target = Storage.getTarget(s.id);
          return `
            <div class="ss-row">
              <div class="ss-label">
                <div class="ex-label">${s.name}</div>
                ${max > 0 ? `<div class="ex-stats">Max ${max} &middot; Target ${target}</div>` : ''}
              </div>
              <input type="number" min="0" inputmode="numeric" class="superset-rep-input" data-id="${s.id}" placeholder="0" autocomplete="off">
            </div>
          `;
        }).join('')}
        <button class="mark-btn" id="superset-mark-btn">Mark Complete</button>
      </div>
    `;
    const inputs = area.querySelectorAll('.superset-rep-input');
    inputs.forEach((inp, i) => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (i < inputs.length - 1) {
            inputs[i + 1].focus();
          } else {
            onSupersetComplete();
          }
        }
      });
    });
    document.getElementById('superset-mark-btn').addEventListener('click', onSupersetComplete);
    setTimeout(() => inputs[0].focus(), 100);
  } else {
    const max = Storage.getMaxRep(ex.id);
    const target = Storage.getTarget(ex.id);
    area.innerHTML = `
      <div class="ex-card">
        <div class="ex-header">${ex.name}</div>
        <div class="ex-meta">Set ${woState.setIdx + 1}/${ex.sets}</div>
        ${max > 0 ? `<div class="ex-stats">Max ${max} &middot; Target ${target}</div>` : ''}
        <input type="number" min="0" inputmode="numeric" id="single-rep-input" placeholder="0" autocomplete="off">
        <button class="mark-btn" id="mark-btn">Mark Complete</button>
      </div>
    `;
    const inp = document.getElementById('single-rep-input');
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') onSetComplete();
    });
    document.getElementById('mark-btn').addEventListener('click', onSetComplete);
    setTimeout(() => inp.focus(), 100);
  }
  updateProgress();
}

function onSetComplete() {
  const inp = document.getElementById('single-rep-input');
  if (!inp) return;
  const reps = parseInt(inp.value);
  if (isNaN(reps) || reps < 0) { inp.focus(); return; }

  const ex = getCurrentExercise();
  if (ex) Storage.updateMaxRep(ex.id, reps);

  if (isLastSetOfWorkout()) { finishWorkout(); return; }

  const restSec = isLastSetOfExercise() ? (ex ? ex.restEx : 180) : (ex ? ex.restSet : 120);
  advanceWorkout();
  startTimer(restSec, () => renderExercise());
}

function onSupersetComplete() {
  const inputs = document.querySelectorAll('.superset-rep-input');
  const ex = getCurrentExercise();
  if (!ex || !ex.superset) return;

  let allValid = true;
  inputs.forEach(inp => {
    const id = inp.dataset.id;
    const val = parseInt(inp.value);
    if (isNaN(val) || val < 0) allValid = false;
    else Storage.updateMaxRep(id, val);
  });
  if (!allValid) return;

  if (isLastSetOfWorkout()) { finishWorkout(); return; }

  const restSec = isLastSetOfExercise() ? ex.restEx : ex.restSet;
  advanceWorkout();
  startTimer(restSec, () => renderExercise());
}

function updateProgress() {
  if (!woState) return;
  const fill = document.getElementById('wo-progress-fill');
  const text = document.getElementById('wo-progress-text');
  const w = getWorkoutDef(woState.type);
  const pct = w.totalSets > 0 ? (woState.completedSets / w.totalSets) * 100 : 0;
  fill.style.width = Math.min(pct, 100) + '%';
  text.textContent = `${woState.completedSets} / ${w.totalSets} sets`;
}

function finishWorkout() {
  if (!woState) return;
  woState.done = true;
  stopTimer();
  document.getElementById('exercise-area').innerHTML = '';
  updateProgress();

  const w = getWorkoutDef(woState.type);
  document.getElementById('complete-sub').textContent = w.name + ' complete!';
  document.getElementById('complete-modal').style.display = 'flex';

  // Mark workout task as done
  const today = new Date().toISOString().slice(0, 10);
  const tasks = Storage.getTasks(today) || {};
  if (woState.type === 'upper') tasks.upperDone = true;
  else if (woState.type === 'legs') tasks.legsDone = true;
  else if (woState.type === 'core') tasks.coreDone = true;
  Storage.saveTasks(today, tasks);
}

// ===================== DASHBOARD =====================

function renderDashboard() {
  renderWeightCard();
  renderChart();
  renderTasks();
  renderStreak();
}

function renderWeightCard() {
  const w = Storage.getCurrentWeight();
  const el = document.getElementById('current-weight');
  const diff = document.getElementById('weight-diff');
  const progress = document.getElementById('weight-progress');

  if (w !== null) {
    el.textContent = w.toFixed(1);
    const pct = Math.max(0, Math.min(100, ((w - 70) / (75 - 70)) * 100));
    progress.style.width = pct + '%';
    const left = 75 - w;
    diff.textContent = left > 0 ? `+${left.toFixed(1)} kg to go` : 'Target reached!';
  } else {
    el.textContent = '—';
    progress.style.width = '0%';
    diff.textContent = 'Log your first weight';
  }
}

function renderChart() {
  const canvas = document.getElementById('weight-chart');
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width || 320;
  canvas.height = 160;

  const data = Storage.getWeightHistory();
  const pad = { top: 16, bottom: 24, left: 8, right: 8 };
  const w = canvas.width - pad.left - pad.right;
  const h = canvas.height - pad.top - pad.bottom;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (data.length < 2) {
    ctx.fillStyle = '#64748B';
    ctx.font = '14px Barlow';
    ctx.textAlign = 'center';
    ctx.fillText(data.length === 1 ? 'Log more weights to see trend' : 'Start logging your weight', canvas.width / 2, canvas.height / 2 + 5);
    if (data.length === 1) {
      ctx.fillStyle = '#22C55E';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, pad.top + h / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  const values = data.map(d => d.weight);
  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;
  const range = max - min || 1;

  // Draw grid lines
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = pad.top + (h / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + w, y);
    ctx.stroke();
    const val = (max - (i / 3) * range).toFixed(1);
    ctx.fillStyle = '#64748B';
    ctx.font = '10px Barlow';
    ctx.textAlign = 'right';
    ctx.fillText(val, pad.left - 4, y + 3);
  }

  // Draw line
  const stepX = w / (data.length - 1);
  ctx.beginPath();
  ctx.strokeStyle = '#22C55E';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  data.forEach((d, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + h - ((d.weight - min) / range) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Draw dots
  data.forEach((d, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + h - ((d.weight - min) / range) * h;
    ctx.beginPath();
    ctx.fillStyle = i === data.length - 1 ? '#22C55E' : '#0F172A';
    ctx.arc(x, y, i === data.length - 1 ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (i === data.length - 1) {
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

function renderStreak() {
  document.getElementById('streak-count').textContent = Storage.getStreak();
}

function renderTasks() {
  const today = new Date().toISOString().slice(0, 10);

  const saved = Storage.getTasks(today) || {};
  const dayType = saved.dayType || 'upper';

  // Set active day
  document.querySelectorAll('.day-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.day === dayType);
  });

  // Build task list
  const list = document.getElementById('task-list');

  const taskDefs = [
    { id: 'food', label: '5 Good Meals', always: true },
    { id: 'creatine', label: 'Creatine 5g', always: true },
    { id: 'weightLogged', label: 'Log Weight', always: true }
  ];

  if (dayType === 'upper') {
    taskDefs.push({ id: 'football', label: 'Football', always: false });
    taskDefs.push({ id: 'upperDone', label: 'Upper Body Workout', always: false });
  } else if (dayType === 'legs') {
    taskDefs.push({ id: 'legsDone', label: 'Legs Workout', always: false });
  } else if (dayType === 'core') {
    taskDefs.push({ id: 'coreDone', label: 'Core Workout & Rest', always: false });
  }

  let html = '';
  let doneCount = 0;
  taskDefs.forEach(t => {
    const checked = saved[t.id] || false;
    if (checked) doneCount++;
    html += `
      <label class="task-item ${checked ? 'checked' : ''}" data-task="${t.id}">
        <span class="task-check">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#020617" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span class="task-label">${t.label}</span>
      </label>
    `;
  });

  // Core+Rest limit warning
  if (dayType === 'core' && !Storage.canDoCoreRest()) {
    html += `<div class="task-limit-warn">Max 2 Core+Rest days per week reached</div>`;
  }

  list.innerHTML = html;

  // Update summary
  document.getElementById('task-summary').textContent = `${doneCount}/${taskDefs.length}`;

  // Event listeners
  list.querySelectorAll('.task-item').forEach(el => {
    el.addEventListener('click', () => {
      const taskId = el.dataset.task;
      const tasksData = Storage.getTasks(today) || { dayType };

      // Core+Rest limit check
      if (dayType === 'core' && (taskId === 'coreDone' || taskId === 'dayType') && !tasksData.coreDone && !Storage.canDoCoreRest()) {
        return;
      }

      tasksData[taskId] = !tasksData[taskId];
      tasksData.dayType = dayType;
      Storage.saveTasks(today, tasksData);
      el.classList.toggle('checked', tasksData[taskId]);

      // Update summary
      const allLabels = list.querySelectorAll('.task-item');
      let d = 0;
      allLabels.forEach(l => { if (l.classList.contains('checked')) d++; });
      document.getElementById('task-summary').textContent = `${d}/${allLabels.length}`;

      checkAllTasksComplete(today);
    });
  });

  checkAllTasksComplete(today);
}

function checkAllTasksComplete(today) {
  const tasks = Storage.getTasks(today);
  if (!tasks) return;

  const essentials = ['food', 'creatine', 'weightLogged'];
  const allEssential = essentials.every(t => tasks[t]);
  if (!allEssential) return;

  let conditionalDone = true;
  if (tasks.dayType === 'upper') conditionalDone = tasks.football && tasks.upperDone;
  else if (tasks.dayType === 'legs') conditionalDone = tasks.legsDone;
  else if (tasks.dayType === 'core') conditionalDone = tasks.coreDone;

  if (conditionalDone) {
    Storage.updateStreak(today);
    renderStreak();

    // Track core+rest day
    if (tasks.dayType === 'core') {
      Storage.addCoreRestDay(today);
    }
  }
}

// ===================== DAY SELECTOR =====================

function initDaySelector() {
  document.querySelectorAll('.day-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.dataset.day;
      const today = new Date().toISOString().slice(0, 10);

      // Core+Rest limit check
      if (day === 'core' && !Storage.canDoCoreRest()) {
        return;
      }

      const tasks = Storage.getTasks(today) || {};
      tasks.dayType = day;
      // Reset workout-specific tasks when switching
      delete tasks.football;
      delete tasks.upperDone;
      delete tasks.legsDone;
      delete tasks.coreDone;
      Storage.saveTasks(today, tasks);

      renderTasks();
    });
  });
}

// ===================== NAVIGATION =====================

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
  stopTimer();
}

function startWorkout(type) {
  const w = getWorkoutDef(type);
  woState = {
    type,
    exIdx: 0,
    setIdx: 0,
    totalSets: w.totalSets,
    completedSets: 0,
    done: false
  };

  document.getElementById('workout-title').textContent = w.name;
  showScreen('workout');
  renderExercise();
}

// ===================== WEIGHT MODAL =====================

function initWeightModal() {
  const modal = document.getElementById('weight-modal');
  const input = document.getElementById('weight-input');
  const current = Storage.getCurrentWeight();
  if (current !== null) input.placeholder = String(current.toFixed(1));
  else input.placeholder = '70.0';

  document.getElementById('add-weight-btn').addEventListener('click', () => {
    input.value = '';
    input.placeholder = current !== null ? current.toFixed(1) : '70.0';
    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 150);
  });

  document.getElementById('weight-cancel').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  document.getElementById('weight-save').addEventListener('click', () => {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 30 || val > 200) { input.focus(); return; }
    Storage.addWeight(val);
    modal.style.display = 'none';
    renderDashboard();

    // Also mark weightLogged task
    const today = new Date().toISOString().slice(0, 10);
    const tasks = Storage.getTasks(today) || {};
    tasks.weightLogged = true;
    Storage.saveTasks(today, tasks);
    renderTasks();
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('weight-save').click();
  });

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
  });
}

// ===================== INIT =====================

document.addEventListener('DOMContentLoaded', () => {
  // Workout buttons
  document.querySelectorAll('.workout-btn').forEach(btn => {
    btn.addEventListener('click', () => startWorkout(btn.dataset.workout));
  });

  // Back button
  document.getElementById('workout-back').addEventListener('click', () => {
    stopTimer();
    woState = null;
    showScreen('dashboard');
    renderDashboard();
  });

  // Skip rest
  document.getElementById('skip-rest').addEventListener('click', skipTimer);

  // Complete modal done
  document.getElementById('complete-done').addEventListener('click', () => {
    document.getElementById('complete-modal').style.display = 'none';
    woState = null;
    showScreen('dashboard');
    renderDashboard();
  });

  // Day selector
  initDaySelector();

  // Weight modal
  initWeightModal();

  // Tasks collapse toggle
  const tasksToggle = document.getElementById('tasks-toggle');
  const collapsible = document.getElementById('tasks-collapsible');
  const chevron = document.getElementById('tasks-chevron');
  const isCollapsed = Storage._get('tasksCollapsed', false);
  if (isCollapsed) {
    collapsible.classList.add('closed');
    chevron.classList.add('collapsed');
  }
  tasksToggle.addEventListener('click', () => {
    const closed = collapsible.classList.toggle('closed');
    chevron.classList.toggle('collapsed', closed);
    Storage._set('tasksCollapsed', closed);
  });

  // Service worker registration
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Initial render
  renderDashboard();
  showScreen('dashboard');
});
