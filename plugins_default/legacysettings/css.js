const css = `
.ssMenuOverlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 99999; display: none; }
.ssMenuRoot { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.85); background: var(--ss-blue2); border-radius: 0.3em; padding: 0.75em; min-width: 42em; color: var(--ss-white0); display: flex; flex-direction: column; }
.ssTabs { display: flex; margin-bottom: 0.6em; }
.ssTab { padding: 0.3em 0.9em; margin-right: 0.4em; cursor: pointer; background: var(--ss-blue1); color: var(--ss-blue4); border-radius: 0.2em; user-select: none; }
.ssTab.active { background: var(--ss-blue4); color: var(--ss-blue1); }
.ssPane {
    display: flex;
    gap: 0.8em;
    width: 44em;
    height: 30em;
    min-height: 0;
    overflow: hidden;
}
.ssPanel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
}
.ssTabRoot {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 0;
    gap: 0.8em;
}
.ssCategory { margin-bottom: 0.6em; border-radius: 0.2em; }
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
.ssOption label { flex: 1; margin-right: 0.5em; color: var(--ss-white0); }
.ssLabelAbove {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding-bottom: 0.25em;
}
.ssOptionContainer {
    width: 100%;
}
.ssStandalone { margin-bottom: 0.6em; padding: 0.4em 0.6em; background: rgba(255,255,255,0.15); border-radius: 0.2em; overflow: hidden; }
.ssClose { margin-top: 0.8em; text-align: center; }
#settingsContainer { position: static !important; top: auto !important; left: auto !important; transform: none !important; background: none !important; border-radius: 0 !important; padding: 0 !important; }
#closeSettings { visibility: hidden !important; }
.bindBox { padding: 0.2em 0.4em; background: var(--ss-blue1); color: var(--ss-blue4); border-radius: 0.2em; cursor: pointer; min-width: 5em; text-align: center; user-select: none; }
.bindBox.active { background: var(--ss-blue4); color: var(--ss-blue1); }
.ss_select {
    border: none;
    min-width: 13em;
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
    color: var(--ss-white0);
}

.ss_text_input {
    padding: 0.3em 0.5em;
    border: 2px solid var(--ss-blue2);
}

.ss_info_text {
    padding: 0.3em 0.5em;
    font-size: 0.75em;
    color: var(--ss-white0);
    background: var(--ss-blue1);
    border-radius: 0.5em;
    width: 100%;
    color: var(--ss-white0);
}

.ss_list {
    display: flex;
    flex-direction: column;
    gap: 0.3em;
    background: var(--ss-blue2);
    padding: .3em;
    border-radius: 0.3em;
    width: 100%;
    max-width: 20em;
}

.ss_list_remove {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--ss-red, #ff5555);
    cursor: pointer;
    font-size: 0.9em;
    position: relative;
    top: 1px;
}

.ss_list_row {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.25em 0.4em;
    background: var(--ss-blue1);
    border-radius: 0.3em;
    box-sizing: border-box;
    transition: transform 0.15s ease, background 0.15s ease, opacity 0.15s ease;
}

.ss_list_row.dragging {
    opacity: 0.6;
}

.ss_list_row.empty {
    background: none;
    color: lightgrey;
    font-size: 0.75em;
}

.ss_list_handle {
    cursor: grab;
    user-select: none;
    padding: 0 0.4em;
    font-size: 0.9em;
    opacity: 0.7;
    position: relative;
    top: 1px;
}

.ss_list_text {
    flex: 1;
    font-size: 0.75em;
    color: var(--ss-white0);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

/* scrollbars */

.ssPanel {
    scrollbar-width: thin;
    scrollbar-color: var(--ss-blue4) transparent;
}

.ssPanel::-webkit-scrollbar {
    width: 8px;
}

.ssPanel::-webkit-scrollbar-track {
    background: transparent;
    margin: 4px 0;
}

.ssPanel::-webkit-scrollbar-thumb {
    background: linear-gradient(
        180deg,
        var(--ss-blue3),
        var(--ss-blue4)
    );
    border-radius: 6px;
    border: 2px solid transparent;
    background-clip: padding-box;
}

.ssPanel::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(
        180deg,
        var(--ss-blue4),
        var(--ss-blue5, var(--ss-blue4))
    );
}

.ssPanel::-webkit-scrollbar-corner {
    background: transparent;
}

.ss_image_gallery {
    position: relative;
    width: 20.5em; /* i kinda gave up */
    height: 10em; /* or adjust to fit panel constraints */
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 0.3em;
    background: var(--ss-blue1);
}

.ss_image_gallery img {
    max-width: 85%;
    max-height: 100%;
    object-fit: contain;
    display: block;
}

.ss_image_gallery_arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 2em;
    height: 2em;
    background-size: contain;
    background-repeat: no-repeat;
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.2s;
}

.ss_image_gallery_arrow:hover {
    opacity: 1;
}

.ss_image_gallery_arrow.left {
    left: 0.25em;
    background-image: url("/img/arrowLeft.png");
}

.ss_image_gallery_arrow.right {
    right: 0.25em;
    background-image: url("/img/arrowRight.png");
}


`;

export const cssTemplate = `const LegacySettingsCSS = \`${css}\`;\n`;