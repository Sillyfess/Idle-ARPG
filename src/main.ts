import { GameEngine } from './GameEngine';
import { CONFIG } from './data/GameData';

// ============================================
// MAIN - Entry point
// ============================================

// Start the game
const game = new GameEngine();

// Expose game instance to window for UI interaction
(window as any).game = game;

// Run game loop
setInterval(() => {
    game.tick();
}, CONFIG.TICK_RATE);

// Log that game started
console.log('Game started! Tick rate:', CONFIG.TICK_RATE + 'ms');
