const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class StatRollerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(actor) {
        super({ window: { title: "Stat-O-Matic" } });
        this.actor = actor;
        this.method = game.settings.get("stat-o-matic", "rollMethod");
        this.rolledValues = [];
        this.assignments = {
            str: null,
            dex: null,
            con: null,
            int: null,
            wis: null,
            cha: null
        };

        if (this.method === "standardArray") {
            const arr = [15, 14, 13, 12, 10, 8];
            this.rolledValues = arr.map((v, i) => ({
                id: i,
                value: v,
                assignedTo: null
            }));
            this.rollingStep = "ASSIGNING";
        } else if (this.method === "pointBuy") {
            for (let k of Object.keys(this.assignments)) this.assignments[k] = 8;
            this.rollingStep = "POINT_BUY";
        } else {
            this.rollingStep = "ROLLING";
        }
    }

    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["stat-roller-app", "dnd5e2"],
        position: {
            width: 600,
            height: "auto"
        },
        actions: {
            rollSingle: this._onRollSingle,
            adjustPointBuy: this._onAdjustPointBuy,
            confirmAssignments: this._onConfirmAssignments
        }
    };

    static PARTS = {
        main: {
            template: "modules/stat-o-matic/templates/stat-roller.hbs"
        }
    };

    // Drag & Drop Logic
    _onDragStart(event) {
        const index = event.currentTarget.dataset.index;
        const value = event.currentTarget.dataset.value;
        const origin = event.currentTarget.dataset.origin;

        event.dataTransfer.setData("text/plain", JSON.stringify({
            index,
            value,
            origin
        }));
        event.currentTarget.classList.add("dragging");
    }

    _onDragEnd(event) {
        event.currentTarget.classList.remove("dragging");
    }

    _onDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove("drag-over");

        const dataStr = event.dataTransfer.getData("text/plain");
        if (!dataStr) return;

        const data = JSON.parse(dataStr);
        const targetStat = event.currentTarget.dataset.stat;

        if (targetStat) {
            this._handleDropOnStat(data, targetStat);
        } else if (event.currentTarget.classList.contains("rolled-values-pool")) {
            this._handleDropOnPool(data);
        }
    }

    _handleDropOnStat(dragData, targetStat) {
        const value = parseInt(dragData.value);
        const sourceIndex = parseInt(dragData.index);

        const existingValue = this.assignments[targetStat];

        this.assignments[targetStat] = value;

        if (dragData.origin === 'pool') {
            const rolledItem = this.rolledValues.find(r => r.id == sourceIndex);
            if (rolledItem) rolledItem.assignedTo = targetStat;

            if (existingValue) {
                const prevItem = this.rolledValues.find(r => r.assignedTo === targetStat && r.value !== value);
                for (let r of this.rolledValues) {
                    if (r.assignedTo === targetStat && r.id != sourceIndex) {
                        r.assignedTo = null;
                    }
                }
            }
        }
        else if (dragData.origin !== 'pool') {
            const sourceStat = dragData.origin;
            this.assignments[sourceStat] = existingValue;

            const item = this.rolledValues.find(r => r.id == sourceIndex);
            if (item) item.assignedTo = targetStat;

            if (existingValue) {
                const otherItem = this.rolledValues.find(r => r.assignedTo === targetStat && r.id != sourceIndex);
                if (otherItem) otherItem.assignedTo = sourceStat;
            }
        }

        this.render();
    }

    _handleDropOnPool(dragData) {
        if (dragData.origin === 'pool') return;

        const sourceStat = dragData.origin;
        const sourceIndex = parseInt(dragData.index);

        this.assignments[sourceStat] = null;

        const item = this.rolledValues.find(r => r.id == sourceIndex);
        if (item) item.assignedTo = null;

        this.render();
    }

    _onDragOver(event) {
        event.preventDefault();
        event.currentTarget.classList.add("drag-over");
    }

    _onDragLeave(event) {
        event.currentTarget.classList.remove("drag-over");
    }


    // Base Rolling Logic
    static async _onRollSingle(event, target) {
        if (this.isAssigning) return;

        const formula = this.method === "3d6" || this.method === "3d6InOrder" ? "3d6" : "4d6dl";
        const roll = await new Roll(formula).evaluate();

        this.currentRollResult = "...";
        this.render();

        if (game.modules.get("dice-so-nice")?.active) {
            await game.dice3d?.showForRoll(roll, game.user, true);
        }

        this.currentRollResult = roll.total;

        if (this.method === "3d6InOrder") {
            this.isAssigning = true;
            this.render();

            await new Promise(r => setTimeout(r, 1500));
        }

        const i = this.rolledValues.length;
        const keys = ["str", "dex", "con", "int", "wis", "cha"];
        const assignedTo = this.method === "3d6InOrder" ? keys[i] : null;

        this.rolledValues.push({
            id: i,
            value: roll.total,
            base: roll,
            assignedTo: assignedTo
        });

        if (assignedTo) {
            this.assignments[assignedTo] = roll.total;
        }

        this.currentRollResult = null;
        this.isAssigning = false;

        if (this.rolledValues.length >= 6 && this.method !== "3d6InOrder") {
            this.rollingStep = "ASSIGNING";
        }

        this.render();
    }

    // Point Buy Calculation
    static _onAdjustPointBuy(event, target) {
        const stat = target.dataset.stat;
        const delta = parseInt(target.dataset.delta);
        const current = this.assignments[stat];
        const next = current + delta;

        if (next < 8 || next > 15) return;

        const getCost = (val) => {
            if (val <= 13) return val - 8;
            if (val === 14) return 5 + 2;
            if (val === 15) return 7 + 2;
            return 0;
        };

        const currentPointsUsed = Object.entries(this.assignments).reduce((acc, [k, v]) => acc + getCost(v), 0);
        const pointsWithoutThisStat = currentPointsUsed - getCost(current);
        const newTotalPoints = pointsWithoutThisStat + getCost(next);

        if (newTotalPoints > 27) {
            ui.notifications.warn("You don't have enough points left!");
            return;
        }

        this.assignments[stat] = next;
        this.render();
    }

    // Apply Stats
    static async _onConfirmAssignments(event, target) {
        const missing = Object.entries(this.assignments).filter(([k, v]) => v === null);
        if (missing.length > 0) {
            ui.notifications.warn("Please assign all stats before confirming.");
            return;
        }

        const storedAssignments = this.actor.getFlag("stat-o-matic", "assignments") || {};

        const updates = {};
        const newStoredAssignments = {};

        for (const [key, val] of Object.entries(this.assignments)) {
            const currentTotal = this.actor.system.abilities[key].value;

            const previousBase = storedAssignments[key] || 10;

            const bonus = currentTotal - previousBase;

            const finalValue = val + bonus;

            updates[`system.abilities.${key}.value`] = finalValue;
            newStoredAssignments[key] = val;
        }

        await this.actor.update(updates);

        await this.actor.setFlag("stat-o-matic", "assignments", newStoredAssignments);
        await this.actor.setFlag("stat-o-matic", "rolled", true);

        this.close();
        ui.notifications.info("Stats applied successfully!");
    }

    async _prepareContext(options) {
        const stats = {
            str: "DND5E.AbilityStr",
            dex: "DND5E.AbilityDex",
            con: "DND5E.AbilityCon",
            int: "DND5E.AbilityInt",
            wis: "DND5E.AbilityWis",
            cha: "DND5E.AbilityCha"
        };
        const localizedStats = {};
        for (const [k, v] of Object.entries(stats)) {
            localizedStats[k] = game.i18n.localize(v) || k.toUpperCase();
        }

        const pool = this.rolledValues.filter(r => r.assignedTo === null);

        const assignedSlots = {};
        for (const k of Object.keys(stats)) {
            const val = this.assignments[k];
            const rolledObj = this.rolledValues.find(r => r.assignedTo === k);
            assignedSlots[k] = {
                key: k,
                label: localizedStats[k],
                value: val,
                rollId: rolledObj ? rolledObj.id : null
            };
        }

        const getPointCost = (val) => {
            if (val <= 13) return val - 8;
            if (val === 14) return 7;
            if (val === 15) return 9;
            return 0;
        };
        const pointsSpent = Object.values(this.assignments).reduce((acc, v) => acc + (v ? getPointCost(v) : 0), 0);

        const keys = ["str", "dex", "con", "int", "wis", "cha"];
        const nextStatKey = keys[this.rolledValues.length];
        const nextStatLabel = nextStatKey ? localizedStats[nextStatKey] : null;

        const descriptions = {
            "4d6kh3": "Roll 4d6 (drop lowest) for your ability scores!",
            "3d6": "Roll 3d6 for your ability scores.",
            "3d6InOrder": "Roll 3d6, assigning the results in order!",
            "standardArray": "Assign the standard array (15, 14, 13, 12, 10, 8) to your ability scores.",
            "pointBuy": "Spend 27 points to customize your ability scores."
        };
        const methodDescription = descriptions[this.method] || descriptions["4d6kh3"];

        return {
            methodDescription,
            isStart: this.rollingStep === "START",
            isRolling: this.rollingStep === "ROLLING",
            isAssigning: this.rollingStep === "ASSIGNING",
            isPointBuy: this.rollingStep === "POINT_BUY",
            isInOrder: this.method === "3d6InOrder",
            isStandardArray: this.method === "standardArray",
            rollsAttempted: this.rolledValues.length,
            rollsRemaining: 6 - this.rolledValues.length,
            nextStatLabel,
            pool,
            assignedSlots,
            pointsSpent,
            pointsRemaining: 27 - pointsSpent,
            canConfirm: Object.values(this.assignments).every(v => v !== null),
            currentRollResult: this.currentRollResult,
            isAssigningInProgress: this.isAssigning
        };
    }

    _onRender(context, options) {

        const html = this.element;

        html.querySelectorAll('.stat-chip').forEach(el => {
            el.addEventListener('dragstart', this._onDragStart.bind(this));
            el.addEventListener('dragend', this._onDragEnd.bind(this));
        });

        html.querySelectorAll('.stat-drop-zone, .rolled-values-pool').forEach(el => {
            el.addEventListener('dragover', this._onDragOver.bind(this));
            el.addEventListener('dragleave', this._onDragLeave.bind(this));
            el.addEventListener('drop', this._onDrop.bind(this));
        });
    }
}
