import { GameEngine } from './GameEngine';
import { CONFIG } from './data/GameData';

// ============================================
// MAIN - Entry point with telemetry controls
// ============================================

const game = new GameEngine();
(window as any).game = game;

let isPaused = false;
let speedMultiplier = 1;
const baseTickRate = CONFIG.TICK_RATE;
let tickInterval: number | undefined;

const runTick = () => {
    if (!isPaused) {
        game.tick();
    }
};

const startLoop = () => {
    if (tickInterval !== undefined) {
        clearInterval(tickInterval);
    }

    const intervalRate = Math.max(16, Math.round(baseTickRate / speedMultiplier));
    tickInterval = window.setInterval(runTick, intervalRate);
};

startLoop();

const pauseBtn = document.getElementById('pause-btn');
if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
        pauseBtn.classList.toggle('active', isPaused);
    });
}

const speedSelect = document.getElementById('speed-select') as HTMLSelectElement | null;
if (speedSelect) {
    speedSelect.addEventListener('change', () => {
        const value = parseFloat(speedSelect.value);
        speedMultiplier = isNaN(value) ? 1 : value;
        startLoop();
    });
}

const viewSelect = document.getElementById('view-select') as HTMLSelectElement | null;
if (viewSelect) {
    const setView = (value: string) => {
        document.body.setAttribute('data-view', value);
    };

    setView(viewSelect.value);

    viewSelect.addEventListener('change', () => {
        setView(viewSelect.value);
    });
}

const zoomInput = document.getElementById('timeline-zoom') as HTMLInputElement | null;
const zoomReadout = document.getElementById('zoom-readout');
if (zoomInput && zoomReadout) {
    const updateZoom = () => {
        zoomReadout.textContent = `${zoomInput.value}s`;
    };

    updateZoom();
    zoomInput.addEventListener('input', updateZoom);
}

console.log('Game started! Tick rate:', `${CONFIG.TICK_RATE}ms`);
