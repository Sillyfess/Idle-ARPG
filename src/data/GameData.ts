// ============================================
// GAME DATA - All configuration and content
// ============================================

// Core game configuration
export const CONFIG = {
    // Timing
    TICK_RATE: 50,                    // ms between game updates
    
    // Combat
    GLOBAL_COOLDOWN: 1000,            // ms after instant cast
    
    // UI
    MAX_COMBAT_LOG_ENTRIES: 20,
    DAMAGE_NUMBER_DURATION: 1500,     // ms before fade
    ANIMATION_DURATION: 300,          // ms for attack animations
};

// Player configuration
export const PLAYER_CONFIG = {
    // Base stats
    BASE_HP: 100,
    BASE_MANA: 100,
    BASE_MANA_REGEN: 1,               // per second
    
    // Melee
    MELEE_DAMAGE: 10,
    MELEE_SWING_TIME: 4500,           // ms to complete a swing
    
    // Visual
    SPRITE_TEXT: 'C',
    SPRITE_COLOR: '#4a9eff',
};

// Ability definitions
export const ABILITIES = {
    holyStrike: {
        id: 'holy_strike',
        name: 'Holy Strike',
        manaCost: 25,
        castTime: 0,                  // instant
        damage: 25,
        damageType: 'holy' as const,
        description: 'Instantly strike with holy power',
        logMessage: (caster: string, damage: number) => 
            `${caster} casts Holy Strike for ${damage} damage!`,
        logType: 'player-magic'
    },
    
    // Easy to add more abilities:
    /*
    heal: {
        id: 'heal',
        name: 'Heal',
        manaCost: 15,
        castTime: 2000,
        healing: 30,
        damageType: 'healing' as const,
        description: 'Restore health over time',
    }
    */
};

// Enemy definitions
export const ENEMIES = {
    skeleton: {
        id: 'skeleton',
        name: 'Skeleton',
        hp: 100,
        damage: 10,
        attackSpeed: 3000,            // ms between attacks
        
        // Visual
        sprite: 'S',
        spriteColor: '#ff4444',
        
        // Rewards (for future)
        xpReward: 10,
        dropChance: 0.1,
    },
    
    // Easy to add more enemies:
    /*
    zombie: {
        id: 'zombie',
        name: 'Zombie',
        hp: 150,
        damage: 15,
        attackSpeed: 4000,
        sprite: 'Z',
        spriteColor: '#66ff66',
        xpReward: 20,
        dropChance: 0.15,
    }
    */
};

// Damage type configurations
export const DAMAGE_TYPES = {
    physical: {
        cssClass: 'damage-physical',
        color: '#ffa726',
    },
    holy: {
        cssClass: 'damage-holy',
        color: '#64b5f6',
    },
    enemy: {
        cssClass: 'damage-enemy',
        color: '#ef5350',
    },
};

// Combat log message types
export const LOG_TYPES = {
    'player-magic': { cssClass: 'player-magic', color: '#4dabf7' },
    'melee': { cssClass: 'melee', color: '#ffa726' },
    'damage': { cssClass: 'damage', color: '#ff6b6b' },
    'system': { cssClass: 'system', color: '#868e96' },
    'heal': { cssClass: 'heal', color: '#51cf66' },
    'mana': { cssClass: 'mana', color: '#339af0' },
};
