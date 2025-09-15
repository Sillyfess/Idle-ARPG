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

### Core Game Engine (`src/main.ts`)
The game implements a real-time combat system with:
- **CombatEngine class**: Central game loop running at 20 ticks/second (50ms intervals)
- **Character system**: Interface-based entities with HP, mana, damage, and regeneration stats
- **Ability system**: Casting mechanics with mana costs and cast times
- **Combat mechanics**:
  - Holy Strike ability: 25 mana cost, 1 second cast time, 25 damage
  - Melee attacks: Auto-attack fallback when out of mana (1.5 second attack speed)
  - Mana regeneration: Smooth accumulator-based regen system

### UI Structure
- **index.html**: Single-page application with:
  - Stats display area showing player/enemy HP and mana
  - Combat log with 20-entry history
  - Dark theme with monospace font aesthetic
  - CSS classes for combat events: `.damage`, `.heal`, `.mana`, `.system`, `.melee`

### TypeScript Configuration
- **Module system**: ESNext modules with NodeNext resolution
- **Strict mode**: Full strict type checking enabled
- **Additional safety**: `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled
- **Source maps**: Enabled for development debugging

## Development Notes

- The game loop uses `Date.now()` for precise delta time calculations
- Mana regeneration uses an accumulator pattern to handle fractional regeneration smoothly
- Combat log timestamps use `toLocaleTimeString()` for user-friendly display
- No test framework currently configured (npm test returns error)
- Project uses Vite for development with native TypeScript support (no build step required during development)