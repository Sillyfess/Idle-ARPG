// ============================================
// GAME DATA - All configuration and content
// ============================================

// Core game configuration
export const CONFIG = {
    // Timing
    TICK_RATE: 50,                    // ms between game updates
    
    // Combat
    GLOBAL_COOLDOWN: 1500,            // ms after instant cast
    
    // UI
    MAX_COMBAT_LOG_ENTRIES: 20,
    DAMAGE_NUMBER_DURATION: 800,      // ms before fade (RuneScape-style)
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
        cooldown: 6000,                // 6 second cooldown
        healOnDamage: true,            // heals player for damage done
        damageType: 'holy' as const,
        description: 'Instantly strike with holy power, healing yourself for damage done',
        logMessage: (caster: string, damage: number) => 
            `${caster} casts Holy Strike for ${damage} damage!`,
        logType: 'player-magic'
    },
    
    windfuryAura: {
        id: 'windfury_aura',
        name: 'Windfury Aura',
        manaCost: 0,                  // No mana cost
        manaReserve: 0.5,             // Reserves 50% of max mana
        castTime: 0,                  // instant toggle
        isAura: true,                 // Persistent effect
        windfuryChance: 0.2,          // 20% chance
        windfuryAttacks: 2,           // 2 extra attacks
        damageType: 'physical' as const,
        description: 'Reserves 50% of max mana. Your attacks have a 20% chance to trigger 2 additional strikes',
        logMessage: (caster: string, active: boolean) => 
            active ? `${caster} activates Windfury Aura!` : `${caster} deactivates Windfury Aura`,
        logType: 'system'
    },
    
    summonSkeleton: {
        id: 'summon_skeleton',
        name: 'Summon Skeleton',
        manaCost: 50,
        castTime: 0,                  // instant
        duration: 30000,              // 30 seconds
        damageType: 'summon' as const,
        description: 'Summon a skeleton warrior to fight alongside you for 30 seconds',
        logMessage: (caster: string) => 
            `${caster} raises a skeleton warrior from the bones of the fallen!`,
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
    healing: {
        cssClass: 'damage-healing',
        color: '#51cf66',
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

// Combat AI Rules - Controls when abilities are used
export const COMBAT_RULES = [
    {
        priority: 1,  // Lower number = higher priority
        conditions: [
            { type: 'hp_below_percent', value: 75 },  // HP below 75%
            { type: 'cooldown_ready', ability: 'holy_strike' },
            { type: 'has_mana', ability: 'holy_strike' }
        ],
        action: 'holy_strike',
        description: 'Use Holy Strike when below 75% HP'
    },
    {
        priority: 2,
        conditions: [],  // No conditions = always true
        action: 'melee',
        description: 'Default to melee attack'
    }
];

// Types for the condition system
export type ConditionType = 
    | 'hp_below_percent' 
    | 'hp_above_percent'
    | 'mana_below_percent'
    | 'mana_above_percent'
    | 'cooldown_ready'
    | 'has_mana'
    | 'enemy_hp_below_percent'
    | 'enemy_hp_above_percent';
