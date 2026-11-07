// What a round looks like on screen (browser only; spliced into the client bundle next to shared.js, so plain script with no imports):
// the sudden death text and egg counter under the clock, the card at the end of a round, and what the PLAY button's menu says about
// how you will come in. All of it reads what the server already sends in the room params (gameOptions.plugins.zombies*), except the
// eggs a kill has just earned, which have a packet of their own (shared.js receives it).

const ZombiesUI = {
    roundEggs: 0,   //eggs the kills have earned this round, as the server counts them (see eggs)
    round: null,    //zombiesRound of the last params: a new one means a new round
    params_: {},
    key: null,
    at: 0,          //when the params came (the countdowns in them are seconds from then)
    ticks: [],

    css() {
        if (document.getElementById("zombiesStyle")) return;
        var style = document.createElement("style");
        style.id = "zombiesStyle";
        style.innerHTML = ""
            + "#zombiesHud{position:fixed;left:50%;top:3.4em;transform:translateX(-50%);pointer-events:none;text-align:center;white-space:nowrap}"
            + "#zombiesHud div{text-shadow:0em 0em .1em #000,0em .1em .2em #000}"
            + "#zombiesHud .zsd{color:#ff3b30;font-size:1.25em}"
            + "#zombiesHud .zeggs{color:var(--egg-tan);font-size:.9em;position:relative;display:inline-block}"
            + "#zombiesHud .zbonus{color:#ffd500;font-size:.8em}"
            + "#zombiesHud .zbonus.lost{color:var(--egg-tan);opacity:.55;text-decoration:line-through}"
            + "#zombiesHud .ztick{position:absolute;left:100%;top:0;margin-left:.4em;color:#ffd500;animation:zombiesRise 1.1s ease-out forwards}"
            + "@keyframes zombiesRise{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-1.4em)}}"
            + "#zombiesInfo{position:fixed;left:50%;bottom:3vh;transform:translateX(-50%);display:flex;align-items:stretch;pointer-events:none;text-align:center;"
            + "background:var(--egg-tan);color:var(--egg-brown);text-shadow:none;border:.15em solid var(--egg-brown);border-radius:.6em;overflow:hidden}"
            + "#zombiesCard{width:15em}"
            + "#zombiesCard .ztitle{padding:.3em .4em;color:var(--ss-white0);font-size:1.2em;background:var(--ss-blue3)}"
            + "#zombiesCard.horde .ztitle{background:#5a7a2e}"
            + "#zombiesCard .zsub{padding:.3em .5em 0;font-size:.8em;opacity:.7}"
            + "#zombiesCard .zrows{padding:.3em .8em}"
            + "#zombiesCard .zrow{display:flex;justify-content:space-between}"
            + "#zombiesCard .zrow.lost{opacity:.5;text-decoration:line-through}"
            + "#zombiesCard .zrow.vip{color:#c27a00}"
            + "#zombiesCard .zrow.total{margin-top:.2em;padding-top:.2em;border-top:.12em solid var(--egg-brown);font-size:1.15em}"
            + "#zombiesCard .znote{padding:0 .8em .5em;font-size:.8em}"
            + "#zombiesCard .znote.gold{color:#c27a00}"
            + "#zombiesPanel{display:flex;flex-direction:column;justify-content:center;min-width:11em;padding:.4em .9em;color:var(--egg-tan);background:var(--egg-brown)}"
            + "#zombiesPanel .zsub{font-size:.85em;opacity:.75}";
        document.head.appendChild(style);
    },

    el(id, parent, first) {
        var found = document.getElementById(id);
        if (found) return found;
        var made = document.createElement("div");
        made.id = id;
        parent = parent || document.getElementById("game") || document.body; //(in #game, so going to the main menu or the equip screen hides it with the rest of the game, not a poll later)
        if (first && parent.firstChild) parent.insertBefore(made, parent.firstChild);
        else parent.appendChild(made);
        return made;
    },

    // The params the server last sent (zombiesRound changes when a round starts). The countdowns in them are seconds from the moment they
    // were sent, so when anything in them changes that is when they started counting down here. That is worked out from what is there
    // rather than from the roomParamsUpdated event, which a browser that has only just joined can miss.
    sync(p) {
        if (!p) return;
        this.params_ = p;
        var key = [p.zombiesRound, p.zombiesInterim, p.zombiesNextIn, p.zombiesGraceLeft].join();
        if (key === this.key) return;
        this.key = key;
        this.at = Date.now();
        this.pause(p);
        if (p.zombiesRound !== this.round) {
            this.round = p.zombiesRound;
            this.roundEggs = 0;
            this.ticks = [];
        };
    },

    // The humans have won the round and you are still out in the game (the ones who lost are already at the menu): bring it up, so the card and the
    // countdown to the next round are in front of you without pressing esc. Once a round.
    pause(p) {
        if (!p.zombiesInterim || p.zombiesWinner !== 1 || this.paused === p.zombiesRound) return;
        var menu = document.getElementById("gameMenu");
        if (typeof inGame === "undefined" || !inGame || typeof me === "undefined" || !me || !menu || menu.style.display !== "none") return;
        this.paused = p.zombiesRound;
        try { openGameMenu(); } catch (e) { };
    },

    params(params) {
        this.sync(params);
    },

    // A zombie has just paid: how much it was and the total this round, from the server (shared.js gets the packet).
    eggs(gained, total) {
        this.roundEggs = total;
        this.ticks.push({ text: "+" + gained, at: Date.now() });
    },

    settings() {
        return Object.assign({}, ZombiesModeDefaults, gameOptions.plugins.zombies);
    },

    bonus(cfg, streak) {
        return cfg.winEggs + cfg.streakWinEggs * Math.min(streak || 0, cfg.streakCap);
    },

    clock(secs) {
        secs = Math.max(0, Math.ceil(secs));
        return Math.floor(secs / 60) + ":" + ("0" + (secs % 60)).slice(-2);
    },

    // Seconds left of one of the countdowns the server sent (at the moment it sent them).
    left(secs) {
        return (secs || 0) - (Date.now() - this.at) / 1000;
    },

    tick() {
        var p = gameOptions && gameOptions.plugins;
        var on = !!(p && p.zombies && inGame && me);
        if (on) this.sync(p);
        var game = document.getElementById("game"); //the equip screen hides all of this (the menu and the clock are in it) and leaves the menu itself open
        on = on && !!(game && game.style.display !== "none");
        var menu = document.getElementById("gameMenu");
        var menuOpen = !!(menu && menu.style.display !== "none");
        this.hud(on && !menuOpen, p);
        this.info(on && menuOpen, p);
    },

    loggedIn() {
        return typeof playerAccount !== "undefined" && !!playerAccount && !!playerAccount.isLoggedIn;
    },

    // Right under the game's clock, however big it is at the moment.
    place() {
        var hud = document.getElementById("zombiesHud"), clock = document.getElementById("gameClock");
        if (!hud) return;
        var bottom = clock && clock.style.display !== "none" ? clock.getBoundingClientRect().bottom : 0;
        hud.style.top = (bottom + 2) + "px";
    },

    hud(show, p) {
        var hud = document.getElementById("zombiesHud");
        if (!show) { if (hud) hud.style.display = "none"; return; };
        this.css();
        if (!hud) {
            hud = this.el("zombiesHud");
            var clock = document.getElementById("gameClock");
            var style = window.getComputedStyle(clock); //the clock's font
            hud.style.fontFamily = style.fontFamily;
            hud.style.fontWeight = style.fontWeight;
            hud.innerHTML = "<div class='zsd'></div><div class='zeggs'><span class='zlabel'></span></div><div class='zbonus'></div><div class='zbonus zstreak'></div>";
            //the clock grows over the last ten seconds, so the text goes wherever its bottom edge is, as soon as that moves
            if (typeof ResizeObserver !== "undefined") new ResizeObserver(function () { ZombiesUI.place(); }).observe(clock);
        };
        hud.style.display = "block";
        this.place();
        var cfg = this.settings();
        var infected = me.team === ZombiesTeams.HORDE;
        var streak = p.zombiesStreak || 0;
        var rows = hud.children;

        rows[0].innerText = p.zombiesSuddenDeath && !p.zombiesInterim ? "SUDDEN DEATH" : "";
        rows[0].style.display = rows[0].innerText ? "block" : "none";

        //the eggs line is for someone who gets paid them (a guest is never paid)
        var paid = this.loggedIn();
        rows[1].style.display = paid ? "block" : "none";
        var now = Date.now();
        rows[1].firstChild.textContent = "EGGS " + Math.min(this.roundEggs, cfg.eggCap) + " / " + cfg.eggCap;
        //each +n is a span of its own that rises once and goes (it is never rebuilt with the rest of the line, which would restart the rise: kills close together show the latest, not a pile)
        this.ticks = this.ticks.filter(function (t) { return now - t.at < 1100; });
        var tick = this.ticks[this.ticks.length - 1];
        if (tick && !tick.shown) {
            tick.shown = true;
            while (rows[1].children.length > 1) rows[1].removeChild(rows[1].lastChild);
            var rising = document.createElement("span");
            rising.className = "ztick";
            rising.textContent = tick.text;
            rows[1].appendChild(rising);
        };
        if (!tick) while (rows[1].children.length > 1) rows[1].removeChild(rows[1].lastChild);

        var bonus = this.bonus(cfg, streak);
        rows[2].className = "zbonus" + (infected && !p.zombiesInterim ? " lost" : "");
        rows[2].innerText = (p.zombiesInterim ? "NEXT ROUND: " : infected ? "" : "SURVIVE FOR ") + "+" + bonus + " WIN BONUS";
        rows[2].style.display = paid ? "block" : "none";
        rows[3].innerText = streak > 0 ? "WIN STREAK x" + streak : "";
        rows[3].style.display = streak > 0 ? "block" : "none";
    },

    // What the game menu says about the round, in a box of its own at the bottom of the screen, clear of the menu (it covers nothing and
    // pushes no button, PLAY above all, out of place): how the round went for you, when the next is, and how you will come in.
    info(show, p) {
        var info = document.getElementById("zombiesInfo");
        if (!show) { if (info) info.style.display = "none"; return; };
        this.css();
        if (!info) {
            info = this.el("zombiesInfo");
            info.innerHTML = "<div id='zombiesCard'></div><div id='zombiesPanel'></div>";
        };
        info.style.display = "flex";
        this.card(p);
        this.panel(p);
    },

    // The end of the round: how it went for you, and what it paid.
    card(p) {
        var card = document.getElementById("zombiesCard");
        var r = p.zombiesInterim && p.zombiesResults ? p.zombiesResults[meId] : null; //[outcome, kill eggs, win bonus, of which streak, pay, vip multiplier]
        if (!r) { card.style.display = "none"; return; };
        var key = JSON.stringify([this.round, r, p.zombiesWinner, p.zombiesStreak]);
        if (card.zKey !== key) {
            card.zKey = key;
            var outcome = r[0], humansWon = p.zombiesWinner === 1;
            var title = outcome === 1 ? "YOU SURVIVED!" : p.zombiesWinner === 2 ? "THE HORDE WINS" : outcome === 3 ? "YOU FLED THE FIGHT" : outcome === 4 ? "YOU JOINED THE HORDE" : "YOU WERE INFECTED";
            var sub = outcome === 1 ? "THE HUMANS HELD OUT" : p.zombiesWinner === 2 ? "NOBODY LEFT STANDING" : "NO SURVIVAL BONUS";
            var cfg = this.settings();
            var rows = "<div class='zrow'><span>KILL EGGS</span><span>" + r[1] + "</span></div>";
            if (outcome === 1) {
                rows += "<div class='zrow'><span>SURVIVAL BONUS</span><span>+" + (r[2] - r[3]) + "</span></div>";
                if (r[3] > 0) rows += "<div class='zrow'><span>STREAK BONUS</span><span>+" + r[3] + "</span></div>";
            } else if (humansWon) {
                rows += "<div class='zrow lost'><span>SURVIVAL BONUS</span><span>+" + cfg.winEggs + "</span></div>";
            };
            var base = r[1] + r[2], boosted = r[4] === 0 && r[5] > 1 && base > 0; //(a VIP is paid the lot times their multiplier)
            if (boosted) rows += "<div class='zrow vip'><span>VIP BOOST x" + r[5] + "</span><span>+" + (base * (r[5] - 1)) + "</span></div>";
            rows += "<div class='zrow total'><span>TOTAL</span><span>" + (boosted ? base * r[5] : base) + "</span></div>";
            var note = "", gold = "";
            if (humansWon) gold = "WIN STREAK x" + p.zombiesStreak + "!";
            else if (p.zombiesWinner === 2) note = "WIN STREAK LOST";
            if (r[4] === 1) note += (note ? "<br>" : "") + "CHEATS ON: NO EGGS";
            else if (r[4] === 2) note += (note ? "<br>" : "") + "SIGN IN TO KEEP YOUR EGGS";
            card.className = outcome === 1 ? "" : "horde";
            card.innerHTML = "<div class='ztitle'>" + title + "</div><div class='zsub'>" + sub + "</div><div class='zrows'>" + rows + "</div>"
                + (gold ? "<div class='znote gold'>" + gold + "</div>" : "") + (note ? "<div class='znote'>" + note + "</div>" : "");
        };
        card.style.display = "block";
    },

    // What happens if you press PLAY now. (Pressing escape in a round takes you out of play after 3 seconds, which infects you, and the
    // game keeps the button grey for 5 more: the text for that is the one a human in play gets.)
    panel(p) {
        var panel = document.getElementById("zombiesPanel");
        var line, sub;
        if (p.zombiesInterim) {
            var next = this.left(p.zombiesNextIn);
            line = next > 0 ? "NEXT ROUND IN " + this.clock(next) : "NEXT ROUND STARTING...";
            sub = "YOU START AS A HUMAN";
        } else if (me.team === ZombiesTeams.HORDE) {
            line = "YOU'RE INFECTED";
            sub = "JOIN THE HORDE";
        } else if (me.playing) {
            line = "LEAVING INFECTS YOU";
            sub = "THE HORDE WON'T WAIT";
        } else if (p.zombiesGraceLeft < 0) {
            line = "ROUND UNDERWAY";
            sub = "YOU START AS A HUMAN";
        } else if (this.left(p.zombiesGraceLeft) > 0) {
            line = "ROUND UNDERWAY";
            sub = "YOU START AS A HUMAN FOR " + this.clock(this.left(p.zombiesGraceLeft));
        } else {
            line = "ROUND UNDERWAY";
            sub = "YOU'LL JOIN THE HORDE";
        };
        var html = line + "<div class='zsub'>" + sub + "</div>";
        if (panel.zHtml !== html) { panel.zHtml = html; panel.innerHTML = html; };
    },
};
