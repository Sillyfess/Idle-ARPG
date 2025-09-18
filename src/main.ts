import { GameEngine } from './GameEngine';
import { CONFIG } from './data/GameData';

// ============================================
// MAIN - Entry point
// ============================================

// Start the game
const game = new GameEngine();

// Expose game instance to window for UI interaction
(window as any).game = game;

// ============================
// LOOP & CONTROL STATE
// ============================

const baseTickRate = CONFIG.TICK_RATE;
let speedMultiplier = 1;
let isPaused = false;
let loopHandle: number | null = null;

const pauseButton = document.getElementById('pause-toggle') as HTMLButtonElement | null;
const speedSelect = document.getElementById('speed-select') as HTMLSelectElement | null;
const speedReadout = document.getElementById('speed-readout');
const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.view-button'));
const timelineZoomInput = document.getElementById('timeline-zoom') as HTMLInputElement | null;
const timelineZoomLabel = document.getElementById('timeline-zoom-label');

const stopLoop = () => {
    if (loopHandle !== null) {
        window.clearInterval(loopHandle);
        loopHandle = null;
    }
};

const startLoop = () => {
    stopLoop();
    if (isPaused) {
        return;
    }
    const intervalMs = Math.max(16, Math.round(baseTickRate / speedMultiplier));
    loopHandle = window.setInterval(() => {
        game.tick();
    }, intervalMs);
};

const updatePauseButton = () => {
    if (!pauseButton) return;
    pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
    pauseButton.dataset.state = isPaused ? 'paused' : 'running';
    pauseButton.setAttribute('aria-pressed', String(isPaused));
};

const updateSpeedReadout = () => {
    if (speedReadout) {
        speedReadout.textContent = `${speedMultiplier.toFixed(1)}x`;
    }
};

const setViewMode = (mode: string) => {
    document.body.dataset.viewMode = mode;
    viewButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.viewMode === mode);
    });
};

const initialiseSpeed = () => {
    if (speedSelect) {
        const parsed = parseFloat(speedSelect.value);
        speedMultiplier = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }
    updateSpeedReadout();
};

const initialiseZoom = () => {
    if (!timelineZoomInput || !timelineZoomLabel) return;
    const updateZoomLabel = () => {
        timelineZoomLabel.textContent = `${timelineZoomInput.value}s`;
    };
    timelineZoomInput.addEventListener('input', updateZoomLabel);
    updateZoomLabel();
};

// ============================
// EVENT WIRING
// ============================

if (pauseButton) {
    pauseButton.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
            stopLoop();
        } else {
            game.resyncTiming();
            startLoop();
        }
        updatePauseButton();
    });
}

if (speedSelect) {
    speedSelect.addEventListener('change', () => {
        const parsed = parseFloat(speedSelect.value);
        speedMultiplier = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        updateSpeedReadout();
        startLoop();
    });
}

viewButtons.forEach(button => {
    button.addEventListener('click', () => {
        const mode = button.dataset.viewMode;
        if (!mode) return;
        setViewMode(mode);
    });
});

initialiseSpeed();
initialiseZoom();
setViewMode('telemetry');
updatePauseButton();
startLoop();

// Log that game started
console.log('Game started! Tick rate:', `${baseTickRate}ms`, 'Speed:', `${speedMultiplier.toFixed(1)}x`);
