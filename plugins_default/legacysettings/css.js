const css = `
.ssMenuOverlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 99999; display: none; }
.ssMenuRoot { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--ss-blue2); border-radius: 0.3em; padding: 0.75em; min-width: 42em; color: var(--ss-white); display: flex; flex-direction: column; }
.ssTabs { display: flex; margin-bottom: 0.6em; }
.ssTab { padding: 0.3em 0.9em; margin-right: 0.4em; cursor: pointer; background: var(--ss-blue1); color: var(--ss-blue4); border-radius: 0.2em; user-select: none; }
.ssTab.active { background: var(--ss-blue4); color: var(--ss-blue1); }
.ssPane { display: flex; gap: 0.8em; }
.ssPanel { flex: 1; display: flex; flex-direction: column; }
.ssCategory { margin-bottom: 0.6em; border-radius: 0.2em; overflow: hidden; }
.ssCategoryHeader { background: var(--ss-blue1); color: var(--ss-blue4); padding: 0.3em 0.5em; user-select: none; display: flex; align-items: center; justify-content: space-between; }
.ssCategory.open .ssCategoryHeader { background: var(--ss-blue4); color: var(--ss-blue1); }
.ssCategoryHeader.collapsible { cursor: pointer;  }
.ssCategoryBody { padding: 0.4em 0.6em; display: block; background: rgba(255,255,255,0.15); }
.ssCategory.collapsible .ssCategoryBody { display: none; }
.ssCategory.collapsible.open .ssCategoryBody { display: block; }
.ssArrow { display: inline-block; margin-left: 0.5em; transition: transform 0.2s; }
.ssCategory.collapsible .ssArrow { transform: rotate(0deg); }
.ssCategory.collapsible.open .ssArrow { transform: rotate(90deg); }
.ssOption { display: flex; align-items: center; margin: 0.35em 0; }
.ssOption label { flex: 1; margin-right: 0.5em; }
.ssStandalone { margin-bottom: 0.6em; padding: 0.4em 0.6em; background: rgba(255,255,255,0.15); border-radius: 0.2em; }
.ssClose { margin-top: 0.8em; text-align: center; }
#settingsContainer { position: static !important; top: auto !important; left: auto !important; transform: none !important; background: none !important; border-radius: 0 !important; padding: 0 !important; }
#closeSettings { visibility: hidden !important; }
.bindBox { padding: 0.2em 0.4em; background: var(--ss-blue1); color: var(--ss-blue4); border-radius: 0.2em; cursor: pointer; min-width: 5em; text-align: center; user-select: none; }
.bindBox.active { background: var(--ss-blue4); color: var(--ss-blue1); }
.ss_select {
    border: none;
}
.ss_radio_group.horizontal {
    display: flex;
    gap: 0.6em;
    align-items: center;
}

.ss_radio_wrap {
    display: flex;
    gap: 0.25em;
    align-items: center;
    cursor: pointer;
    font-size: 1em;
}

.ss_radio_wrap input[type="radio"] {
    cursor: pointer;
    width: 1.2em;
    height: 1.2em;
    accent-color: var(--ss-blue3);
}

.ss_checkbox {
    width: 0.9em;
    height: 0.9em;
    accent-color: var(--ss-blue3);
}

.ss_slider {
    accent-color: var(--ss-blue3);
}
.ssSlider {
    width: 50%;
}

.ss_slider_number {
    margin-right: 0.35em;
}

.ss_text_input {
    padding: 0.3em 0.5em;
    border: 2px solid var(--ss-blue2);
}

.ss_info_text {
    padding: 0.3em 0.5em;
    font-size: 0.75em;
    color: var(--ss-white);
    background: var(--ss-blue1);
    border-radius: 0.5em;
}

`;

export const cssTemplate = `const LegacySettingsCSS = \`${css}\`;\n`;