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
    private combatRules: any[] = [];
    
    // ========== INITIALIZATION ==========
    constructor() {
        this.player = this.createPlayer();
        this.enemy = this.createEnemy(this.currentEnemyType);
        this.initializeAbilities();
        this.loadCombatRules();
        this.initializeUI();
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
                }
                return hpPercent < rule.conditionValue;
            
            case 'hp_above':
                if (rule.action === 'holy_strike') {
                    const cooldown = this.abilityCooldowns.get(this.holyStrike.id) || 0;
                    const hasMana = this.player.mana >= this.holyStrike.manaCost;
                    return hpPercent >= rule.conditionValue && cooldown <= 0 && hasMana;
                }
                return hpPercent >= rule.conditionValue;
            
            case 'always':
                if (rule.action === 'holy_strike') {
                    const cooldown = this.abilityCooldowns.get(this.holyStrike.id) || 0;
                    const hasMana = this.player.mana >= this.holyStrike.manaCost;
                    return cooldown <= 0 && hasMana;
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
            
            case 'melee':
                if (!this.isSwinging) {
                    this.startMeleeSwing();
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
        
        // Add event listener for add rule button
        const addBtn = document.getElementById('add-rule-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.addNewRule());
        }
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
                        <option value="melee" ${rule.action === 'melee' ? 'selected' : ''}>Melee</option>
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
                        <option value="melee" ${rule.action === 'melee' ? 'selected' : ''}>Melee</option>
                        <option value="none" ${rule.action === 'none' ? 'selected' : ''}>Do Nothing</option>
                    </select>
                `;
            } else {
                content.innerHTML = `
                    Always → Use 
                    <select onchange="window.game.updateRuleValue('${rule.id}', 'action', this.value)">
                        <option value="holy_strike" ${rule.action === 'holy_strike' ? 'selected' : ''}>Holy Strike</option>
                        <option value="melee" ${rule.action === 'melee' ? 'selected' : ''}>Melee</option>
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
            <div>Player: ${this.player.hp}/${this.player.maxHp} HP (${(this.player.hp / this.player.maxHp * 100).toFixed(0)}%) | ${this.player.mana}/${this.player.maxMana} Mana | ${playerStatus}${cooldownText}</div>
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
