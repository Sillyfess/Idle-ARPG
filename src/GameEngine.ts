import { CONFIG, PLAYER_CONFIG, ABILITIES, ENEMIES, DAMAGE_TYPES, LOG_TYPES } from './data/GameData';

// ============================================
// INTERFACES - Type definitions
// ============================================

interface Character {
    name: string;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    manaRegen: number;
    damage: number;
}

interface Ability {
    id: string;
    name: string;
    manaCost: number;
    castTime: number;
    damage?: number;
    healing?: number;
    cooldown?: number;
    healOnDamage?: boolean;
    damageType: 'physical' | 'holy' | 'healing';
    execute: (caster: Character, target: Character) => void;
}

interface CombatLogEntry {
    message: string;
    type: string;
}

// ============================================
// GAME ENGINE - Monolithic core
// ============================================

export class GameEngine {
    // ========== GAME STATE ==========
    private player: Character;
    private enemy: Character;
    private currentEnemyType = ENEMIES.skeleton; // Easy to switch enemy types
    
    // ========== COMBAT STATE ==========
    private isSwinging: boolean = false;
    private currentSwingTime: number = 0;
    private enemyAttackTimer: number = 0;
    private globalCooldown: number = 0;
    
    // Ability cooldowns (separate from GCD)
    private abilityCooldowns: Map<string, number> = new Map();
    
    // ========== TIMING ==========
    private lastUpdate: number = Date.now();
    private manaAccumulator: number = 0;
    
    // ========== UI STATE ==========
    private combatLog: CombatLogEntry[] = [];
    
    // ========== INITIALIZATION ==========
    constructor() {
        this.player = this.createPlayer();
        this.enemy = this.createEnemy(this.currentEnemyType);
        this.initializeAbilities();
    }
    
    private createPlayer(): Character {
        return {
            name: "Cleric",
            hp: PLAYER_CONFIG.BASE_HP,
            maxHp: PLAYER_CONFIG.BASE_HP,
            mana: PLAYER_CONFIG.BASE_MANA,
            maxMana: PLAYER_CONFIG.BASE_MANA,
            manaRegen: PLAYER_CONFIG.BASE_MANA_REGEN,
            damage: PLAYER_CONFIG.MELEE_DAMAGE
        };
    }
    
    private createEnemy(enemyType: typeof ENEMIES.skeleton): Character {
        return {
            name: enemyType.name,
            hp: enemyType.hp,
            maxHp: enemyType.hp,
            mana: 0,
            maxMana: 0,
            manaRegen: 0,
            damage: enemyType.damage
        };
    }
    
    // ========== ABILITIES ==========
    private holyStrike: Ability;
    
    private initializeAbilities() {
        const holyStrikeData = ABILITIES.holyStrike;
        this.holyStrike = {
            ...holyStrikeData,
            execute: (caster, target) => {
                if (holyStrikeData.damage) {
                    target.hp -= holyStrikeData.damage;
                    this.log(
                        holyStrikeData.logMessage(caster.name, holyStrikeData.damage),
                        holyStrikeData.logType
                    );
                    
                    // Heal player for damage done if healOnDamage is true
                    if (holyStrikeData.healOnDamage) {
                        const healAmount = holyStrikeData.damage;
                        const oldHp = this.player.hp;
                        this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
                        const actualHeal = this.player.hp - oldHp;
                        if (actualHeal > 0) {
                            this.log(`${this.player.name} healed for ${actualHeal} HP!`, 'heal');
                        }
                    }
                }
            }
        };
    }
    
    // ========== MAIN GAME LOOP ==========
    public tick() {
        const now = Date.now();
        const deltaTime = now - this.lastUpdate;
        this.lastUpdate = now;
        
        this.updateMana(deltaTime);
        this.updateTimers(deltaTime);
        this.processPlayerAction();
        this.processEnemyAction(deltaTime);
        this.checkCombatEnd();
        this.updateUI();
    }
    
    // ========== MANA SYSTEM ==========
    private updateMana(deltaTime: number) {
        this.manaAccumulator += (this.player.manaRegen * deltaTime) / 1000;
        if (this.manaAccumulator >= 1) {
            const manaToAdd = Math.floor(this.manaAccumulator);
            this.player.mana = Math.min(this.player.mana + manaToAdd, this.player.maxMana);
            this.manaAccumulator -= manaToAdd;
        }
    }
    
    // ========== TIMER UPDATES ==========
    private updateTimers(deltaTime: number) {
        if (this.globalCooldown > 0) {
            this.globalCooldown -= deltaTime;
        }
        
        // Update ability cooldowns
        for (const [abilityId, cooldown] of this.abilityCooldowns.entries()) {
            const newCooldown = cooldown - deltaTime;
            if (newCooldown <= 0) {
                this.abilityCooldowns.delete(abilityId);
            } else {
                this.abilityCooldowns.set(abilityId, newCooldown);
            }
        }
        
        if (this.isSwinging) {
            this.currentSwingTime -= deltaTime;
            if (this.currentSwingTime <= 0) {
                this.completeMeleeSwing();
            }
        }
    }
    
    // ========== PLAYER COMBAT ==========
    private processPlayerAction() {
        if (this.player.hp <= 0 || this.globalCooldown > 0) return;
        
        // Check if Holy Strike is available (has mana AND not on cooldown)
        const holyStrikeCooldown = this.abilityCooldowns.get(this.holyStrike.id) || 0;
        const canCastHolyStrike = this.player.mana >= this.holyStrike.manaCost && holyStrikeCooldown <= 0;
        
        if (canCastHolyStrike) {
            if (this.isSwinging) {
                this.cancelMeleeSwing();
            }
            this.castInstantSpell(this.holyStrike);
        } else if (!this.isSwinging) {
            this.startMeleeSwing();
        }
    }
    
    private startMeleeSwing() {
        this.isSwinging = true;
        this.currentSwingTime = PLAYER_CONFIG.MELEE_SWING_TIME;
        this.log(`${this.player.name} begins swinging their mace...`, 'system');
    }
    
    private completeMeleeSwing() {
        this.isSwinging = false;
        
        // Visual effects
        this.triggerAttackAnimation('player');
        this.showDamageNumber(this.player.damage, 'physical', 'enemy');
        
        this.enemy.hp -= this.player.damage;
        this.log(
            `${this.player.name} strikes with their mace for ${this.player.damage} damage!`,
            'melee'
        );
    }
    
    private cancelMeleeSwing() {
        this.isSwinging = false;
        this.currentSwingTime = 0;
        this.log(`${this.player.name} interrupts their swing to cast a spell`, 'system');
    }
    
    private castInstantSpell(ability: Ability) {
        this.player.mana -= ability.manaCost;
        this.globalCooldown = CONFIG.GLOBAL_COOLDOWN;
        
        // Start ability cooldown if it has one
        if (ability.cooldown) {
            this.abilityCooldowns.set(ability.id, ability.cooldown);
        }
        
        // Visual effects
        this.triggerAttackAnimation('player');
        if (ability.damage) {
            this.showDamageNumber(ability.damage, ability.damageType, 'enemy');
        }
        
        ability.execute(this.player, this.enemy);
    }
    
    // ========== ENEMY COMBAT ==========
    private processEnemyAction(deltaTime: number) {
        if (this.enemy.hp <= 0 || this.player.hp <= 0) return;
        
        this.enemyAttackTimer += deltaTime;
        if (this.enemyAttackTimer >= this.currentEnemyType.attackSpeed) {
            this.enemyAttack();
            this.enemyAttackTimer = 0;
        }
    }
    
    private enemyAttack() {
        this.triggerAttackAnimation('enemy');
        this.showDamageNumber(this.enemy.damage, 'enemy', 'player');
        
        this.player.hp -= this.enemy.damage;
        this.log(
            `${this.enemy.name} slashes for ${this.enemy.damage} damage!`,
            'damage'
        );
    }
    
    // ========== COMBAT END CONDITIONS ==========
    private checkCombatEnd() {
        if (this.enemy.hp <= 0) {
            this.log(`${this.enemy.name} defeated!`, 'system');
            this.enemy = this.createEnemy(this.currentEnemyType);
            this.enemyAttackTimer = 0;
            this.log(`New ${this.enemy.name} appears!`, 'system');
        }
        
        if (this.player.hp <= 0) {
            this.log(`${this.player.name} has been defeated!`, 'damage');
            this.player.hp = this.player.maxHp;
            this.player.mana = this.player.maxMana;
            this.isSwinging = false;
            this.currentSwingTime = 0;
            this.globalCooldown = 0;
            this.log(`${this.player.name} respawns with full health and mana!`, 'heal');
        }
    }
    
    // ========== COMBAT LOG ==========
    private log(message: string, type: string = 'system') {
        const timestamp = new Date().toLocaleTimeString();
        this.combatLog.unshift({
            message: `[${timestamp}] ${message}`,
            type: type
        });
        
        if (this.combatLog.length > CONFIG.MAX_COMBAT_LOG_ENTRIES) {
            this.combatLog.pop();
        }
    }
    
    // ========== UI UPDATES ==========
    private updateUI() {
        this.updateStats();
        this.updateBars();
        this.updateCombatLog();
    }
    
    private updateStats() {
        const stats = document.getElementById('stats');
        if (!stats) return;
        
        let playerStatus = 'Ready';
        if (this.player.hp <= 0) {
            playerStatus = 'Dead';
        } else if (this.isSwinging) {
            const swingTimeLeft = (this.currentSwingTime / 1000).toFixed(1);
            playerStatus = `Swinging: ${swingTimeLeft}s`;
        } else if (this.globalCooldown > 0) {
            playerStatus = `GCD: ${(this.globalCooldown / 1000).toFixed(1)}s`;
        }
        
        // Show Holy Strike cooldown if active
        const holyStrikeCooldown = this.abilityCooldowns.get(this.holyStrike.id) || 0;
        const cooldownText = holyStrikeCooldown > 0 ? ` | Holy Strike CD: ${(holyStrikeCooldown / 1000).toFixed(1)}s` : '';
        
        const enemyNextAttack = ((this.currentEnemyType.attackSpeed - this.enemyAttackTimer) / 1000).toFixed(1);
        
        stats.innerHTML = `
            <div>Player: ${this.player.hp}/${this.player.maxHp} HP | ${this.player.mana}/${this.player.maxMana} Mana | ${playerStatus}${cooldownText}</div>
            <div>Enemy: ${this.enemy.hp}/${this.enemy.maxHp} HP | Next attack: ${enemyNextAttack}s</div>
        `;
    }
    
    private updateBars() {
        // Player health bar
        const playerHealthBar = document.getElementById('player-health-bar') as HTMLElement;
        if (playerHealthBar) {
            const healthPercent = Math.max(0, (this.player.hp / this.player.maxHp) * 100);
            playerHealthBar.style.width = `${healthPercent}%`;
            const healthText = playerHealthBar.querySelector('.bar-text');
            if (healthText) {
                healthText.textContent = `${this.player.hp}/${this.player.maxHp}`;
            }
        }
        
        // Player mana bar
        const playerManaBar = document.getElementById('player-mana-bar') as HTMLElement;
        if (playerManaBar) {
            const manaPercent = Math.max(0, (this.player.mana / this.player.maxMana) * 100);
            playerManaBar.style.width = `${manaPercent}%`;
            const manaText = playerManaBar.querySelector('.bar-text');
            if (manaText) {
                manaText.textContent = `${this.player.mana}/${this.player.maxMana}`;
            }
        }
        
        // Enemy health bar
        const enemyHealthBar = document.getElementById('enemy-health-bar') as HTMLElement;
        if (enemyHealthBar) {
            const healthPercent = Math.max(0, (this.enemy.hp / this.enemy.maxHp) * 100);
            enemyHealthBar.style.width = `${healthPercent}%`;
            const healthText = enemyHealthBar.querySelector('.bar-text');
            if (healthText) {
                healthText.textContent = `${this.enemy.hp}/${this.enemy.maxHp}`;
            }
        }
    }
    
    private updateCombatLog() {
        const logElement = document.getElementById('combat-log');
        if (!logElement) return;
        
        logElement.innerHTML = this.combatLog
            .map(entry => `<div class="${entry.type}">${entry.message}</div>`)
            .join('');
    }
    
    // ========== VISUAL EFFECTS ==========
    private triggerAttackAnimation(attacker: 'player' | 'enemy') {
        if (attacker === 'player') {
            const playerSprite = document.getElementById('player-sprite');
            const enemySprite = document.getElementById('enemy-sprite');
            
            if (playerSprite) {
                playerSprite.classList.add('attacking');
                setTimeout(() => playerSprite.classList.remove('attacking'), CONFIG.ANIMATION_DURATION);
            }
            
            if (enemySprite) {
                setTimeout(() => {
                    enemySprite.classList.add('damaged');
                    setTimeout(() => enemySprite.classList.remove('damaged'), CONFIG.ANIMATION_DURATION);
                }, 150);
            }
        } else {
            const enemySprite = document.getElementById('enemy-sprite');
            const playerSprite = document.getElementById('player-sprite');
            
            if (enemySprite) {
                enemySprite.classList.add('enemy-attacking');
                setTimeout(() => enemySprite.classList.remove('enemy-attacking'), CONFIG.ANIMATION_DURATION);
            }
            
            if (playerSprite) {
                setTimeout(() => {
                    playerSprite.classList.add('damaged');
                    setTimeout(() => playerSprite.classList.remove('damaged'), CONFIG.ANIMATION_DURATION);
                }, 150);
            }
        }
    }
    
    private showDamageNumber(damage: number, type: string, target: 'player' | 'enemy') {
        const arena = document.getElementById('combat-arena');
        if (!arena) return;
        
        const damageElement = document.createElement('div');
        const damageTypeConfig = DAMAGE_TYPES[type as keyof typeof DAMAGE_TYPES];
        damageElement.className = `damage-number ${damageTypeConfig?.cssClass || ''}`;
        damageElement.textContent = damage.toString();
        
        // Position based on target
        if (target === 'enemy') {
            damageElement.style.right = '50px';
            damageElement.style.left = 'auto';
        } else {
            damageElement.style.left = '50px';
            damageElement.style.right = 'auto';
        }
        damageElement.style.top = '40%';
        
        arena.appendChild(damageElement);
        
        // Remove after animation
        setTimeout(() => {
            damageElement.remove();
        }, CONFIG.DAMAGE_NUMBER_DURATION);
    }
}
