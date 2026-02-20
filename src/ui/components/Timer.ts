import { getTimerDefault } from '../../data/queries';

let timerInterval: number | null = null;
let timerSeconds = 90;
let timerRemaining = 90;
let timerState: 'idle' | 'running' | 'finished' = 'idle';

export function renderTimer(): string {
  return `
    <div class="card mb-2" id="timer-card" style="background: var(--bg-tertiary);">
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

export function attachTimerHandlers() {
  const buttons = document.querySelectorAll('[data-timer-action]');
  buttons.forEach(btn => {
    const action = (btn as HTMLElement).dataset.timerAction;
    btn.addEventListener('click', () => {
      if (action === 'start') {
        handleTimerStart();
      } else if (action === 'plus') {
        handleTimerAdjust(30);
      } else if (action === 'minus') {
        handleTimerAdjust(-30);
      }
    });
  });
}

export async function initTimer() {
  const defaultSeconds = await getTimerDefault();
  timerSeconds = defaultSeconds;
  timerRemaining = defaultSeconds;
  timerState = 'idle';
}

function handleTimerStart() {
  if (timerState === 'running') {
    // Pause/stop
    if (timerInterval !== null) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerState = 'idle';
    updateTimerButton('Start');
  } else {
    // Start
    timerState = 'running';
    updateTimerButton('Stop');

    timerInterval = window.setInterval(() => {
      timerRemaining--;

      if (timerRemaining <= 0) {
        timerRemaining = 0;
        handleTimerComplete();
      }

      updateTimerDisplay();
    }, 1000);
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
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  timerState = 'idle';
  timerRemaining = timerSeconds;
  updateTimerButton('Start');

  // Alert: sound + vibration + visual
  playTimerAlert();
  vibrateDevice();
  flashTimerCard();
}

function updateTimerDisplay() {
  const display = document.getElementById('timer-display');
  if (display) {
    display.textContent = formatTime(timerRemaining);

    // Color change when finished
    if (timerRemaining === 0) {
      display.style.color = 'var(--success)';
    } else {
      display.style.color = '';
    }
  }
}

function updateTimerButton(text: string) {
  const btn = document.querySelector('[data-timer-action="start"]');
  if (btn) {
    btn.textContent = text;
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
  } catch (e) {
    console.log('Audio not available');
  }
}

function vibrateDevice() {
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
}

function flashTimerCard() {
  const card = document.getElementById('timer-card');
  if (!card) return;

  const originalBg = card.style.background;
  card.style.background = 'var(--success)';
  card.style.transition = 'background 0.3s';

  setTimeout(() => {
    card.style.background = originalBg;
  }, 1000);
}

// Initialize timer when module loads (removed - will be called from WorkoutScreen)
