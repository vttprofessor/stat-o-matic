import { StatRollerApp } from "./apps/stat-roller-app.js";


Hooks.once("init", () => {
    console.log("Stat-O-Matic | Initializing...");

    game.settings.register("stat-o-matic", "rollMethod", {
        name: "Stat Generation Method",
        hint: "Choose the method used to generate ability scores. See below for details.",
        scope: "world",
        config: true,
        type: String,
        default: "4d6kh3",
        choices: {
            "4d6kh3": "4d6 Drop Lowest",
            "3d6": "3d6",
            "3d6InOrder": "3d6 Down the Line",
            "standardArray": "Standard Array",
            "pointBuy": "Point Buy"
        },
        onChange: value => {
            console.log("Stat Roller | Method changed to:", value);
        }
    });
});

// Settings UI
Hooks.on("renderSettingsConfig", (app, html, data) => {
    console.log("Stat Roller | renderSettingsConfig fired");

    const $html = $(html);

    const input = $html.find('select[name="stat-o-matic.rollMethod"]');

    if (!input.length) {
        console.warn("Stat Roller | Could not find settings input element");
        return;
    }

    const formGroup = input.closest(".form-group");
    let notes = formGroup.find(".notes");

    if (!notes.length) {
        formGroup.append('<p class="notes"></p>');
        notes = formGroup.find(".notes");
    }

    const style = `style="color: #ccb7a5; margin-top: 5px;"`;
    const descriptions = {
        "4d6kh3": `
            <div ${style}>
                <strong>4d6 Drop Lowest</strong>
                <div style="margin-top: 5px; margin-bottom: 5px;">The most common method for assigning ability scores in D&D 5e.</div>
                <ul style="margin-top: 0px; list-style-type: disc; padding-left: 20px;">
                    <li>Roll four six-sided dice.</li>
                    <li>Drop the lowest die and add the remaining three together.</li>
                    <li>Repeat six times.</li>
                    <li>Assign the results to any ability scores of choice.</li>
                </ul>
            </div>`,
        "3d6": `
            <div ${style}>
                <strong>3d6</strong>
                <ul style="margin-top: 5px; list-style-type: disc; padding-left: 20px;">
                    <li>Roll three six-sided dice.</li>
                    <li>Add the three dice together.</li>
                    <li>Repeat six times.</li>
                    <li>Assign the results to any ability scores of choice.</li>
                </ul>
            </div>`,
        "3d6InOrder": `
            <div ${style}>
                <strong>3d6 Down the Line</strong>
                <div style="margin-top: 5px; margin-bottom: 5px;">The classic old-school method, with very random results that are more challenging.</div>
                <ul style="margin-top: 0px; list-style-type: disc; padding-left: 20px;">
                    <li>Roll three six-sided dice for each ability score in order.</li>
                    <li>Immediately assign each result in order as it is rolled.</li>
                </ul>
            </div>`,
        "standardArray": `
            <div ${style}>
                <strong>Standard Array</strong>
                <div style="margin-top: 5px; margin-bottom: 5px;">The easiest and most balanced method.</div>
                <ul style="margin-top: 0px; list-style-type: disc; padding-left: 20px;">
                    <li>Use the fixed numbers 15, 14, 13, 12, 10, and 8.</li>
                    <li>Players assign these numbers to the six ability scores of their choice.</li>
                </ul>
            </div>`,
        "pointBuy": `
            <div ${style}>
                <strong>Point Buy</strong>
                <div style="margin-top: 5px; margin-bottom: 5px;">A very popular method that allows for the most customization and ensures balance.</div>
                <ul style="margin-top: 0px; list-style-type: disc; padding-left: 20px;">
                    <li>Each ability score begins at a base score of 8.</li>
                    <li>Players have 27 points to distribute among their ability scores.</li>
                    <li>Increasing an ability score requires spending points.</li>
                </ul>
            </div>`
    };

    const updateDescription = () => {
        const val = input.val();
        const desc = descriptions[val] || "";
        notes.html(desc);
    };

    updateDescription();

    input.on("change", updateDescription);

    console.log("Stat Roller | Injected dynamic settings description");
});

// Sheet Integration
Hooks.on("renderCharacterActorSheet", (sheet, html, data) => {
    const $html = $(html);

    const detailsTab = $html.find('.tab[data-tab="details"]');

    let pillsContainer = detailsTab.find('.pills-lg');

    if (!pillsContainer.length) {
        pillsContainer = $html.find('.pills-lg');
    }

    if (pillsContainer.length) {
        const targetContainer = pillsContainer.first();
        const existingBtn = targetContainer.find('.stat-roller-trigger');
        const hasAssignments = !!sheet.document.getFlag("stat-o-matic", "assignments");

        if (hasAssignments) {
            if (existingBtn.length) existingBtn.remove();
        } else {
            if (!existingBtn.length) {
                const label = "Add Ability Points";

                const btn = $(`
                    <div class="pill-lg empty roboto-upper stat-roller-trigger">
                        ${label}
                    </div>
                `);

                btn.on("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    new StatRollerApp(sheet.document).render(true);
                });

                targetContainer.append(btn);
            }
        }
    }

    // App Header Patch
    if (!sheet._statRollerHeaderPatched && typeof sheet._headerControlButtons === "function") {
        const original = sheet._headerControlButtons;
        sheet._headerControlButtons = function* () {
            const result = original.call(this);
            if (result) {
                if (result[Symbol.iterator]) {
                    yield* result;
                } else {
                }
            }

            if (this.document.isOwner) {
                yield {
                    label: "Reset Abilities",
                    icon: "fas fa-undo",
                    class: "reset-abilities",
                    action: "resetAbilities",
                    onClick: () => {
                        Dialog.confirm({
                            title: "Reset Ability Scores",
                            content: "<p>Are you sure you want to reset all your abilities scores to the default? This will undo changes made by the Stat-O-Matic module.</p>",
                            yes: async () => {
                                const actor = this.document;
                                const storedAssignments = actor.getFlag("stat-o-matic", "assignments") || {};
                                const updates = {};
                                const abilities = actor.system.abilities;

                                for (const [key, ability] of Object.entries(abilities)) {
                                    const currentTotal = ability.value;
                                    let previousBase = 10;
                                    if (storedAssignments[key]) {
                                        previousBase = storedAssignments[key];
                                    }

                                    const bonus = currentTotal - previousBase;
                                    const newVal = 10 + bonus;

                                    updates[`system.abilities.${key}.value`] = newVal;
                                }

                                await actor.unsetFlag("stat-o-matic", "assignments");
                                await actor.update(updates);
                                ui.notifications.info("Ability scores have been reset to default values (preserving bonuses).");
                            },
                            defaultYes: false
                        });
                    }
                };
            }
        };
        sheet._statRollerHeaderPatched = true;
    }
});

// App Support
const addResetButtonLegacy = (sheet, buttons) => {
    const actor = sheet.actor;
    if (!actor || actor.type !== "character") return;
    if (!actor.isOwner) return;

    if (buttons.some(b => b.label === "Reset Abilities")) return;

    buttons.unshift({
        label: "Reset Abilities",
        class: "reset-abilities",
        icon: "fas fa-undo",
        onclick: () => {
            Dialog.confirm({
                title: "Reset Ability Scores",
                content: "<p>Are you sure you want to reset all your abilities scores to the default? This will undo changes made by the Stat-O-Matic module.</p>",
                yes: async () => {
                    const storedAssignments = actor.getFlag("stat-o-matic", "assignments") || {};
                    const updates = {};
                    const abilities = actor.system.abilities;

                    for (const [key, ability] of Object.entries(abilities)) {
                        const currentTotal = ability.value;
                        let previousBase = 10;
                        if (storedAssignments[key]) {
                            previousBase = storedAssignments[key];
                        }

                        const bonus = currentTotal - previousBase;
                        const newVal = 10 + bonus;

                        updates[`system.abilities.${key}.value`] = newVal;
                    }

                    await actor.unsetFlag("stat-o-matic", "assignments");
                    await actor.update(updates);
                    ui.notifications.info("Ability scores have been reset to default values (preserving bonuses).");
                },
                defaultYes: false
            });
        }
    });
};

Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => addResetButtonLegacy(sheet, buttons));
