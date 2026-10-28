//legacyshell: the game's hud is html, not in the game's canvas. draw its live text, pictures, health circles and reticle into the video too
//

export const ReplayHud = {
    paint: function (ctx, canvas, d, cropX, cropY) {
        if (!document.body.classList.contains("replayPov") || !document.body.classList.contains("replayHud")) return;
        var rect = canvas.getBoundingClientRect(), w = rect.width * cropX, h = rect.height * cropY;
        if (!w || !h) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, d.w, d.h);
        ctx.clip();
        ctx.scale(d.w / w, d.h / h);
        ctx.translate(-rect.left - (rect.width - w) / 2, -rect.top - (rect.height - h) / 2);
        var readouts = document.getElementById("readouts");
        [document.getElementById("game"), readouts && readouts.parentElement].forEach((el) => {
            var alpha = 1;
            if (!el) return;
            for (var parent = el.parentElement; parent; parent = parent.parentElement) {
                var s = getComputedStyle(parent);
                if (s.display === "none") return;
                alpha *= Number(s.opacity);
            };
            this.element(ctx, el, alpha);
        });
        ctx.restore();
    },

    //the boxes and words use the page's own layout, so settings and themes carry across without making a second hud
    element: function (ctx, el, alpha) {
        if (el.matches("button, input, select, textarea, .lrPanel, .lrSide, .lrBack, .lrExportBox")) return;
        var s = getComputedStyle(el);
        if (s.display === "none" || Number(s.opacity) === 0) return;
        alpha *= Number(s.opacity);
        var rect = el.getBoundingClientRect(), tag = el.tagName.toLowerCase();
        ctx.save();
        ctx.globalAlpha = alpha;
        if (s.visibility === "visible") {
            if (tag === "circle") this.circle(ctx, el, s);
            else if (rect.width && rect.height && tag !== "svg") {
                ctx.save();
                var box = this.box(ctx, el, s, rect);
                var radius = (value, size) => value.includes("%") ? parseFloat(value) * size / 100 : parseFloat(value) || 0;
                var rx = Math.min(box.w / 2, radius(s.borderTopLeftRadius, box.w)), ry = Math.min(box.h / 2, radius(s.borderTopLeftRadius, box.h));
                ctx.beginPath();
                if (rx === box.w / 2 && ry === box.h / 2) ctx.ellipse(box.w / 2, box.h / 2, rx, ry, 0, 0, Math.PI * 2);
                else ctx.roundRect(0, 0, box.w, box.h, Math.min(rx, ry));
                ctx.fillStyle = s.backgroundColor;
                ctx.fill();
                var widths = [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].map((v) => parseFloat(v) || 0);
                var colors = [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor];
                var outer = [[0, 0], [box.w, 0], [box.w, box.h], [0, box.h]], inner = [[widths[3], widths[0]], [box.w - widths[1], widths[0]], [box.w - widths[1], box.h - widths[2]], [widths[3], box.h - widths[2]]];
                widths.forEach((width, i) => {
                    if (!width) return;
                    var next = (i + 1) % 4;
                    ctx.beginPath();
                    ctx.moveTo(...outer[i]); ctx.lineTo(...outer[next]); ctx.lineTo(...inner[next]); ctx.lineTo(...inner[i]);
                    ctx.closePath(); ctx.fillStyle = colors[i]; ctx.fill();
                });
                if (tag === "img" && el.complete && el.naturalWidth) {
                    //a remote image without CORS would spoil the whole video's canvas
                    if (new URL(el.currentSrc || el.src, location.href).origin === location.origin || el.crossOrigin) ctx.drawImage(el, 0, 0, box.w, box.h);
                };
                ctx.restore();
            };
            this.text(ctx, el, s, rect);
        };
        Array.from(el.children).forEach((child) => this.element(ctx, child, alpha));
        ctx.restore();
    },

    //the reticle's bars and brackets turn, and the kill ticker scales. keep that transform instead of painting their bounding rectangles
    box: function (ctx, el, s, rect) {
        var w = parseFloat(s.width) || el.offsetWidth, h = parseFloat(s.height) || el.offsetHeight;
        if (s.boxSizing !== "border-box") {
            w += (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.paddingRight) || 0) + (parseFloat(s.borderLeftWidth) || 0) + (parseFloat(s.borderRightWidth) || 0);
            h += (parseFloat(s.paddingTop) || 0) + (parseFloat(s.paddingBottom) || 0) + (parseFloat(s.borderTopWidth) || 0) + (parseFloat(s.borderBottomWidth) || 0);
        };
        var matrix = new DOMMatrix();
        for (var parent = el; parent; parent = parent.parentElement) matrix = new DOMMatrix(getComputedStyle(parent).transform).multiply(matrix);
        var xs = [0, matrix.a * w, matrix.c * h, matrix.a * w + matrix.c * h], ys = [0, matrix.b * w, matrix.d * h, matrix.b * w + matrix.d * h];
        ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, rect.left - Math.min(...xs), rect.top - Math.min(...ys));
        return { w, h };
    },

    circle: function (ctx, el, s) {
        var m = el.getScreenCTM();
        if (!m) return;
        ctx.save();
        ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
        ctx.beginPath();
        ctx.arc(el.cx.baseVal.value, el.cy.baseVal.value, el.r.baseVal.value, 0, Math.PI * 2);
        if (s.fill !== "none") { ctx.fillStyle = s.fill; ctx.fill() };
        if (s.stroke !== "none") {
            ctx.strokeStyle = s.stroke;
            ctx.lineWidth = parseFloat(s.strokeWidth);
            ctx.setLineDash(s.strokeDasharray === "none" ? [] : s.strokeDasharray.split(/[ ,]+/).map(parseFloat));
            ctx.lineDashOffset = parseFloat(s.strokeDashoffset) || 0;
            ctx.stroke();
        };
        ctx.restore();
    },

    text: function (ctx, el, s, rect) {
        var nodes = Array.from(el.childNodes).filter((node) => node.nodeType === 3 && /\S/.test(node.textContent));
        if (!nodes.length) return;
        ctx.save();
        var scale = el.offsetHeight ? rect.height / el.offsetHeight : 1;
        ctx.font = s.fontStyle + " " + s.fontWeight + " " + parseFloat(s.fontSize) * scale + "px " + s.fontFamily;
        ctx.fillStyle = s.color;
        ctx.textBaseline = "alphabetic";
        if (s.textShadow !== "none") { ctx.shadowColor = "#000"; ctx.shadowBlur = parseFloat(s.fontSize) * scale * 0.1; ctx.shadowOffsetY = parseFloat(s.fontSize) * scale * 0.05 };
        var range = document.createRange(), metrics = ctx.measureText("Mg");
        nodes.forEach((node) => {
            for (const match of node.textContent.matchAll(/\S+/g)) {
                range.setStart(node, match.index);
                range.setEnd(node, match.index + match[0].length);
                var r = range.getBoundingClientRect();
                if (!r.width || !r.height) continue;
                var ascent = metrics.fontBoundingBoxAscent || parseFloat(s.fontSize) * scale * 0.8, descent = metrics.fontBoundingBoxDescent || parseFloat(s.fontSize) * scale * 0.2;
                ctx.fillText(match[0], r.left, r.top + (r.height - ascent - descent) / 2 + ascent);
            };
        });
        ctx.restore();
    },
};
