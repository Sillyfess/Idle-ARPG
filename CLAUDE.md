# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Idle ARPG game built with TypeScript. The project uses a web-based interface with an HTML entry point that loads TypeScript modules directly.

## Commands

### Development
- Run development server: Use a local web server that supports TypeScript modules (e.g., `npx vite` or `npx http-server`)
- TypeScript compilation: `npx tsc` (once tsconfig.json is configured)

### Setup
- Install dependencies: `npm install` (after package.json is populated)
- Initialize TypeScript config: `npx tsc --init` (if tsconfig.json needs configuration)

## Architecture

### Core Structure
- **index.html**: Main entry point with combat log UI and basic styling
- **src/main.ts**: Main TypeScript module loaded directly by the browser
- Game focuses on idle/incremental mechanics with ARPG combat elements

### Key Implementation Areas
The project is set up for:
- Combat system with damage, healing, and mana mechanics
- Real-time combat log display
- Stats tracking and display
- Modular TypeScript architecture using ES modules

## Development Notes

- The project uses native ES modules loaded directly in the browser
- Styling uses a dark theme with monospace fonts for a classic RPG feel
- Combat log uses color coding: red for damage, green for healing, blue for mana, gray for system messages