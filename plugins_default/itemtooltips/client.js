//legacyshell: basic
import { devlog, isClient, isServer } from "#constants";
import { iterateXYZ } from "#loading";
//legacyshell: plugins
import { plugins } from '#plugins';
//

export const ItemToolTips = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (ChristmasEvent)");

        this.plugins = pluginManager;

        this.plugins.on('game:encloseRenderPageFunc', this.encloseRenderPageFunc.bind(this));
        this.plugins.on('game:clearItemButtons', this.clearItemButtons.bind(this));
    },

    encloseRenderPageFunc(data) {
        let canvas = data.canvas;
        let renderingItem = data.renderingItem;

        if (canvas.tooltip) {
            canvas.tooltip.remove();
            canvas.removeEventListener("mousemove", canvas._tooltipMouseMove);
            canvas.removeEventListener("mouseout", canvas._tooltipMouseOut);
        };

        const tooltip = document.createElement("div");
        tooltip.style.position = "absolute";
        tooltip.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        tooltip.style.color = "#fff";
        tooltip.style.padding = "5px 10px";
        tooltip.style.borderRadius = "5px";
        tooltip.style.pointerEvents = "none";
        tooltip.style.fontSize = "12px";
        tooltip.style.visibility = "hidden";
        tooltip.textContent = renderingItem.name;
        document.body.appendChild(tooltip);

        canvas.tooltip = tooltip;

        function handleMouseMove(event) {
            tooltip.style.left = `${event.pageX + 10}px`;
            tooltip.style.top = `${event.pageY + 10}px`;
            tooltip.style.visibility = "visible";
        };

        function handleMouseOut() {
            tooltip.style.visibility = "hidden";
        };

        canvas._tooltipMouseMove = handleMouseMove;
        canvas._tooltipMouseOut = handleMouseOut;

        canvas.addEventListener("mousemove", handleMouseMove);
        canvas.addEventListener("mouseout", handleMouseOut);
    },

    clearItemButtons(data) {
        let canvas = data.canvas;

        if (canvas.tooltip) {
            canvas.tooltip.remove();
            canvas.removeEventListener("mousemove", canvas._tooltipMouseMove);
            canvas.removeEventListener("mouseout", canvas._tooltipMouseOut);
        };
    }
};

if (isClient) ItemToolTips.registerListeners(plugins);