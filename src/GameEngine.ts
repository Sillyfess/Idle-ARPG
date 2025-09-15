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
    baseMana: number;  // Base mana before reservations
    manaRegen: number;
    baseManaRegen: number;  // Base mana regen before equipment
    damage: number;
    baseDamage: number;  // Base damage before equipment
    armor: number;  // Flat damage reduction
    gold: number;  // Currency
}

interface Summon {
    name: string;
    hp: number;
    maxHp: number;
    damage: number;
    attackSpeed: number;
    attackTimer: number;
    timeRemaining: number;
    sprite?: string;
    spriteColor?: string;
}

interface Item {
    id: string;
    name: string;
    slot: 'weapon' | 'armor' | 'consumable';
    damage?: number;
    armor?: number;
    manaRegen?: number;
    healing?: number;  // For health potions
    manaRestore?: number;  // For mana potions
    equipped: boolean;
    sellValue: number;  // Gold value when sold
    stackable?: boolean;  // For potions
    quantity?: number;  // Stack size
}

interface Ability {
    id: string;
    name: string;
    manaCost: number;
    castTime: number;
    damage?: number;
    damageMultiplier?: number;
    healing?: number;
    cooldown?: number;
    healOnDamage?: boolean;
    damageType: 'physical' | 'holy' | 'healing' | 'summon';
    execute: (caster: Character, target: Character, baseDamage?: number) => number | void;
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
    
    // ========== AURA STATE ==========
    private activeAuras: Set<string> = new Set();
    private manaReserved: number = 0;
    
    // ========== SUMMON STATE ==========
    private summons: Summon[] = [];
    private maxSummons: number = 3; // Maximum number of skeleton summons
    
    // ========== TIMING ==========
    private lastUpdate: number = Date.now();
    private manaAccumulator: number = 0;
    
    // ========== UI STATE ==========
    private combatLog: CombatLogEntry[] = [];
    private combatRules: any[] = [];
    
    // ========== DAMAGE NUMBER TRACKING ==========
    private playerDamageNumbers: HTMLElement[] = [];
    private enemyDamageNumbers: HTMLElement[] = [];
    
    // Diamond pattern positions for splat stacking
    private readonly diamondPositions = [
        { x: 0, y: 0 },      // Center (1st)
        { x: 0, y: -35 },    // Top (2nd)
        { x: -40, y: -17 },  // Left (3rd)
        { x: 40, y: -17 },   // Right (4th)
    ];
    
    // ========== EQUIPMENT & INVENTORY ==========
    private equipment: Map<string, Item | null> = new Map([
        ['weapon', null],
        ['armor', null]
    ]);
    private inventory: Item[] = [];
    private readonly maxInventorySize = 20;
    private inventoryOpen = false;
    private shopOpen = false;
    
    // ========== INITIALIZATION ==========
    constructor() {
        this.player = this.createPlayer();
        this.enemy = this.createEnemy(this.currentEnemyType);
        this.initializeAbilities();
        this.loadCombatRules();
        this.initializeUI();
    }
    
    // ========== DAMAGE CALCULATIONS ==========
    private calculateDamageWithVariance(baseDamage: number): number {
        const variance = Math.random() * (CONFIG.DAMAGE_VARIANCE_MAX - CONFIG.DAMAGE_VARIANCE_MIN) + CONFIG.DAMAGE_VARIANCE_MIN;
        return Math.round(baseDamage * variance);
    }
    
    // ========== EQUIPMENT MANAGEMENT ==========
    private recalculateStats() {
        // Reset to base values
        this.player.damage = this.player.baseDamage;
        this.player.manaRegen = this.player.baseManaRegen;
        this.player.armor = 0;
        
        // Add equipment bonuses
        this.equipment.forEach(item => {
            if (!item) return;
            this.player.damage += item.damage || 0;
            this.player.armor += item.armor || 0;
            this.player.manaRegen += item.manaRegen || 0;
        });
    }
    
    public equipItem(itemId: string) {
        const item = this.inventory.find(i => i.id === itemId);
        if (!item) return;
        
        // Get current equipped item in this slot
        const currentEquipped = this.equipment.get(item.slot);
        
        // Unequip current item if exists
        if (currentEquipped) {
            currentEquipped.equipped = false;
            // Don't add it back to inventory, it's already there
        }
        
        // Equip new item
        item.equipped = true;
        this.equipment.set(item.slot, item);
        
        // Recalculate stats
        this.recalculateStats();
        
        this.log(`Equipped ${item.name}`, 'system');
        this.updateInventoryUI();
    }
    
    public unequipItem(slot: string) {
        const item = this.equipment.get(slot);
        if (!item) return;
        
        item.equipped = false;
        this.equipment.set(slot, null);
        
        // Recalculate stats
        this.recalculateStats();
        
        this.log(`Unequipped ${item.name}`, 'system');
        this.updateInventoryUI();
    }
    
    private generateItemDrop(): Item | null {
        // 20% chance to drop an item
        if (Math.random() > 0.2) return null;
        
        // 50/50 chance for weapon or armor
        const isWeapon = Math.random() < 0.5;
        
        if (isWeapon) {
            return {
                id: 'item_' + Date.now(),
                name: 'Rusty Sword',
                slot: 'weapon',
                damage: 2,
                equipped: false,
                sellValue: 10  // Weapon sell value
            };
        } else {
            return {
                id: 'item_' + Date.now(),
                name: 'Leather Armor',
                slot: 'armor',
                armor: 2,
                manaRegen: 1,
                equipped: false,
                sellValue: 15  // Armor sell value (more because 2 stats)
            };
        }
    }
    
    private addToInventory(item: Item) {
        if (this.inventory.length >= this.maxInventorySize) {
            this.log(`Inventory full! ${item.name} was lost.`, 'system');
            return;
        }
        
        this.inventory.push(item);
        this.log(`${item.name} added to inventory!`, 'loot');
        this.updateInventoryUI();
    }
    
    public sellItem(itemId: string) {
        const itemIndex = this.inventory.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return;
        
        const item = this.inventory[itemIndex];
        
        // Can't sell equipped items
        if (item.equipped) {
            this.log(`Cannot sell equipped items! Unequip ${item.name} first.`, 'system');
            return;
        }
        
        // Add gold
        this.player.gold += item.sellValue;
        
        // Remove from inventory
        this.inventory.splice(itemIndex, 1);
        
        this.log(`Sold ${item.name} for ${item.sellValue} gold!`, 'loot');
        this.updateInventoryUI();
    }
    
    public usePotion(itemId: string) {
        const item = this.inventory.find(i => i.id === itemId);
        if (!item || item.slot !== 'consumable') return;
        
        let used = false;
        
        if (item.healing && this.player.hp < this.player.maxHp) {
            const oldHp = this.player.hp;
            this.player.hp = Math.min(this.player.hp + item.healing, this.player.maxHp);
            const healed = this.player.hp - oldHp;
            this.log(`Used ${item.name}, restored ${healed} HP!`, 'heal');
            used = true;
        } else if (item.manaRestore && this.player.mana < this.player.maxMana) {
            const oldMana = this.player.mana;
            this.player.mana = Math.min(this.player.mana + item.manaRestore, this.player.maxMana);
            const restored = this.player.mana - oldMana;
            this.log(`Used ${item.name}, restored ${restored} mana!`, 'mana');
            used = true;
        } else {
            this.log(`Cannot use ${item.name} - already at full ${item.healing ? 'health' : 'mana'}!`, 'system');
            return;
        }
        
        if (used) {
            // Reduce quantity or remove item
            if (item.quantity && item.quantity > 1) {
                item.quantity--;
            } else {
                const index = this.inventory.indexOf(item);
                this.inventory.splice(index, 1);
            }
            this.updateInventoryUI();
        }
    }
    
    public buyFromShop(itemType: string) {
        let item: Item | null = null;
        let cost = 0;
        
        switch(itemType) {
            case 'weapon':
                if (this.inventory.length >= this.maxInventorySize) {
                    this.log(`Inventory full! Cannot buy items.`, 'system');
                    return;
                }
                cost = 25;
                if (this.player.gold < cost) {
                    this.log(`Not enough gold! Need ${cost} gold.`, 'system');
                    return;
                }
                item = {
                    id: 'item_' + Date.now(),
                    name: 'Rusty Sword',
                    slot: 'weapon',
                    damage: 2,
                    equipped: false,
                    sellValue: 10
                };
                break;
            case 'armor':
                if (this.inventory.length >= this.maxInventorySize) {
                    this.log(`Inventory full! Cannot buy items.`, 'system');
                    return;
                }
                cost = 35;
                if (this.player.gold < cost) {
                    this.log(`Not enough gold! Need ${cost} gold.`, 'system');
                    return;
                }
                item = {
                    id: 'item_' + Date.now(),
                    name: 'Leather Armor',
                    slot: 'armor',
                    armor: 2,
                    manaRegen: 1,
                    equipped: false,
                    sellValue: 15
                };
                break;
            case 'health_potion':
                cost = 20;
                if (this.player.gold < cost) {
                    this.log(`Not enough gold! Need ${cost} gold.`, 'system');
                    return;
                }
                
                // Check if we already have health potions and stack them
                const existingHealthPotion = this.inventory.find(i => i.name === 'Health Potion');
                if (existingHealthPotion && existingHealthPotion.quantity) {
                    existingHealthPotion.quantity++;
                    this.player.gold -= cost;
                    this.log(`Bought Health Potion for ${cost} gold! (Stack: ${existingHealthPotion.quantity})`, 'loot');
                    this.updateInventoryUI();
                    this.updateShopUI();
                    return;
                }
                
                // Only check inventory space if we're adding a new item
                if (this.inventory.length >= this.maxInventorySize) {
                    this.log(`Inventory full! Cannot buy items.`, 'system');
                    return;
                }
                
                item = {
                    id: 'item_' + Date.now(),
                    name: 'Health Potion',
                    slot: 'consumable',
                    healing: 75,
                    equipped: false,
                    sellValue: 5,
                    stackable: true,
                    quantity: 1
                };
                break;
            case 'mana_potion':
                cost = 10;
                if (this.player.gold < cost) {
                    this.log(`Not enough gold! Need ${cost} gold.`, 'system');
                    return;
                }
                
                // Check if we already have mana potions and stack them
                const existingManaPotion = this.inventory.find(i => i.name === 'Mana Potion');
                if (existingManaPotion && existingManaPotion.quantity) {
                    existingManaPotion.quantity++;
                    this.player.gold -= cost;
                    this.log(`Bought Mana Potion for ${cost} gold! (Stack: ${existingManaPotion.quantity})`, 'loot');
                    this.updateInventoryUI();
                    this.updateShopUI();
                    return;
                }
                
                // Only check inventory space if we're adding a new item
                if (this.inventory.length >= this.maxInventorySize) {
                    this.log(`Inventory full! Cannot buy items.`, 'system');
                    return;
                }
                
                item = {
                    id: 'item_' + Date.now(),
                    name: 'Mana Potion',
                    slot: 'consumable',
                    manaRestore: 100,
                    equipped: false,
                    sellValue: 3,
                    stackable: true,
                    quantity: 1
                };
                break;
        }
        
        if (item) {
            this.player.gold -= cost;
            this.inventory.push(item);
            this.log(`Bought ${item.name} for ${cost} gold!`, 'loot');
            this.updateInventoryUI();
            this.updateShopUI();
        }
    }
    
    private createPlayer(): Character {
        return {
            name: "Cleric",
            hp: PLAYER_CONFIG.BASE_HP,
            maxHp: PLAYER_CONFIG.BASE_HP,
            mana: PLAYER_CONFIG.BASE_MANA,
            maxMana: PLAYER_CONFIG.BASE_MANA,
            baseMana: PLAYER_CONFIG.BASE_MANA,
            manaRegen: PLAYER_CONFIG.BASE_MANA_REGEN,
            baseManaRegen: PLAYER_CONFIG.BASE_MANA_REGEN,
            damage: PLAYER_CONFIG.MELEE_DAMAGE,
            baseDamage: PLAYER_CONFIG.MELEE_DAMAGE,
            armor: 0,
            gold: 10  // Start with 10 gold
        };
    }
    
    private createEnemy(enemyType: typeof ENEMIES.skeleton): Character {
        return {
            name: enemyType.name,
            hp: enemyType.hp,
            maxHp: enemyType.hp,
            mana: 0,
            maxMana: 0,
            baseMana: 0,
            manaRegen: 0,
            baseManaRegen: 0,
            damage: enemyType.damage,
            baseDamage: enemyType.damage,
            armor: 0,
            gold: 0
        };
    }
    
    // ========== ABILITIES ==========
    private holyStrike: Ability;
    private windfuryAura: any;  // Using any for now since it has different structure
    private summonSkeleton: any;
    
    private initializeAbilities() {
        const holyStrikeData = ABILITIES.holyStrike;
        this.holyStrike = {
            ...holyStrikeData,
            execute: (caster, target, baseDamage?: number) => {
                // Calculate damage based on multiplier
                // If baseDamage is provided (from melee calculation), use it
                // Otherwise calculate fresh with variance
                const meleeDamage = baseDamage || this.calculateDamageWithVariance(this.player.damage);
                const holyDamage = Math.round(meleeDamage * holyStrikeData.damageMultiplier);
                
                target.hp -= holyDamage;
                this.log(
                    holyStrikeData.logMessage(caster.name, holyDamage),
                    holyStrikeData.logType
                );
                
                // Heal player for damage done if healOnDamage is true
                if (holyStrikeData.healOnDamage) {
                    const healAmount = holyDamage;
                    const oldHp = this.player.hp;
                    this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
                    const actualHeal = this.player.hp - oldHp;
                    if (actualHeal > 0) {
                        // Show heal splat on player after a slight delay
                        setTimeout(() => {
                            this.showDamageNumber(actualHeal, 'healing', 'player');
                        }, 100);
                        this.log(`${this.player.name} healed for ${actualHeal} HP!`, 'heal');
                    }
                }
                
                return holyDamage; // Return the damage for use in other calculations
            }
        };
        
        // Initialize Windfury Aura
        this.windfuryAura = ABILITIES.windfuryAura;
        
        // Initialize Summon Skeleton
        this.summonSkeleton = ABILITIES.summonSkeleton;
    }
    
    // ========== MAIN GAME LOOP ==========
    public tick() {
        const now = Date.now();
        const deltaTime = now - this.lastUpdate;
        this.lastUpdate = now;
        
        this.updateMana(deltaTime);
        this.updateTimers(deltaTime);
        this.updateSummons(deltaTime);
        this.processPlayerAction();
        this.processSummonActions(deltaTime);
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
    
    // ========== PUBLIC ABILITY METHODS ==========
    public castHolyStrike() {
        // Check if we can cast
        if (this.player.hp <= 0) return;
        if (this.globalCooldown > 0) return;
        if (this.player.mana < this.holyStrike.manaCost) {
            this.log(`Not enough mana! Need ${this.holyStrike.manaCost}, have ${this.player.mana}`, 'system');
            return;
        }
        const cooldown = this.abilityCooldowns.get(this.holyStrike.id) || 0;
        if (cooldown > 0) {
            this.log(`Holy Strike is on cooldown for ${(cooldown / 1000).toFixed(1)}s`, 'system');
            return;
        }
        
        // Cancel melee swing if in progress
        if (this.isSwinging) {
            this.cancelMeleeSwing();
        }
        
        // Flash the ability icon
        const icons = document.querySelectorAll('.ability-icon');
        icons.forEach(icon => {
            if (icon.querySelector('.ability-icon-content')?.textContent === 'H') {
                icon.classList.add('ability-activate');
                setTimeout(() => icon.classList.remove('ability-activate'), 400);
            }
        });
        
        // Cast the spell
        this.castInstantSpell(this.holyStrike);
    }
    
    public castSummonSkeleton() {
        // Check if we can cast
        if (this.player.hp <= 0) return;
        if (this.globalCooldown > 0) return;
        if (this.player.mana < this.summonSkeleton.manaCost) {
            this.log(`Not enough mana! Need ${this.summonSkeleton.manaCost}, have ${this.player.mana}`, 'system');
            return;
        }
        if (this.summons.length >= this.maxSummons) {
            this.log(`Cannot summon more skeletons! (Max: ${this.maxSummons})`, 'system');
            return;
        }
        
        // Cancel melee swing if in progress
        if (this.isSwinging) {
            this.cancelMeleeSwing();
        }
        
        // Flash the ability icon
        const icons = document.querySelectorAll('.ability-icon');
        icons.forEach(icon => {
            if (icon.querySelector('.ability-icon-content')?.textContent === '💀') {
                icon.classList.add('ability-activate');
                setTimeout(() => icon.classList.remove('ability-activate'), 400);
            }
        });
        
        // Cast the spell
        this.player.mana -= this.summonSkeleton.manaCost;
        this.globalCooldown = CONFIG.GLOBAL_COOLDOWN;
        
        // Create the summon with damage based on player's current melee damage (including equipment)
        const summonBaseDamage = Math.round(this.player.damage * this.summonSkeleton.summonDamageMultiplier);
        const newSummon: Summon = {
            name: 'Skeleton Minion',
            hp: ENEMIES.skeleton.hp,
            maxHp: ENEMIES.skeleton.hp,
            damage: summonBaseDamage,  // 75% of player damage
            attackSpeed: ENEMIES.skeleton.attackSpeed,
            attackTimer: 0,
            timeRemaining: this.summonSkeleton.duration,
            sprite: ENEMIES.skeleton.sprite,
            spriteColor: ENEMIES.skeleton.spriteColor
        };
        
        this.summons.push(newSummon);
        this.log(this.summonSkeleton.logMessage(this.player.name), this.summonSkeleton.logType);
        this.updateSummonSprites();
    }
    
    // ========== AURA MANAGEMENT ==========
    public toggleWindfuryAura() {
        if (this.activeAuras.has('windfury_aura')) {
            // Deactivate
            this.activeAuras.delete('windfury_aura');
            this.manaReserved = 0;
            this.player.maxMana = this.player.baseMana;
            // Restore mana if current mana would exceed new max
            if (this.player.mana > this.player.maxMana) {
                this.player.mana = this.player.maxMana;
            }
            this.log(this.windfuryAura.logMessage(this.player.name, false), this.windfuryAura.logType);
        } else {
            // Activate
            this.activeAuras.add('windfury_aura');
            this.manaReserved = this.windfuryAura.manaReserve;
            // Reduce max mana by reserved amount
            this.player.maxMana = Math.floor(this.player.baseMana * (1 - this.manaReserved));
            // Reduce current mana if it exceeds new max
            if (this.player.mana > this.player.maxMana) {
                this.player.mana = this.player.maxMana;
            }
            this.log(this.windfuryAura.logMessage(this.player.name, true), this.windfuryAura.logType);
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
    
    // ========== SUMMON MANAGEMENT ==========
    private updateSummons(deltaTime: number) {
        // Update summon timers and remove expired ones
        const previousCount = this.summons.length;
        this.summons = this.summons.filter(summon => {
            summon.timeRemaining -= deltaTime;
            
            if (summon.timeRemaining <= 0) {
                this.log(`${summon.name} crumbles to dust...`, 'system');
                return false;
            }
            
            if (summon.hp <= 0) {
                this.log(`${summon.name} has been destroyed!`, 'damage');
                return false;
            }
            
            return true;
        });
        
        // Update sprites if summon count changed
        if (this.summons.length !== previousCount) {
            this.updateSummonSprites();
        }
    }
    
    private updateSummonSprites() {
        const summonContainer = document.getElementById('summon-container');
        if (!summonContainer) return;
        
        // Clear existing sprites
        summonContainer.innerHTML = '';
        
        // Add sprites for each summon
        this.summons.forEach((summon, index) => {
            const summonDiv = document.createElement('div');
            summonDiv.className = 'summon-sprite';
            summonDiv.style.position = 'absolute';
            summonDiv.style.left = `${100 + index * 60}px`; // Stack them horizontally
            summonDiv.style.bottom = '50px';
            summonDiv.style.fontSize = '48px';
            summonDiv.style.color = summon.spriteColor || '#ff4444';
            summonDiv.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
            summonDiv.style.zIndex = '5';
            summonDiv.textContent = summon.sprite || 'S';
            
            // Add health bar
            const healthBar = document.createElement('div');
            healthBar.style.position = 'absolute';
            healthBar.style.bottom = '-10px';
            healthBar.style.left = '50%';
            healthBar.style.transform = 'translateX(-50%)';
            healthBar.style.width = '40px';
            healthBar.style.height = '4px';
            healthBar.style.background = '#333';
            healthBar.style.border = '1px solid #000';
            
            const healthFill = document.createElement('div');
            healthFill.style.width = `${(summon.hp / summon.maxHp) * 100}%`;
            healthFill.style.height = '100%';
            healthFill.style.background = '#ff4444';
            
            healthBar.appendChild(healthFill);
            summonDiv.appendChild(healthBar);
            summonContainer.appendChild(summonDiv);
        });
    }
    
    private processSummonActions(deltaTime: number) {
        if (this.enemy.hp <= 0) return;
        
        this.summons.forEach(summon => {
            summon.attackTimer += deltaTime;
            
            if (summon.attackTimer >= summon.attackSpeed) {
                // Calculate damage with variance
                const damage = this.calculateDamageWithVariance(summon.damage);
                
                // Summon attacks the enemy
                this.triggerAttackAnimation('summon');
                this.showDamageNumber(damage, 'physical', 'enemy');
                
                this.enemy.hp -= damage;
                this.log(`${summon.name} claws for ${damage} damage!`, 'melee');
                
                summon.attackTimer = 0;
            }
        });
        
        // Update health bars on summon sprites
        this.updateSummonHealthBars();
    }
    
    private updateSummonHealthBars() {
        const summonContainer = document.getElementById('summon-container');
        if (!summonContainer) return;
        
        const summonDivs = summonContainer.getElementsByClassName('summon-sprite');
        this.summons.forEach((summon, index) => {
            if (summonDivs[index]) {
                const healthFill = summonDivs[index].querySelector('div div') as HTMLElement;
                if (healthFill) {
                    healthFill.style.width = `${(summon.hp / summon.maxHp) * 100}%`;
                }
            }
        });
    }
    
    // ========== PLAYER COMBAT ==========
    private processPlayerAction() {
        if (this.player.hp <= 0 || this.globalCooldown > 0) return;
        
        // Evaluate combat rules in priority order
        const sortedRules = [...this.combatRules].sort((a, b) => a.priority - b.priority);
        
        for (const rule of sortedRules) {
            if (!rule.enabled) continue;
            
            if (this.checkSimpleRuleCondition(rule)) {
                this.executeAction(rule.action);
                break;  // Execute first matching rule
            }
        }
    }
    
    // Check simple rule conditions (for the UI)
    private checkSimpleRuleCondition(rule: any): boolean {
        const hpPercent = (this.player.hp / this.player.maxHp) * 100;
        
        switch (rule.conditionType) {
            case 'hp_below':
                // Also check if ability is available
                if (rule.action === 'holy_strike') {
                    const cooldown = this.abilityCooldowns.get(this.holyStrike.id) || 0;
                    const hasMana = this.player.mana >= this.holyStrike.manaCost;
                    return hpPercent < rule.conditionValue && cooldown <= 0 && hasMana;
                } else if (rule.action === 'summon_skeleton') {
                    const hasMana = this.player.mana >= this.summonSkeleton.manaCost;
                    const canSummon = this.summons.length < this.maxSummons;
                    return hpPercent < rule.conditionValue && hasMana && canSummon;
                } else if (rule.action === 'toggle_windfury') {
                    // Only suggest toggle if it would change state
                    const isActive = this.activeAuras.has('windfury_aura');
                    const shouldBeActive = hpPercent < rule.conditionValue;
                    return shouldBeActive !== isActive;
                }
                return hpPercent < rule.conditionValue;
            
            case 'hp_above':
                if (rule.action === 'holy_strike') {
                    const cooldown = this.abilityCooldowns.get(this.holyStrike.id) || 0;
                    const hasMana = this.player.mana >= this.holyStrike.manaCost;
                    return hpPercent >= rule.conditionValue && cooldown <= 0 && hasMana;
                } else if (rule.action === 'summon_skeleton') {
                    const hasMana = this.player.mana >= this.summonSkeleton.manaCost;
                    const canSummon = this.summons.length < this.maxSummons;
                    return hpPercent >= rule.conditionValue && hasMana && canSummon;
                } else if (rule.action === 'toggle_windfury') {
                    // Only suggest toggle if it would change state
                    const isActive = this.activeAuras.has('windfury_aura');
                    const shouldBeActive = hpPercent >= rule.conditionValue;
                    return shouldBeActive !== isActive;
                }
                return hpPercent >= rule.conditionValue;
            
            case 'always':
                if (rule.action === 'holy_strike') {
                    const cooldown = this.abilityCooldowns.get(this.holyStrike.id) || 0;
                    const hasMana = this.player.mana >= this.holyStrike.manaCost;
                    return cooldown <= 0 && hasMana;
                } else if (rule.action === 'summon_skeleton') {
                    const hasMana = this.player.mana >= this.summonSkeleton.manaCost;
                    const canSummon = this.summons.length < this.maxSummons;
                    return hasMana && canSummon;
                } else if (rule.action === 'toggle_windfury') {
                    // For 'always', only toggle if not already active
                    return !this.activeAuras.has('windfury_aura');
                }
                return true;
            
            default:
                return false;
        }
    }
    
    // Execute the chosen action
    private executeAction(action: string) {
        switch (action) {
            case 'holy_strike':
                if (this.isSwinging) {
                    this.cancelMeleeSwing();
                }
                this.castInstantSpell(this.holyStrike);
                break;
            
            case 'summon_skeleton':
                this.castSummonSkeleton();
                break;
            
            case 'melee':
                if (!this.isSwinging) {
                    this.startMeleeSwing();
                }
                break;
            
            case 'toggle_windfury':
                // Only toggle if it would change state (avoid spam)
                const shouldActivate = !this.activeAuras.has('windfury_aura');
                if (shouldActivate || this.activeAuras.has('windfury_aura')) {
                    this.toggleWindfuryAura();
                    // Add a small GCD to prevent toggle spam
                    this.globalCooldown = 500;
                }
                break;
            
            case 'none':
                // Do nothing - wait
                break;
            
            default:
                console.log('Unknown action:', action);
                break;
        }
    }
    
    // ========== COMBAT RULES UI SYSTEM ==========
    private loadCombatRules() {
        // Try to load from localStorage, otherwise use defaults
        const savedRules = localStorage.getItem('combatRules');
        if (savedRules) {
            this.combatRules = JSON.parse(savedRules);
        } else {
            // Default rules
            this.combatRules = [
                {
                    id: 'rule_1',
                    priority: 1,
                    conditionType: 'hp_below',
                    conditionValue: 75,
                    action: 'holy_strike',
                    enabled: true
                },
                {
                    id: 'rule_2',
                    priority: 2,
                    conditionType: 'always',
                    conditionValue: 0,
                    action: 'melee',
                    enabled: true
                }
            ];
            this.saveCombatRules();
        }
    }
    
    private saveCombatRules() {
        localStorage.setItem('combatRules', JSON.stringify(this.combatRules));
    }
    
    private initializeUI() {
        this.renderRules();
        this.createInventoryUI();
        this.createShopUI();
        
        // Add event listener for add rule button
        const addBtn = document.getElementById('add-rule-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.addNewRule());
        }
        
        // Add keyboard shortcuts for abilities
        document.addEventListener('keydown', (e) => {
            // Prevent shortcuts when typing in inputs
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            
            switch(e.key) {
                case '1':
                    e.preventDefault();
                    this.castHolyStrike();
                    break;
                case '2':
                    e.preventDefault();
                    this.toggleWindfuryAura();
                    break;
                case '3':
                    e.preventDefault();
                    this.castSummonSkeleton();
                    break;
                case 'i':
                case 'I':
                    e.preventDefault();
                    this.toggleInventory();
                    break;
                case 's':
                case 'S':
                    e.preventDefault();
                    this.toggleShop();
                    break;
            }
        });
    }
    
    // ========== SHOP UI ==========
    private createShopUI() {
        // Create shop button
        const shopBtn = document.createElement('button');
        shopBtn.id = 'shop-button';
        shopBtn.innerHTML = `Shop [S]`;
        shopBtn.style.cssText = `
            position: absolute;
            top: 10px;
            right: calc(50% - 280px);
            padding: 8px 15px;
            background: #2a2a2a;
            border: 2px solid #444;
            color: #d4d4d8;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            z-index: 100;
        `;
        shopBtn.onclick = () => this.toggleShop();
        
        // Create shop panel (hidden by default)
        const shopPanel = document.createElement('div');
        shopPanel.id = 'shop-panel';
        shopPanel.style.cssText = `
            position: absolute;
            top: 50px;
            right: calc(50% - 280px);
            width: 300px;
            background: #1a1a1a;
            border: 2px solid #444;
            padding: 10px;
            display: none;
            z-index: 100;
        `;
        
        document.body.appendChild(shopBtn);
        document.body.appendChild(shopPanel);
        
        this.updateShopUI();
    }
    
    public toggleShop() {
        this.shopOpen = !this.shopOpen;
        const panel = document.getElementById('shop-panel');
        if (panel) {
            panel.style.display = this.shopOpen ? 'block' : 'none';
        }
        // Close inventory if shop opens
        if (this.shopOpen && this.inventoryOpen) {
            this.toggleInventory();
        }
        if (this.shopOpen) {
            this.updateShopUI();
        }
    }
    
    private updateShopUI() {
        const panel = document.getElementById('shop-panel');
        if (!panel) return;
        
        let html = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="color: #d4d4d8; margin: 0;">Shop</h3>
            <div style="color: #ffd93d; font-weight: bold;">Gold: ${this.player.gold}</div>
        </div>`;
        
        html += '<div style="border-top: 1px solid #444; padding-top: 10px;">';
        
        // Weapon
        html += `
            <div style="padding: 8px; border: 1px solid #333; margin-bottom: 5px; background: #222;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="color: #d4d4d8; font-weight: bold;">Rusty Sword</div>
                        <div style="color: #888; font-size: 12px;">+2 damage</div>
                    </div>
                    <button onclick="window.game.buyFromShop('weapon')" 
                            style="padding: 4px 10px; background: ${this.player.gold >= 25 ? '#4a3a00' : '#333'}; 
                                   border: 1px solid ${this.player.gold >= 25 ? '#ffd93d' : '#666'}; 
                                   color: ${this.player.gold >= 25 ? '#ffd93d' : '#666'}; 
                                   cursor: ${this.player.gold >= 25 ? 'pointer' : 'not-allowed'};">
                        Buy (25g)
                    </button>
                </div>
            </div>
        `;
        
        // Armor
        html += `
            <div style="padding: 8px; border: 1px solid #333; margin-bottom: 5px; background: #222;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="color: #d4d4d8; font-weight: bold;">Leather Armor</div>
                        <div style="color: #888; font-size: 12px;">+2 armor, +1 mana/s</div>
                    </div>
                    <button onclick="window.game.buyFromShop('armor')" 
                            style="padding: 4px 10px; background: ${this.player.gold >= 35 ? '#4a3a00' : '#333'}; 
                                   border: 1px solid ${this.player.gold >= 35 ? '#ffd93d' : '#666'}; 
                                   color: ${this.player.gold >= 35 ? '#ffd93d' : '#666'}; 
                                   cursor: ${this.player.gold >= 35 ? 'pointer' : 'not-allowed'};">
                        Buy (35g)
                    </button>
                </div>
            </div>
        `;
        
        // Divider for potions
        html += '<div style="color: #888; margin: 10px 0; text-align: center;">— Consumables —</div>';
        
        // Health Potion
        html += `
            <div style="padding: 8px; border: 1px solid #333; margin-bottom: 5px; background: #222;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="color: #ff6b6b; font-weight: bold;">Health Potion</div>
                        <div style="color: #888; font-size: 12px;">Restores 75 HP</div>
                    </div>
                    <button onclick="window.game.buyFromShop('health_potion')" 
                            style="padding: 4px 10px; background: ${this.player.gold >= 20 ? '#4a3a00' : '#333'}; 
                                   border: 1px solid ${this.player.gold >= 20 ? '#ffd93d' : '#666'}; 
                                   color: ${this.player.gold >= 20 ? '#ffd93d' : '#666'}; 
                                   cursor: ${this.player.gold >= 20 ? 'pointer' : 'not-allowed'};">
                        Buy (20g)
                    </button>
                </div>
            </div>
        `;
        
        // Mana Potion
        html += `
            <div style="padding: 8px; border: 1px solid #333; margin-bottom: 5px; background: #222;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="color: #339af0; font-weight: bold;">Mana Potion</div>
                        <div style="color: #888; font-size: 12px;">Restores 100 mana</div>
                    </div>
                    <button onclick="window.game.buyFromShop('mana_potion')" 
                            style="padding: 4px 10px; background: ${this.player.gold >= 10 ? '#4a3a00' : '#333'}; 
                                   border: 1px solid ${this.player.gold >= 10 ? '#ffd93d' : '#666'}; 
                                   color: ${this.player.gold >= 10 ? '#ffd93d' : '#666'}; 
                                   cursor: ${this.player.gold >= 10 ? 'pointer' : 'not-allowed'};">
                        Buy (10g)
                    </button>
                </div>
            </div>
        `;
        
        html += '</div>';
        
        panel.innerHTML = html;
    }
    
    // ========== INVENTORY UI ==========
    private createInventoryUI() {
        // Create inventory container
        const inventoryContainer = document.createElement('div');
        inventoryContainer.id = 'inventory-container';
        inventoryContainer.style.cssText = `
            position: absolute;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 100;
        `;
        
        // Create inventory button
        const inventoryBtn = document.createElement('button');
        inventoryBtn.id = 'inventory-button';
        inventoryBtn.innerHTML = `Inventory (${this.inventory.length}/${this.maxInventorySize}) [I]`;
        inventoryBtn.style.cssText = `
            padding: 8px 15px;
            background: #2a2a2a;
            border: 2px solid #444;
            color: #d4d4d8;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
        `;
        inventoryBtn.onclick = () => this.toggleInventory();
        
        // Create inventory panel (hidden by default)
        const inventoryPanel = document.createElement('div');
        inventoryPanel.id = 'inventory-panel';
        inventoryPanel.style.cssText = `
            position: absolute;
            top: 40px;
            left: 50%;
            transform: translateX(-50%);
            width: 400px;
            background: #1a1a1a;
            border: 2px solid #444;
            padding: 10px;
            display: none;
            max-height: 500px;
            overflow-y: auto;
        `;
        
        inventoryContainer.appendChild(inventoryBtn);
        inventoryContainer.appendChild(inventoryPanel);
        document.body.appendChild(inventoryContainer);
        
        this.updateInventoryUI();
    }
    
    public toggleInventory() {
        this.inventoryOpen = !this.inventoryOpen;
        const panel = document.getElementById('inventory-panel');
        if (panel) {
            panel.style.display = this.inventoryOpen ? 'block' : 'none';
        }
        // Close shop if inventory opens
        if (this.inventoryOpen && this.shopOpen) {
            this.toggleShop();
        }
        if (this.inventoryOpen) {
            this.updateInventoryUI();
        }
    }
    
    private updateInventoryUI() {
        const panel = document.getElementById('inventory-panel');
        const button = document.getElementById('inventory-button');
        
        if (button) {
            button.innerHTML = `Inventory (${this.inventory.length}/${this.maxInventorySize}) [I]`;
        }
        
        if (!panel) return;
        
        let html = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="color: #d4d4d8; margin: 0;">Equipment</h3>
            <div style="color: #ffd93d; font-weight: bold;">Gold: ${this.player.gold}</div>
        </div>`;
        
        // Show equipped items
        const weapon = this.equipment.get('weapon');
        const armor = this.equipment.get('armor');
        
        html += '<div style="margin-bottom: 15px;">';
        html += `<div style="padding: 5px; border: 1px solid #333; margin-bottom: 5px;">`;
        html += `<strong>Weapon:</strong> ${weapon ? `${weapon.name} (+${weapon.damage} damage) [Value: ${weapon.sellValue}g]` : 'Empty'}`;
        if (weapon) {
            html += ` <button onclick="window.game.unequipItem('weapon')" style="margin-left: 10px; padding: 2px 8px; background: #444; border: 1px solid #666; color: #d4d4d8; cursor: pointer;">Unequip</button>`;
        }
        html += '</div>';
        
        html += `<div style="padding: 5px; border: 1px solid #333;">`;
        html += `<strong>Armor:</strong> ${armor ? `${armor.name} (+${armor.armor} armor, +${armor.manaRegen} mana/s) [Value: ${armor.sellValue}g]` : 'Empty'}`;
        if (armor) {
            html += ` <button onclick="window.game.unequipItem('armor')" style="margin-left: 10px; padding: 2px 8px; background: #444; border: 1px solid #666; color: #d4d4d8; cursor: pointer;">Unequip</button>`;
        }
        html += '</div>';
        html += '</div>';
        
        html += '<h3 style="color: #d4d4d8; margin: 10px 0;">Inventory</h3>';
        
        if (this.inventory.length === 0) {
            html += '<div style="color: #888;">No items in inventory</div>';
        } else {
            html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">';
            
            // Show unequipped items only
            const unequippedItems = this.inventory.filter(item => !item.equipped);
            
            unequippedItems.forEach(item => {
                let itemStats = '';
                if (item.damage) itemStats += `+${item.damage} dmg`;
                if (item.armor) itemStats += `+${item.armor} armor`;
                if (item.manaRegen) itemStats += ` +${item.manaRegen} mana/s`;
                if (item.healing) itemStats += `Restores ${item.healing} HP`;
                if (item.manaRestore) itemStats += `Restores ${item.manaRestore} mana`;
                
                // Add quantity for stackable items
                const itemName = item.quantity && item.quantity > 1 ? `${item.name} (${item.quantity})` : item.name;
                
                // Color code potions
                let nameColor = '#d4d4d8';
                if (item.name === 'Health Potion') nameColor = '#ff6b6b';
                if (item.name === 'Mana Potion') nameColor = '#339af0';
                
                html += `
                    <div style="padding: 5px; border: 1px solid #333; background: #222;">
                        <div style="color: ${nameColor}; font-weight: bold;">${itemName}</div>
                        <div style="color: #888; font-size: 12px;">${item.slot} - ${itemStats}</div>
                        <div style="color: #ffd93d; font-size: 12px;">Sell: ${item.sellValue} gold</div>
                        <div style="display: flex; gap: 5px; margin-top: 5px;">
                `;
                
                if (item.slot === 'consumable') {
                    html += `
                        <button onclick="window.game.usePotion('${item.id}')" style="padding: 2px 8px; background: #2a3a4a; border: 1px solid #4a9eff; color: #4a9eff; cursor: pointer; flex: 1;">Use</button>
                        <button onclick="window.game.sellItem('${item.id}')" style="padding: 2px 8px; background: #4a3a00; border: 1px solid #ffd93d; color: #ffd93d; cursor: pointer; flex: 1;">Sell</button>
                    `;
                } else {
                    html += `
                        <button onclick="window.game.equipItem('${item.id}')" style="padding: 2px 8px; background: #2a4a2a; border: 1px solid #51cf66; color: #51cf66; cursor: pointer; flex: 1;">Equip</button>
                        <button onclick="window.game.sellItem('${item.id}')" style="padding: 2px 8px; background: #4a3a00; border: 1px solid #ffd93d; color: #ffd93d; cursor: pointer; flex: 1;">Sell</button>
                    `;
                }
                
                html += `
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
        }
        
        panel.innerHTML = html;
    }
    
    private renderRules() {
        const rulesList = document.getElementById('rules-list');
        if (!rulesList) return;
        
        rulesList.innerHTML = '';
        
        // Sort by priority
        const sortedRules = [...this.combatRules].sort((a, b) => a.priority - b.priority);
        
        sortedRules.forEach((rule, index) => {
            const ruleDiv = document.createElement('div');
            ruleDiv.className = 'ai-rule';
            
            // Priority number
            const priority = document.createElement('span');
            priority.className = 'rule-priority';
            priority.textContent = `${rule.priority}.`;
            ruleDiv.appendChild(priority);
            
            // Up/Down controls
            const controls = document.createElement('div');
            controls.className = 'rule-controls';
            
            if (index > 0) {
                const upBtn = document.createElement('button');
                upBtn.textContent = '↑';
                upBtn.onclick = () => this.moveRule(rule.id, 'up');
                controls.appendChild(upBtn);
            }
            
            if (index < sortedRules.length - 1) {
                const downBtn = document.createElement('button');
                downBtn.textContent = '↓';
                downBtn.onclick = () => this.moveRule(rule.id, 'down');
                controls.appendChild(downBtn);
            }
            
            ruleDiv.appendChild(controls);
            
            // Rule content
            const content = document.createElement('div');
            content.className = 'rule-content';
            
            if (rule.conditionType === 'hp_below') {
                content.innerHTML = `
                    When HP < 
                    <input type="number" value="${rule.conditionValue}" 
                           onchange="window.game.updateRuleValue('${rule.id}', 'conditionValue', this.value)">
                    % → Use 
                    <select onchange="window.game.updateRuleValue('${rule.id}', 'action', this.value)">
                        <option value="holy_strike" ${rule.action === 'holy_strike' ? 'selected' : ''}>Holy Strike</option>
                        <option value="summon_skeleton" ${rule.action === 'summon_skeleton' ? 'selected' : ''}>Summon Skeleton</option>
                        <option value="melee" ${rule.action === 'melee' ? 'selected' : ''}>Melee</option>
                        <option value="toggle_windfury" ${rule.action === 'toggle_windfury' ? 'selected' : ''}>Toggle Windfury</option>
                        <option value="none" ${rule.action === 'none' ? 'selected' : ''}>Do Nothing</option>
                    </select>
                `;
            } else if (rule.conditionType === 'hp_above') {
                content.innerHTML = `
                    When HP ≥ 
                    <input type="number" value="${rule.conditionValue}" 
                           onchange="window.game.updateRuleValue('${rule.id}', 'conditionValue', this.value)">
                    % → Use 
                    <select onchange="window.game.updateRuleValue('${rule.id}', 'action', this.value)">
                        <option value="holy_strike" ${rule.action === 'holy_strike' ? 'selected' : ''}>Holy Strike</option>
                        <option value="summon_skeleton" ${rule.action === 'summon_skeleton' ? 'selected' : ''}>Summon Skeleton</option>
                        <option value="melee" ${rule.action === 'melee' ? 'selected' : ''}>Melee</option>
                        <option value="toggle_windfury" ${rule.action === 'toggle_windfury' ? 'selected' : ''}>Toggle Windfury</option>
                        <option value="none" ${rule.action === 'none' ? 'selected' : ''}>Do Nothing</option>
                    </select>
                `;
            } else {
                content.innerHTML = `
                    Always → Use 
                    <select onchange="window.game.updateRuleValue('${rule.id}', 'action', this.value)">
                        <option value="holy_strike" ${rule.action === 'holy_strike' ? 'selected' : ''}>Holy Strike</option>
                        <option value="summon_skeleton" ${rule.action === 'summon_skeleton' ? 'selected' : ''}>Summon Skeleton</option>
                        <option value="melee" ${rule.action === 'melee' ? 'selected' : ''}>Melee</option>
                        <option value="toggle_windfury" ${rule.action === 'toggle_windfury' ? 'selected' : ''}>Toggle Windfury</option>
                        <option value="none" ${rule.action === 'none' ? 'selected' : ''}>Do Nothing</option>
                    </select>
                `;
            }
            
            ruleDiv.appendChild(content);
            
            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'rule-delete';
            deleteBtn.textContent = 'X';
            deleteBtn.onclick = () => this.deleteRule(rule.id);
            ruleDiv.appendChild(deleteBtn);
            
            rulesList.appendChild(ruleDiv);
        });
    }
    
    public updateRuleValue(ruleId: string, field: string, value: any) {
        const rule = this.combatRules.find(r => r.id === ruleId);
        if (rule) {
            if (field === 'conditionValue') {
                rule[field] = parseInt(value);
            } else {
                rule[field] = value;
            }
            this.saveCombatRules();
            // Re-render to update any dependent UI
            this.renderRules();
        }
    }
    
    private moveRule(ruleId: string, direction: 'up' | 'down') {
        const rule = this.combatRules.find(r => r.id === ruleId);
        if (!rule) return;
        
        const sortedRules = [...this.combatRules].sort((a, b) => a.priority - b.priority);
        const currentIndex = sortedRules.findIndex(r => r.id === ruleId);
        
        if (direction === 'up' && currentIndex > 0) {
            // Swap priorities with previous rule
            const prevRule = sortedRules[currentIndex - 1];
            const tempPriority = rule.priority;
            rule.priority = prevRule.priority;
            prevRule.priority = tempPriority;
        } else if (direction === 'down' && currentIndex < sortedRules.length - 1) {
            // Swap priorities with next rule
            const nextRule = sortedRules[currentIndex + 1];
            const tempPriority = rule.priority;
            rule.priority = nextRule.priority;
            nextRule.priority = tempPriority;
        }
        
        this.saveCombatRules();
        this.renderRules();
    }
    
    private deleteRule(ruleId: string) {
        this.combatRules = this.combatRules.filter(r => r.id !== ruleId);
        // Reorder priorities
        this.combatRules.sort((a, b) => a.priority - b.priority);
        this.combatRules.forEach((rule, index) => {
            rule.priority = index + 1;
        });
        this.saveCombatRules();
        this.renderRules();
    }
    
    private addNewRule() {
        const newId = 'rule_' + Date.now();
        const newPriority = this.combatRules.length + 1;
        
        // Create a simple modal/prompt for condition type
        const conditionType = prompt('Rule condition type: hp_below, hp_above, or always', 'hp_below');
        if (!conditionType || !['hp_below', 'hp_above', 'always'].includes(conditionType)) {
            return; // Cancel if invalid
        }
        
        this.combatRules.push({
            id: newId,
            priority: newPriority,
            conditionType: conditionType,
            conditionValue: conditionType === 'always' ? 0 : 50,
            action: 'melee',
            enabled: true
        });
        
        this.saveCombatRules();
        this.renderRules();
    }
    
    // Old methods kept for reference (will be removed later)
    private checkRuleConditions(conditions: any[]): boolean {
        if (conditions.length === 0) return true;
        for (const condition of conditions) {
            if (!this.checkSingleCondition(condition)) {
                return false;
            }
        }
        return true;
    }
    
    private checkSingleCondition(condition: any): boolean {
        switch (condition.type) {
            case 'hp_below_percent':
                return (this.player.hp / this.player.maxHp * 100) < condition.value;
            case 'hp_above_percent':
                return (this.player.hp / this.player.maxHp * 100) >= condition.value;
            case 'mana_below_percent':
                return (this.player.mana / this.player.maxMana * 100) < condition.value;
            case 'mana_above_percent':
                return (this.player.mana / this.player.maxMana * 100) >= condition.value;
            case 'cooldown_ready':
                const cooldown = this.abilityCooldowns.get(condition.ability) || 0;
                return cooldown <= 0;
            case 'has_mana':
                if (condition.ability === 'holy_strike') {
                    return this.player.mana >= this.holyStrike.manaCost;
                }
                return false;
            case 'enemy_hp_below_percent':
                return (this.enemy.hp / this.enemy.maxHp * 100) < condition.value;
            case 'enemy_hp_above_percent':
                return (this.enemy.hp / this.enemy.maxHp * 100) >= condition.value;
            default:
                return false;
        }
    }
    
    private startMeleeSwing() {
        this.isSwinging = true;
        this.currentSwingTime = PLAYER_CONFIG.MELEE_SWING_TIME;
        this.log(`${this.player.name} begins swinging their mace...`, 'system');
    }
    
    private completeMeleeSwing() {
        this.isSwinging = false;
        
        // Calculate damage with variance
        const damage = this.calculateDamageWithVariance(this.player.damage);
        
        // Visual effects
        this.triggerAttackAnimation('player');
        this.showDamageNumber(damage, 'physical', 'enemy');
        
        this.enemy.hp -= damage;
        this.log(
            `${this.player.name} strikes with their mace for ${damage} damage!`,
            'melee'
        );
        
        // Check for Windfury proc
        if (this.activeAuras.has('windfury_aura')) {
            const roll = Math.random();
            if (roll < this.windfuryAura.windfuryChance) {
                this.log(`⚡ Windfury triggers on melee attack!`, 'system');
                
                // Perform extra attacks with variance
                for (let i = 0; i < this.windfuryAura.windfuryAttacks; i++) {
                    setTimeout(() => {
                        const windfuryDamage = this.calculateDamageWithVariance(this.player.damage);
                        this.triggerAttackAnimation('player');
                        this.showDamageNumber(windfuryDamage, 'physical', 'enemy');
                        this.enemy.hp -= windfuryDamage;
                        this.log(
                            `⚡ Windfury strike for ${windfuryDamage} damage!`,
                            'melee'
                        );
                    }, 100 * (i + 1));  // Stagger the extra attacks
                }
            }
        }
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
        
        // Calculate base melee damage for abilities that scale off it
        const baseMeleeDamage = this.calculateDamageWithVariance(this.player.damage);
        
        // Execute the ability and get the damage dealt
        const damageDealt = ability.execute(this.player, this.enemy, baseMeleeDamage);
        
        // Visual effects
        this.triggerAttackAnimation('player');
        if (damageDealt && typeof damageDealt === 'number') {
            this.showDamageNumber(damageDealt, ability.damageType, 'enemy');
        }
        
        // Check for Windfury proc on Holy Strike (it's still a melee attack)
        if (ability.id === 'holy_strike' && this.activeAuras.has('windfury_aura')) {
            const roll = Math.random();
            if (roll < this.windfuryAura.windfuryChance) {
                this.log(`⚡ Windfury triggers on Holy Strike!`, 'system');
                
                // Perform extra Holy Strikes with new damage rolls
                for (let i = 0; i < this.windfuryAura.windfuryAttacks; i++) {
                    setTimeout(() => {
                        // Calculate new damage for each Windfury proc
                        const windfuryMeleeDamage = this.calculateDamageWithVariance(this.player.damage);
                        const windfuryHolyDamage = Math.round(windfuryMeleeDamage * ABILITIES.holyStrike.damageMultiplier);
                        
                        this.triggerAttackAnimation('player');
                        this.showDamageNumber(windfuryHolyDamage, ability.damageType, 'enemy');
                        
                        // Apply damage
                        this.enemy.hp -= windfuryHolyDamage;
                        this.log(`⚡ Windfury Holy Strike for ${windfuryHolyDamage} damage!`, 'player-magic');
                        
                        // Apply healing if it has healOnDamage
                        if (ability.healOnDamage) {
                            const oldHp = this.player.hp;
                            this.player.hp = Math.min(this.player.hp + windfuryHolyDamage, this.player.maxHp);
                            const actualHeal = this.player.hp - oldHp;
                            if (actualHeal > 0) {
                                // Show heal splat on player after a slight delay
                                setTimeout(() => {
                                    this.showDamageNumber(actualHeal, 'healing', 'player');
                                }, 150);
                                this.log(`${this.player.name} healed for ${actualHeal} HP!`, 'heal');
                            }
                        }
                    }, 100 * (i + 1));  // Stagger the extra attacks
                }
            }
        }
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
        // Calculate damage with variance
        const baseDamage = this.calculateDamageWithVariance(this.enemy.damage);
        
        // Enemy has a chance to attack summons if they exist
        if (this.summons.length > 0 && Math.random() < 0.3) {
            // 30% chance to attack a random summon
            const targetSummon = this.summons[Math.floor(Math.random() * this.summons.length)];
            
            // Summons don't have armor
            this.triggerAttackAnimation('enemy');
            this.showDamageNumber(baseDamage, 'enemy', 'player');
            
            targetSummon.hp -= baseDamage;
            this.log(
                `${this.enemy.name} attacks ${targetSummon.name} for ${baseDamage} damage!`,
                'damage'
            );
            
            // Update summon health bars immediately
            this.updateSummonHealthBars();
        } else {
            // Attack the player - apply armor reduction
            const damageAfterArmor = Math.max(1, baseDamage - this.player.armor); // Minimum 1 damage
            
            this.triggerAttackAnimation('enemy');
            this.showDamageNumber(damageAfterArmor, 'enemy', 'player');
            
            this.player.hp -= damageAfterArmor;
            
            if (this.player.armor > 0) {
                this.log(
                    `${this.enemy.name} slashes for ${baseDamage} damage (${damageAfterArmor} after ${this.player.armor} armor)`,
                    'damage'
                );
            } else {
                this.log(
                    `${this.enemy.name} slashes for ${damageAfterArmor} damage!`,
                    'damage'
                );
            }
        }
    }
    
    // ========== COMBAT END CONDITIONS ==========
    private checkCombatEnd() {
        if (this.enemy.hp <= 0) {
            this.log(`${this.enemy.name} defeated!`, 'system');
            
            // Gold drop (2-5 gold per enemy, small chance for bonus)
            let goldDrop = Math.floor(Math.random() * 4) + 2;
            
            // 10% chance for bonus gold
            if (Math.random() < 0.1) {
                const bonus = Math.floor(Math.random() * 10) + 5; // 5-14 bonus
                goldDrop += bonus;
                this.log(`Found ${goldDrop} gold! (Bonus gold!)`, 'loot');
            } else {
                this.log(`Found ${goldDrop} gold!`, 'loot');
            }
            
            this.player.gold += goldDrop;
            
            // Check for item drop
            const drop = this.generateItemDrop();
            if (drop) {
                this.addToInventory(drop);
            }
            
            this.enemy = this.createEnemy(this.currentEnemyType);
            this.enemyAttackTimer = 0;
            this.log(`New ${this.enemy.name} appears!`, 'system');
        }
        
        if (this.player.hp <= 0) {
            this.log(`${this.player.name} has been defeated!`, 'damage');
            const goldLost = Math.floor(this.player.gold * 0.1); // Lose 10% of gold on death
            if (goldLost > 0) {
                this.player.gold -= goldLost;
                this.log(`Lost ${goldLost} gold!`, 'system');
            }
            this.player.hp = this.player.maxHp;
            // Respect mana reservation when respawning
            if (this.activeAuras.has('windfury_aura')) {
                this.player.mana = this.player.maxMana;  // Max is already reduced by reservation
            } else {
                this.player.mana = this.player.maxMana;
            }
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
        this.updateSummonHealthBars();
    }
    
    private updateStats() {
        const playerStats = document.getElementById('player-stats');
        const enemyStats = document.getElementById('enemy-stats');
        
        if (playerStats) {
            let playerStatus = 'Ready';
            if (this.player.hp <= 0) {
                playerStatus = 'Dead';
            } else if (this.isSwinging) {
                const swingTimeLeft = (this.currentSwingTime / 1000).toFixed(1);
                playerStatus = `Swinging: ${swingTimeLeft}s`;
            } else if (this.globalCooldown > 0) {
                playerStatus = `GCD: ${(this.globalCooldown / 1000).toFixed(1)}s`;
            }
            
            // Create ability cooldown display
            const holyStrikeCooldown = this.abilityCooldowns.get(this.holyStrike.id) || 0;
            const maxCooldown = this.holyStrike.cooldown || 6000;
            const cooldownPercent = holyStrikeCooldown > 0 ? ((maxCooldown - holyStrikeCooldown) / maxCooldown) * 100 : 0;
            const isOnCooldown = holyStrikeCooldown > 0;
            const windfuryActive = this.activeAuras.has('windfury_aura');
            
            // Check if Holy Strike can be cast
            const holyStrikeMana = this.player.mana >= this.holyStrike.manaCost;
            const canCastHolyStrike = holyStrikeMana && !isOnCooldown && this.globalCooldown <= 0 && this.player.hp > 0;
            
            let holyStrikeIcon = '';
            const minMeleeDamage = Math.round(this.player.damage * CONFIG.DAMAGE_VARIANCE_MIN);
            const maxMeleeDamage = Math.round(this.player.damage * CONFIG.DAMAGE_VARIANCE_MAX);
            const minHolyDamage = Math.round(minMeleeDamage * ABILITIES.holyStrike.damageMultiplier);
            const maxHolyDamage = Math.round(maxMeleeDamage * ABILITIES.holyStrike.damageMultiplier);
            const holyStrikeTooltip = `Holy Strike [1]&#10;Mana Cost: 25&#10;Cooldown: 6s&#10;Damage: ${minHolyDamage}-${maxHolyDamage} holy&#10;Heals you for damage dealt${windfuryActive ? '&#10;Can trigger Windfury!' : ''}&#10;&#10;Click or press 1 to cast`;
            
            if (isOnCooldown) {
                holyStrikeIcon = `
                    <div class="ability-icon${!canCastHolyStrike ? ' disabled' : ''}" 
                         data-tooltip="${holyStrikeTooltip}"
                         onclick="window.game.castHolyStrike()"
                         style="cursor: ${canCastHolyStrike ? 'pointer' : 'not-allowed'};">
                        <div class="ability-icon-content">H</div>
                        <div class="cooldown-overlay"></div>
                        <div class="cooldown-sweep" style="background: conic-gradient(transparent ${cooldownPercent}%, rgba(255, 255, 255, 0.3) ${cooldownPercent}%);"></div>
                        <div class="cooldown-text">${(holyStrikeCooldown / 1000).toFixed(1)}</div>
                        <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); font-size: 10px; color: #666; font-weight: bold;">1</div>
                    </div>
                `;
            } else {
                holyStrikeIcon = `
                    <div class="ability-icon${canCastHolyStrike ? ' ability-ready' : ' disabled'}" 
                         data-tooltip="${holyStrikeTooltip}"
                         onclick="window.game.castHolyStrike()"
                         style="cursor: ${canCastHolyStrike ? 'pointer' : 'not-allowed'};">
                        <div class="ability-icon-content"${!holyStrikeMana ? ' style="color: #666;"' : ''}>H</div>
                        <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); font-size: 10px; color: #666; font-weight: bold;">1</div>
                    </div>
                `;
            }
            
            // Windfury Aura toggle
            const windfuryTooltip = `Windfury Aura [2]&#10;Reserves: 50% of max mana&#10;Effect: 20% chance for 2 extra attacks&#10;Works on melee AND Holy Strike!&#10;${windfuryActive ? 'ACTIVE - Click or press 2 to deactivate' : 'Click or press 2 to activate'}`;
            
            const windfuryIcon = windfuryActive ? `
                <div class="ability-icon aura-active" 
                     onclick="window.game.toggleWindfuryAura()" 
                     style="cursor: pointer; background: #2a4a2a; border-color: #51cf66;" 
                     data-tooltip="${windfuryTooltip}">
                    <div class="ability-icon-content" style="color: #51cf66;">W</div>
                    <div class="aura-indicator" style="position: absolute; top: -5px; right: -5px; width: 10px; height: 10px; background: #51cf66; border-radius: 50%; box-shadow: 0 0 5px #51cf66;"></div>
                    <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); font-size: 10px; color: #666; font-weight: bold;">2</div>
                </div>
            ` : `
                <div class="ability-icon" 
                     onclick="window.game.toggleWindfuryAura()" 
                     style="cursor: pointer;" 
                     data-tooltip="${windfuryTooltip}">
                    <div class="ability-icon-content">W</div>
                    <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); font-size: 10px; color: #666; font-weight: bold;">2</div>
                </div>
            `;
            
            // Summon Skeleton ability
            const canSummon = this.summons.length < this.maxSummons;
            const summonMana = this.player.mana >= this.summonSkeleton.manaCost;
            const canCastSummon = summonMana && canSummon && this.globalCooldown <= 0 && this.player.hp > 0;
            
            const summonBaseDamage = Math.round(this.player.damage * this.summonSkeleton.summonDamageMultiplier);
            const minDamage = Math.round(summonBaseDamage * CONFIG.DAMAGE_VARIANCE_MIN);
            const maxDamage = Math.round(summonBaseDamage * CONFIG.DAMAGE_VARIANCE_MAX);
            const summonTooltip = `Summon Skeleton [3]&#10;Mana Cost: 50&#10;Duration: 30s&#10;Damage: ${minDamage}-${maxDamage} per attack&#10;HP: ${ENEMIES.skeleton.hp}&#10;Max Summons: ${this.maxSummons}&#10;Current: ${this.summons.length}/${this.maxSummons}&#10;&#10;Click or press 3 to summon`;
            
            const summonIcon = `
                <div class="ability-icon${canCastSummon ? ' ability-ready' : ' disabled'}" 
                     data-tooltip="${summonTooltip}"
                     onclick="window.game.castSummonSkeleton()"
                     style="cursor: ${canCastSummon ? 'pointer' : 'not-allowed'};">
                    <div class="ability-icon-content"${!summonMana || !canSummon ? ' style="color: #666;"' : ''}>💀</div>
                    <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); font-size: 10px; color: #666; font-weight: bold;">3</div>
                </div>
            `;
            
            let abilityDisplay = `
                <div class="ability-cooldowns">
                    ${holyStrikeIcon}
                    ${windfuryIcon}
                    ${summonIcon}
                </div>
            `;
            
            const manaReservedText = windfuryActive ? ` (${Math.floor(this.player.baseMana * 0.5)} reserved)` : '';
            
            // Create summons display
            let summonsDisplay = '';
            if (this.summons.length > 0) {
                summonsDisplay = '<div style="margin-top: 10px; padding: 5px; border: 1px solid #333; background: #1a1a1a;"><strong>Active Summons:</strong>';
                this.summons.forEach((summon, index) => {
                    const timeLeft = (summon.timeRemaining / 1000).toFixed(0);
                    const summonMinDmg = Math.round(summon.damage * CONFIG.DAMAGE_VARIANCE_MIN);
                    const summonMaxDmg = Math.round(summon.damage * CONFIG.DAMAGE_VARIANCE_MAX);
                    summonsDisplay += `<div style="color: #d4d4d8;">💀 ${summon.name} #${index + 1} - HP: ${summon.hp}/${summon.maxHp} - Dmg: ${summonMinDmg}-${summonMaxDmg} - Time: ${timeLeft}s</div>`;
                });
                summonsDisplay += '</div>';
            }
            
            const playerMinDamage = Math.round(this.player.damage * CONFIG.DAMAGE_VARIANCE_MIN);
            const playerMaxDamage = Math.round(this.player.damage * CONFIG.DAMAGE_VARIANCE_MAX);
            
            playerStats.innerHTML = `
                <div><strong>Cleric</strong></div>
                <div style="color: #ffd93d; font-weight: bold;">Gold: ${this.player.gold}</div>
                <div>HP: ${this.player.hp}/${this.player.maxHp} (${(this.player.hp / this.player.maxHp * 100).toFixed(0)}%)</div>
                <div>Mana: ${this.player.mana}/${this.player.maxMana}${manaReservedText} (Regen: ${this.player.manaRegen}/s)</div>
                <div>Damage: ${playerMinDamage}-${playerMaxDamage}</div>
                <div>Armor: ${this.player.armor} (reduces damage taken)</div>
                <div>Status: ${playerStatus}</div>
                ${windfuryActive ? '<div style="color: #51cf66;">⚡ Windfury Active (20% chance for 2 extra attacks)</div>' : ''}
                ${abilityDisplay}
                ${summonsDisplay}
            `;
        }
        
        if (enemyStats) {
            const enemyNextAttack = ((this.currentEnemyType.attackSpeed - this.enemyAttackTimer) / 1000).toFixed(1);
            const enemyMinDamage = Math.round(this.enemy.damage * CONFIG.DAMAGE_VARIANCE_MIN);
            const enemyMaxDamage = Math.round(this.enemy.damage * CONFIG.DAMAGE_VARIANCE_MAX);
            
            enemyStats.innerHTML = `
                <div><strong>${this.enemy.name}</strong></div>
                <div>HP: ${this.enemy.hp}/${this.enemy.maxHp}</div>
                <div>Damage: ${enemyMinDamage}-${enemyMaxDamage}</div>
                <div>Next Attack: ${enemyNextAttack}s</div>
            `;
        }
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
            .map(entry => {
                // Add windfury class to messages containing the lightning emoji
                const isWindfury = entry.message.includes('⚡');
                const classes = isWindfury ? `${entry.type} windfury` : entry.type;
                return `<div class="${classes}">${entry.message}</div>`;
            })
            .join('');
    }
    
    // ========== VISUAL EFFECTS ==========
    private triggerAttackAnimation(attacker: 'player' | 'enemy' | 'summon') {
        if (attacker === 'player' || attacker === 'summon') {
            const playerSprite = document.getElementById('player-sprite');
            const enemySprite = document.getElementById('enemy-sprite');
            
            if (playerSprite && attacker === 'player') {
                playerSprite.classList.add('attacking');
                setTimeout(() => playerSprite.classList.remove('attacking'), 200);  // Faster
            }
            
            if (enemySprite) {
                setTimeout(() => {
                    enemySprite.classList.add('damaged');
                    setTimeout(() => enemySprite.classList.remove('damaged'), 150);  // Faster
                }, 100);  // Hit comes quicker
            }
        } else {
            const enemySprite = document.getElementById('enemy-sprite');
            const playerSprite = document.getElementById('player-sprite');
            
            if (enemySprite) {
                enemySprite.classList.add('enemy-attacking');
                setTimeout(() => enemySprite.classList.remove('enemy-attacking'), 200);  // Faster
            }
            
            if (playerSprite) {
                setTimeout(() => {
                    playerSprite.classList.add('damaged');
                    setTimeout(() => playerSprite.classList.remove('damaged'), 150);  // Faster
                }, 100);  // Hit comes quicker
            }
        }
    }
    
    private showDamageNumber(damage: number, type: string, target: 'player' | 'enemy') {
        const arena = document.getElementById('combat-arena');
        if (!arena) return;
        
        // Get the appropriate stack for this target
        const stack = target === 'enemy' ? this.enemyDamageNumbers : this.playerDamageNumbers;
        
        // Remove oldest if we have 4 already
        if (stack.length >= 4) {
            const oldest = stack.shift();
            oldest?.remove();
        }
        
        // Create splat container
        const splatElement = document.createElement('div');
        splatElement.className = 'damage-splat';
        
        // Determine splat color based on type
        let splatColor = '#cc0000'; // Default red
        if (type === 'healing') {
            splatColor = '#00cc00'; // Green for healing
        } else if (type === 'holy') {
            splatColor = '#4444ff'; // Blue for holy
        }
        
        // Add the splat background
        const splatBg = document.createElement('div');
        splatBg.className = 'splat-bg';
        splatBg.innerHTML = `
            <svg width="50" height="45" viewBox="0 0 50 45">
                <ellipse cx="25" cy="22" rx="23" ry="20" fill="${splatColor}" stroke="#000" stroke-width="2"/>
            </svg>
        `;
        
        // Add the damage number
        const damageText = document.createElement('div');
        damageText.className = 'splat-text';
        damageText.textContent = damage.toString();
        
        splatElement.appendChild(splatBg);
        splatElement.appendChild(damageText);
        
        // Get position for this splat in the diamond
        const position = this.diamondPositions[stack.length] || this.diamondPositions[0];
        
        // Position based on target
        if (target === 'enemy') {
            splatElement.style.right = `${100 - position.x}px`;
            splatElement.style.left = 'auto';
        } else {
            splatElement.style.left = `${100 + position.x}px`;
            splatElement.style.right = 'auto';
        }
        
        // Convert y offset to pixels and position from top
        const baseTopPixels = arena.offsetHeight * 0.45;
        splatElement.style.top = `${baseTopPixels + position.y}px`;
        
        arena.appendChild(splatElement);
        stack.push(splatElement);
        
        // Remove after duration
        setTimeout(() => {
            const index = stack.indexOf(splatElement);
            if (index > -1) {
                stack.splice(index, 1);
            }
            splatElement.remove();
            
            // Reposition remaining splats in diamond pattern
            stack.forEach((elem, i) => {
                const newPos = this.diamondPositions[i] || this.diamondPositions[0];
                if (target === 'enemy') {
                    elem.style.right = `${100 - newPos.x}px`;
                } else {
                    elem.style.left = `${100 + newPos.x}px`;
                }
                const baseTopPixels = arena.offsetHeight * 0.45;
                elem.style.top = `${baseTopPixels + newPos.y}px`;
            });
        }, CONFIG.DAMAGE_NUMBER_DURATION);
    }
}
