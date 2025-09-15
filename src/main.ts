interface Character {
    name: string;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    manaRegen: number; // Per second
    damage: number;
}

interface Ability {
    name: string;
    manaCost: number;
    castTime: number; // In milliseconds
    damage: number;
    execute: (caster: Character, target: Character) => void;
}

class CombatEngine {
    private player: Character;
    private enemy: Character;
    private combatLog: Array<{message: string, type: string}> = [];

    // Player melee swing timer
    private currentSwingTime: number = 0;
    private isSwinging: boolean = false;
    private meleeSwingTime: number = 4500; // 4.5 second swing timer

    // Enemy attack timer
    private enemyAttackTimer: number = 0;
    private enemyAttackSpeed: number = 3000; // Enemy attacks every 3 seconds

    // Global cooldown for instant spells
    private globalCooldown: number = 0;
    private gcdDuration: number = 1000; // 1 second GCD

    // Time tracking
    private lastUpdate: number = Date.now();
    private manaAccumulator: number = 0;

    constructor() {
        this.player = {
            name: "Cleric",
            hp: 100,
            maxHp: 100,
            mana: 100,
            maxMana: 100,
            manaRegen: 1, // 5 mana per second
            damage: 10
        };

        this.enemy = {
            name: "Skeleton",
            hp: 100,
            maxHp: 100,
            mana: 0,
            maxMana: 0,
            manaRegen: 0,
            damage: 10
        };
    }

    private holyStrike: Ability = {
        name: "Holy Strike",
        manaCost: 25,
        castTime: 0, // Instant cast
        damage: 25,
        execute: (caster, target) => {
            target.hp -= this.holyStrike.damage;
            this.log(`${caster.name} casts Holy Strike for ${this.holyStrike.damage} damage!`, 'player-magic');
        }
    };

    tick() {
        const now = Date.now();
        const deltaTime = now - this.lastUpdate;
        this.lastUpdate = now;

        // Regenerate mana smoothly over time
        this.manaAccumulator += (this.player.manaRegen * deltaTime) / 1000;
        if (this.manaAccumulator >=1) {
            const manaToAdd = Math.floor(this.manaAccumulator);
            this.player.mana = Math.min(this.player.mana + manaToAdd, this.player.maxMana);
            this.manaAccumulator -= manaToAdd;
        }

        // Update timers
        if (this.globalCooldown > 0) {
            this.globalCooldown -= deltaTime;
        }

        // Handle player melee swing timer
        if (this.isSwinging) {
            this.currentSwingTime -= deltaTime;
            if (this.currentSwingTime <= 0) {
                this.completeMeleeSwing();
            }
        }

        // Handle enemy attacks
        if (this.enemy.hp > 0 && this.player.hp > 0) {
            this.enemyAttackTimer += deltaTime;
            if (this.enemyAttackTimer >= this.enemyAttackSpeed) {
                this.enemyAttack();
                this.enemyAttackTimer = 0;
            }
        }

        // Decide player action (spells interrupt swings)
        if (this.player.hp > 0 && this.globalCooldown <= 0) {
            if (this.player.mana >= this.holyStrike.manaCost) {
                // Cancel swing if we're swinging and cast spell instead
                if (this.isSwinging) {
                    this.cancelMeleeSwing();
                }
                this.castInstantSpell(this.holyStrike);
            } else if (!this.isSwinging) {
                // Only start a new swing if we're not already swinging
                this.startMeleeSwing();
            }
        }

        // Check combat end conditions
        if (this.enemy.hp <= 0) {
            this.log(`${this.enemy.name} defeated!`, 'system');
            this.enemy.hp = this.enemy.maxHp;
            this.enemyAttackTimer = 0; // Reset enemy attack timer
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

        this.updateDisplay();
    }

    private startMeleeSwing() {
        this.isSwinging = true;
        this.currentSwingTime = this.meleeSwingTime;
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
        // Deduct mana and trigger GCD
        this.player.mana -= ability.manaCost;
        this.globalCooldown = this.gcdDuration;

        // Visual effects
        this.triggerAttackAnimation('player');
        this.showDamageNumber(ability.damage, 'holy', 'enemy');

        // Execute the ability immediately (it's instant)
        ability.execute(this.player, this.enemy);
    }

    private enemyAttack() {
        // Visual effects
        this.triggerAttackAnimation('enemy');
        this.showDamageNumber(this.enemy.damage, 'enemy', 'player');
        
        this.player.hp -= this.enemy.damage;
        this.log(
            `${this.enemy.name} slashes for ${this.enemy.damage} damage!`,
            'damage'
        );
    }

    private log(message: string, type: string = 'system') {
        const timestamp = new Date().toLocaleTimeString();
        this.combatLog.unshift({
            message: `[${timestamp}] ${message}`,
            type: type
        });
        if (this.combatLog.length > 20) {
            this.combatLog.pop();
        }
        const logElement = document.getElementById('combat-log');
        if (logElement) {
            logElement.innerHTML = this.combatLog
                .map(entry => `<div class="${entry.type}">${entry.message}</div>`)
                .join('');
        }
    }

    private updateDisplay() {
        const stats = document.getElementById('stats');
        if (stats) {
            let playerStatus = 'Ready';
            if (this.player.hp <= 0) {
                playerStatus = 'Dead';
            } else if (this.isSwinging) {
                const swingTimeLeft = (this.currentSwingTime / 1000).toFixed(1);
                playerStatus = `Swinging: ${swingTimeLeft}s`;
            } else if (this.globalCooldown > 0) {
                playerStatus = `GCD: ${(this.globalCooldown / 1000).toFixed(1)}s`;
            }

            const enemyNextAttack = ((this.enemyAttackSpeed - this.enemyAttackTimer) / 1000).toFixed(1);

            stats.innerHTML = `
            <div>Player: ${this.player.hp}/${this.player.maxHp} HP | ${this.player.mana}/${this.player.maxMana} Mana | ${playerStatus}</div>
            <div>Enemy: ${this.enemy.hp}/${this.enemy.maxHp} HP | Next attack: ${enemyNextAttack}s</div>
            `;
        }
        
        // Update health/mana bars
        this.updateBars();
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
    
    private triggerAttackAnimation(attacker: 'player' | 'enemy') {
        if (attacker === 'player') {
            const playerSprite = document.getElementById('player-sprite');
            const enemySprite = document.getElementById('enemy-sprite');
            
            if (playerSprite) {
                playerSprite.classList.add('attacking');
                setTimeout(() => playerSprite.classList.remove('attacking'), 300);
            }
            
            if (enemySprite) {
                setTimeout(() => {
                    enemySprite.classList.add('damaged');
                    setTimeout(() => enemySprite.classList.remove('damaged'), 300);
                }, 150);
            }
        } else {
            const enemySprite = document.getElementById('enemy-sprite');
            const playerSprite = document.getElementById('player-sprite');
            
            if (enemySprite) {
                enemySprite.classList.add('enemy-attacking');
                setTimeout(() => enemySprite.classList.remove('enemy-attacking'), 300);
            }
            
            if (playerSprite) {
                setTimeout(() => {
                    playerSprite.classList.add('damaged');
                    setTimeout(() => playerSprite.classList.remove('damaged'), 300);
                }, 150);
            }
        }
    }
    
    private showDamageNumber(damage: number, type: 'physical' | 'holy' | 'enemy', target: 'player' | 'enemy') {
        const arena = document.getElementById('combat-arena');
        if (!arena) return;
        
        const damageElement = document.createElement('div');
        damageElement.className = `damage-number damage-${type}`;
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
        }, 1500);
    }
}

// Start the game
const game = new CombatEngine();
setInterval(() => game.tick(), 50); // 20 ticks per second for smooth updates