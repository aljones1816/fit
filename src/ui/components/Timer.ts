import { getTimerDefault } from '../../data/queries';

let timerInterval: number | null = null;
let timerSeconds = 90;
let timerRemaining = 90;
let timerState: 'idle' | 'running' | 'finished' = 'idle';
let _timerSectionVisible = true; // tracks whether in-page timer card is visible

// ── Public API ────────────────────────────────────────────────────────────────

export function renderTimer(): string {
  return `
    <div class="card" id="timer-card" style="background: var(--bg-tertiary);margin-bottom:0;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
        <div style="flex: 1;">
          <div id="timer-display" style="font-size: 2rem; font-weight: 600; text-align: center;">
            ${formatTime(timerRemaining)}
          </div>
          <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 0.5rem;">
            <button class="btn btn-secondary btn-small" data-timer-action="minus">-30s</button>
            <button class="btn btn-primary btn-small" data-timer-action="start">Start</button>
            <button class="btn btn-secondary btn-small" data-timer-action="plus">+30s</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderTimerFab(): string {
  const r = 24;
  const circ = 2 * Math.PI * r;
  return `
    <button id="timer-fab" class="timer-fab timer-fab--hidden" aria-label="Rest timer">
      <svg class="timer-fab-svg" viewBox="0 0 56 56" width="56" height="56">
        <circle cx="28" cy="28" r="${r}" class="timer-fab-track"/>
        <circle cx="28" cy="28" r="${r}" class="timer-fab-ring"
          style="stroke-dasharray:${circ.toFixed(3)};stroke-dashoffset:0;"/>
      </svg>
      <span class="timer-fab-icon">⏱</span>
      <span class="timer-fab-time"></span>
    </button>
  `;
}

export function attachTimerHandlers() {
  document.querySelectorAll('[data-timer-action]').forEach(btn => {
    const action = (btn as HTMLElement).dataset.timerAction;
    btn.addEventListener('click', () => {
      if (action === 'start') handleTimerStart();
      else if (action === 'plus') handleTimerAdjust(30);
      else if (action === 'minus') handleTimerAdjust(-30);
    });
  });
}

export async function initTimer() {
  // Clear any running interval so re-entering the workout screen can't stack timers
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const defaultSeconds = await getTimerDefault();
  timerSeconds = defaultSeconds;
  timerRemaining = defaultSeconds;
  timerState = 'idle';
  _timerSectionVisible = true;
}

// Resets to the default duration and starts the timer (even if already running).
// Called by WorkoutScreen's confirm-set handler.
export function startRestTimer(): void {
  startTimer(true);
}

// Called by WorkoutScreen's IntersectionObserver whenever the in-page timer card
// enters or leaves the viewport. FAB is only shown when running + scrolled away.
export function setFabSectionVisible(visible: boolean): void {
  _timerSectionVisible = visible;
  updateFab();
}

// ── Timer sheet (popup) ───────────────────────────────────────────────────────

let _timerSheet: HTMLElement | null = null;

export function showTimerSheet(): void {
  if (_timerSheet) return;

  const overlay = document.createElement('div');
  overlay.className = 'timer-sheet-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'timer-sheet';

  const r = 88;
  const circ = 2 * Math.PI * r;
  const progress = timerSeconds > 0 ? timerRemaining / timerSeconds : 1;
  const offset = circ * (1 - progress);
  const ringStroke = timerState === 'running' && timerRemaining < 10 ? 'var(--danger)' : 'var(--accent)';

  sheet.innerHTML = `
    <div class="pc-handle"></div>
    <p class="timer-sheet-title">Rest Timer</p>
    <div class="timer-sheet-ring-wrap">
      <svg class="timer-sheet-ring-svg" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="${r}" class="timer-sheet-ring-track"/>
        <circle cx="100" cy="100" r="${r}" id="timer-sheet-ring-arc" class="timer-sheet-ring-arc"
          style="stroke-dasharray:${circ.toFixed(3)};stroke-dashoffset:${offset.toFixed(3)};stroke:${ringStroke};"/>
      </svg>
      <div class="timer-sheet-ring-center">
        <div id="timer-sheet-display" class="timer-sheet-display">${formatTime(timerRemaining)}</div>
        <div class="timer-sheet-status">${timerState === 'running' ? 'Resting…' : 'Ready'}</div>
      </div>
    </div>
    <div class="timer-sheet-controls">
      <button class="btn btn-secondary" data-sheet-action="minus">-30s</button>
      <button class="btn btn-primary" data-sheet-action="start">${timerState === 'running' ? 'Stop' : 'Start'}</button>
      <button class="btn btn-secondary" data-sheet-action="plus">+30s</button>
    </div>
  `;

  overlay.appendChild(sheet);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeTimerSheet();
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('timer-sheet--visible'));
  _timerSheet = overlay;

  sheet.querySelectorAll('[data-sheet-action]').forEach(btn => {
    const action = (btn as HTMLElement).dataset.sheetAction;
    btn.addEventListener('click', () => {
      if (action === 'start') handleTimerStart();
      else if (action === 'plus') handleTimerAdjust(30);
      else if (action === 'minus') handleTimerAdjust(-30);
    });
  });
}

export function closeTimerSheet(): void {
  if (!_timerSheet) return;
  _timerSheet.classList.remove('timer-sheet--visible');
  const el = _timerSheet;
  _timerSheet = null;
  setTimeout(() => el.remove(), 280);
}

// ── Internal logic ────────────────────────────────────────────────────────────

function startTimer(reset: boolean = false): void {
  if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }
  if (reset) timerRemaining = timerSeconds;
  timerState = 'running';
  updateTimerButton('Stop');
  timerInterval = window.setInterval(() => {
    timerRemaining--;
    if (timerRemaining <= 0) { timerRemaining = 0; handleTimerComplete(); }
    updateTimerDisplay();
  }, 1000);
  updateTimerDisplay();
}

function handleTimerStart() {
  if (timerState === 'running') {
    if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }
    timerState = 'idle';
    updateTimerButton('Start');
  } else {
    startTimer();
  }
}

function handleTimerAdjust(delta: number) {
  timerSeconds = Math.max(10, timerSeconds + delta);
  if (timerState === 'idle' || timerState === 'finished') {
    timerRemaining = timerSeconds;
  } else {
    timerRemaining = Math.max(0, timerRemaining + delta);
  }
  updateTimerDisplay();
}

function handleTimerComplete() {
  if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }
  timerState = 'idle';
  timerRemaining = timerSeconds;
  updateTimerButton('Start');
  playTimerAlert();
  vibrateDevice();
  flashTimerComplete();
}

function updateTimerDisplay() {
  const displays = document.querySelectorAll('#timer-display, #timer-sheet-display');
  displays.forEach(display => {
    display.textContent = formatTime(timerRemaining);
    (display as HTMLElement).style.color = timerRemaining === 0 ? 'var(--success)' : '';
  });

  // Update sheet ring arc
  const arc = document.getElementById('timer-sheet-ring-arc') as SVGCircleElement | null;
  if (arc) {
    const r = 88;
    const circ = 2 * Math.PI * r;
    const progress = timerSeconds > 0 ? timerRemaining / timerSeconds : 1;
    arc.style.strokeDashoffset = String(circ * (1 - progress));
    arc.style.stroke = timerState === 'running' && timerRemaining < 10 ? 'var(--danger)' : 'var(--accent)';
  }

  // Update sheet status label
  const status = document.querySelector<HTMLElement>('.timer-sheet-status');
  if (status) status.textContent = timerState === 'running' ? 'Resting…' : 'Ready';

  updateFab();
}

function updateTimerButton(text: string) {
  const buttons = document.querySelectorAll('[data-timer-action="start"], [data-sheet-action="start"]');
  buttons.forEach(btn => {
    btn.textContent = text;
  });
}

function updateFab() {
  const fab = document.getElementById('timer-fab');
  if (!fab) return;

  // Only show when timer is running AND the in-page card has scrolled out of view
  fab.classList.toggle('timer-fab--hidden', _timerSectionVisible || timerState !== 'running');
  fab.classList.toggle('timer-fab--active', timerState === 'running');

  // Time label — only visible while running
  const timeEl = fab.querySelector<HTMLElement>('.timer-fab-time');
  if (timeEl) {
    if (timerState === 'running') {
      timeEl.textContent = formatTime(timerRemaining);
      timeEl.style.display = '';
    } else {
      timeEl.textContent = '';
      timeEl.style.display = 'none';
    }
  }

  // Progress ring
  const ring = fab.querySelector<SVGCircleElement>('.timer-fab-ring');
  if (ring) {
    const r = 24;
    const circ = 2 * Math.PI * r;
    const progress = timerSeconds > 0 ? timerRemaining / timerSeconds : 1;
    ring.style.strokeDashoffset = String(circ * (1 - progress));
    ring.style.stroke =
      timerState === 'running'
        ? timerRemaining < 10
          ? 'var(--danger)'
          : 'var(--accent)'
        : 'var(--border-color)';
  }
}

function flashTimerComplete() {
  // Flash the in-page card
  const card = document.getElementById('timer-card');
  if (card) {
    card.style.background = 'var(--success)';
    card.style.transition = 'background 0.3s';
    setTimeout(() => { card.style.background = ''; }, 1000);
  }

  // Pulse the FAB
  const fab = document.getElementById('timer-fab');
  if (fab) {
    fab.classList.add('timer-fab--flash');
    setTimeout(() => fab.classList.remove('timer-fab--flash'), 1400);
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function playTimerAlert() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch {
    // Audio not available
  }
}

function vibrateDevice() {
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
}
