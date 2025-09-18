# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Idle ARPG game built with TypeScript. The project uses a web-based interface with an HTML entry point that loads TypeScript modules directly through Vite.

## Commands

### Development
- **Start dev server**: `npx vite` - Runs the Vite development server with TypeScript HMR support
- **Build for production**: `npx vite build` - Creates optimized production build
- **Preview production build**: `npx vite preview` - Test the production build locally
- **TypeScript compilation check**: `npx tsc --noEmit` - Type-check without emitting files

### Setup
- **Install dependencies**: `npm install` - Installs TypeScript and Vite dev dependencies

## Architecture

### Core Game Engine (`src/GameEngine.ts`)
The game implements a comprehensive real-time combat system centered around a monolithic GameEngine class:

**Core Systems Architecture:**
- **GameEngine class**: Monolithic design with clearly separated sections for game state, combat, auras, summons, timing, UI, and inventory
- **Tick-based updates**: Runs at 100ms intervals (configurable via `CONFIG.TICK_RATE`)
- **Character system**: Interface-based entities with HP, mana, damage, armor, gold, and regeneration stats
- **State management**: Centralized state with separate maps for ability cooldowns, active auras, and summons

**Combat System:**
- **Ability system**: Dynamic ability casting with cooldowns, mana costs, and damage types (physical, holy, summon)
- **Global cooldown**: 1.5-second GCD after instant abilities
- **Combat AI**: Rule-based decision system with configurable priority-based conditions
- **Damage variance**: 20% variance (0.8x to 1.2x multipliers) for all damage calculations
- **Combat mechanics**:
  - Holy Strike: Instant cast, 25 mana, 2.5x melee damage multiplier, heals caster
  - Windfury Aura: Mana reservation system, 20% chance for 2 extra attacks
  - Skeleton Summons: Up to 3 summons, 30-second duration, 75% of player damage

**Systems Integration:**
- **Aura system**: Persistent effects with mana reservation mechanics
- **Summon system**: Autonomous entities with independent attack timers and lifespans
- **Inventory & Shop**: Equipment system with damage/armor/mana regen modifiers and gold-based transactions

### UI Structure
- **index.html**: Single-page application with:
  - Combat arena with ASCII trees background and character sprites
  - Interactive ability icons with cooldown sweeps and tooltips
  - RuneScape-style damage splats with pop-in animations
  - Stats display showing HP/mana bars with real-time updates
  - Combat log with 30-entry history and timestamped events
  - Dynamic Combat AI Rules panel for live rule editing
  - Dark theme (#0f0f0f background) with monospace font aesthetic
  - CSS classes for combat events: `.damage`, `.heal`, `.mana`, `.system`, `.melee`, `.player-magic`, `.loot`, `.windfury`

### Data Architecture (`src/data/GameData.ts`)
Central configuration hub containing:
- **CONFIG**: Core timing and combat constants (tick rate, GCD, damage variance)
- **PLAYER_CONFIG**: Base stats, melee damage, swing timing, visual settings
- **ABILITIES**: Complete ability definitions with damage multipliers, cooldowns, mana costs
- **ENEMIES**: Enemy templates with HP, damage, attack speed, and visual properties
- **COMBAT_RULES**: Priority-based AI decision system with configurable conditions
- **Type definitions**: Comprehensive condition types for the AI system

### TypeScript Configuration
- **Module system**: ESNext modules with Node resolution for modern import/export
- **Target**: ES2020 with DOM library support
- **Strict mode**: Full strict type checking enabled
- **Source maps**: Enabled for development debugging

## Development Notes

### Implementation Patterns
- **Monolithic architecture**: Single GameEngine class manages all systems for simplicity and performance
- **State separation**: Clear boundaries between combat, aura, summon, inventory, and UI state
- **Delta time**: Uses `Date.now()` for precise timing calculations across all systems
- **Accumulator pattern**: Mana regeneration handles fractional values smoothly
- **Interface-driven design**: Character, Item, Ability, and Summon interfaces enable easy extension

### Code Organization Principles
- **GameData.ts**: Centralized configuration - modify stats, abilities, and AI rules here
- **GameEngine.ts**: Core systems implementation with clearly marked sections
- **main.ts**: Minimal entry point - just starts the engine and exposes to window
- **index.html**: Complete UI with embedded styles - no external CSS dependencies

### Performance Considerations
- **Tick-based updates**: 100ms intervals balance responsiveness with performance
- **Efficient DOM updates**: Direct element manipulation instead of framework overhead
- **Memory management**: Arrays have max sizes (combat log: 30 entries, max summons: 3)

### Extension Points
- Add new abilities in `ABILITIES` object with proper interfaces
- Add new enemies in `ENEMIES` object with stat templates
- Extend AI with new condition types in `ConditionType` union
- Add new items via the Item interface and inventory system

### Technical Limitations
- No test framework configured (npm test returns error)
- No build step required during development (Vite handles TypeScript directly)
- Project targets modern browsers with ES2020+ support