import { GameEngine } from './GameEngine';
import { CONFIG } from './data/GameData';

// ============================================
// MAIN - Entry point & Run Controls
// ============================================

// Start the game
const game = new GameEngine();

// Expose game instance to window for UI interaction
(window as any).game = game;

let isPaused = false;
let speedMultiplier = 1;
let tickHandle: number | null = null;
let stepStatusTimeout: number | null = null;

const runStatusEl = document.getElementById('run-status');
const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement | null;
const resumeBtn = document.getElementById('resume-btn') as HTMLButtonElement | null;
const stepBtn = document.getElementById('step-btn') as HTMLButtonElement | null;
const speedSelect = document.getElementById('speed-select') as HTMLSelectElement | null;
const viewSelect = document.getElementById('view-select') as HTMLSelectElement | null;

const formatSpeed = () => (Number.isInteger(speedMultiplier) ? speedMultiplier.toFixed(0) : speedMultiplier.toFixed(1));

const updateRunStatus = (mode?: 'step') => {
    if (!runStatusEl) {
        return;
    }

    const formattedSpeed = formatSpeed();

    if (mode === 'step') {
        runStatusEl.textContent = `Step ×${formattedSpeed}`;
        if (stepStatusTimeout !== null) {
            window.clearTimeout(stepStatusTimeout);
        }
        stepStatusTimeout = window.setTimeout(() => {
            stepStatusTimeout = null;
            updateRunStatus();
        }, 800);
        return;
    }

    if (stepStatusTimeout !== null) {
        window.clearTimeout(stepStatusTimeout);
        stepStatusTimeout = null;
    }

    runStatusEl.textContent = `${isPaused ? 'Paused' : 'Running'} ×${formattedSpeed}`;
};

const updateControlStates = () => {
    if (pauseBtn) {
        pauseBtn.disabled = isPaused;
    }
    if (resumeBtn) {
        resumeBtn.disabled = !isPaused;
    }
};

const stopLoop = () => {
    if (tickHandle !== null) {
        window.clearInterval(tickHandle);
        tickHandle = null;
    }
};

const startLoop = () => {
    stopLoop();
    game.syncTime();
    tickHandle = window.setInterval(() => {
        game.tick();
    }, CONFIG.TICK_RATE);
};

const pauseGame = () => {
    if (isPaused) {
        return;
    }
    isPaused = true;
    stopLoop();
    updateControlStates();
    updateRunStatus();
};

const resumeGame = () => {
    if (!isPaused) {
        return;
    }
    isPaused = false;
    startLoop();
    updateControlStates();
    updateRunStatus();
};

// Initialise run state
game.setTimeScale(speedMultiplier);
startLoop();
updateControlStates();
updateRunStatus();

pauseBtn?.addEventListener('click', () => {
    pauseGame();
});

resumeBtn?.addEventListener('click', () => {
    resumeGame();
});

stepBtn?.addEventListener('click', () => {
    if (!isPaused) {
        pauseGame();
    } else {
        stopLoop();
    }
    game.stepSimulation(CONFIG.TICK_RATE);
    updateRunStatus('step');
});

speedSelect?.addEventListener('change', (event) => {
    const value = parseFloat((event.target as HTMLSelectElement).value);
    if (!Number.isNaN(value)) {
        speedMultiplier = value;
        game.setTimeScale(speedMultiplier);
        updateRunStatus();
    }
});

viewSelect?.addEventListener('change', (event) => {
    const mode = (event.target as HTMLSelectElement).value as 'mixed' | 'timeline' | 'arena';
    game.setViewMode(mode);
});

// Log that game started
console.log('Game started! Tick rate:', CONFIG.TICK_RATE + 'ms');
