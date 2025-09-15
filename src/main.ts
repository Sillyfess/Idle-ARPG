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
    private currentCastTime: number = 0
    private isCasting: boolean = false;
    private combatLog: Array<{message: string, type: string}> = [];

    // This becomes important - we're tracking time precisely
    private lastUpdate: number = Date.now();
    private manaAccumulator: number = 0;

    // Melee attack timing
    private timeSinceLastAttack: number = 0;
    private attackSpeed: number = 1500;

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
            hp: 50,
            maxHp: 50,
            mana: 0,
            maxMana: 0,
            manaRegen: 0,
            damage: 5
        };
    }

    private holyStrike: Ability = {
        name: "Holy Strike",
        manaCost: 25,
        castTime: 1000, // 1 second cast
        damage: 25,
        execute: (caster, target) => {
            target.hp -= this.holyStrike.damage;
            this.log (`${caster.name} casts Holy Strike for ${this.holyStrike.damage} damage!`, 'damage');
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

        // Melee timing
        this.timeSinceLastAttack += deltaTime;

        // Handle casting
        if (!this.isCasting) {
            if (this.player.mana >= this.holyStrike.manaCost) {
                this.startCast(this.holyStrike);
            } else if (this.timeSinceLastAttack >= this.attackSpeed) {
                this.meleeAttack();
            }
        }
        

        if (this.isCasting) {
            this.currentCastTime -= deltaTime;
            if (this.currentCastTime <= 0) {
                this.completeCast(this.holyStrike);
            }
        }

        // Check combat end
        if (this.enemy.hp <=0) {
            this.log(`${this.enemy.name} defeated!`, 'system');
            this.enemy.hp = this.enemy.maxHp;
            this.log(`New ${this.enemy.name} appears!`, 'system');
        }

        this.updateDisplay();
    }

    private meleeAttack() {
        this.enemy.hp -= this.player.damage;
        this.timeSinceLastAttack = 0;
        this.log(
            `${this.player.name} swings their mace for ${this.player.damage} damage!`,
            'melee'
        )
    }

    private startCast(ability: Ability) {
        this.isCasting = true;
        this.currentCastTime = ability.castTime;
        this.player.mana -= ability.manaCost;
        this.log(`Casting ${ability.name}...`, 'mana');
    }

    private completeCast(ability: Ability) {
        this.isCasting = false;
        ability.execute(this.player, this.enemy);
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
            const meleeReady = this.timeSinceLastAttack >= this.attackSpeed;
            const meleeTimeLeft = Math.max(0, this.attackSpeed - this.timeSinceLastAttack) / 1000;

            stats.innerHTML = `
            <div>Player: ${this.player.hp}/${this.player.maxHp} HP | ${this.player.mana}/${this.player.maxMana} Mana</div>
            <div> Enemy: ${this.enemy.hp}/${this.enemy.maxHp} HP</div>
            <div>${this.isCasting ? 'Casting...' : 'Ready'}</div>
            `;
        }
    }
}

// Start the game
const game = new CombatEngine();
setInterval(() => game.tick(), 50); // 20 ticks per second for smooth updates