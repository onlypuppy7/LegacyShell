export const LegacyProfiles = {
    sections: new Map(),
    generation: 0,

    registerListeners(pluginManager) {
        this.plugins = pluginManager;
        if (typeof LegacyThemesPlugin !== 'undefined') LegacyThemesPlugin.stylePacks.push({
            name: 'Player Profiles (Alt)',
            identifier: 'legacyprofilesblue',
            description: 'An alternate blue design for LegacyProfiles.',
            cssFile: '/legacyprofiles/themes/blue/profiles.css',
            author: 'onlypuppy7',
        });
        pluginManager.on('game:onPageLoadedEnd', () => this.setup());
        pluginManager.on('game:setupComplete', () => this.setup());
        pluginManager.on('game:leaveGame', () => this.close());
        pluginManager.on('game:playerClicked', click => {
            if (click.handled) return;
            click.handled = true;
            this.openPlayer(click.playerId, click.uniqueId);
        });
    },

    element(tag, className, text, parent) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        if (parent) parent.appendChild(el);
        return el;
    },

    button(text, color, action, parent) {
        const button = this.element('button', 'ssbutton ' + color, text, parent);
        button.type = 'button';
        button.onclick = action;
        return button;
    },

    setup() {
        if (this.ready) return;
        const logout = document.getElementById('logout');
        if (!logout) return;
        this.ready = true;
        const rebuild = rebuildPlayerList;
        rebuildPlayerList = (...args) => {
            const result = rebuild(...args);
            this.updateRankBadges();
            return result;
        };
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = '/legacyprofiles/profiles.css';
        document.head.appendChild(css);
        this.button('My Profile', 'blue', () => this.openOwn(), logout).id = 'legacyprofilesOwn';
        const stats = document.getElementById('playerStats');
        if (stats) {
            stats.title = 'View your profile';
            stats.style.cursor = 'pointer';
            stats.setAttribute('role', 'button');
            stats.tabIndex = 0;
            stats.onclick = () => this.openOwn();
            stats.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.openOwn(); };
            });
        };
        extern.profiles = this;
    },

    openOwn() {
        if (!playerAccount?.isLoggedIn) return;
        this.open(playerAccount.username, null);
    },

    openPlayer(id, uniqueId) {
        const player = players_by_id[id];
        if (!player || player.uniqueId !== uniqueId) return;
        this.open(Number(uniqueId) > 0 ? player.username : null, { id, uniqueId, player });
    },

    livePlayer() {
        if (!this.target || !inGame) return null;
        const player = players_by_id[this.target.id];
        return player === this.target.player && player.uniqueId === this.target.uniqueId ? player : null;
    },

    async open(username, target) {
        this.close();
        this.previousFocus = document.activeElement;
        this.target = target;
        const generation = ++this.generation;
        if (document.pointerLockElement) document.exitPointerLock();
        if (inGame && me) { me.controlKeys = 0; me.triggerPulled = false; };
        closeAlertDialog();
        this.overlay = this.element('div', 'lp-overlay', undefined, document.body);
        this.overlay.addEventListener('click', event => { if (event.target === this.overlay) this.close(); });
        this.dialog = this.element('section', 'lp-dialog roundedBorder', undefined, this.overlay);
        this.dialog.setAttribute('role', 'dialog');
        this.dialog.setAttribute('aria-modal', 'true');
        this.dialog.setAttribute('aria-label', 'Player profile');
        this.dialog.addEventListener('keydown', event => event.stopPropagation());
        this.dialog.addEventListener('keyup', event => event.stopPropagation());
        const bar = this.element('div', 'lp-bar', undefined, this.dialog);
        this.element('span', 'lp-eyebrow', 'Player Profile', bar);
        this.closeButton = this.button('Close', 'red', () => this.close(), bar);
        this.actions = this.element('div', 'lp-actions', undefined, this.dialog);
        this.renderActions();
        this.content = this.element('div', 'lp-content', undefined, this.dialog);
        this.element('p', 'lp-message', 'Loading player...', this.content).setAttribute('role', 'status');
        this.keyListener = event => {
            if (!this.overlay) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.close(); return; };
            if (event.key === 'Tab') {
                const focusable = [...this.dialog.querySelectorAll('button:not(:disabled), input, select, [tabindex="0"]')].filter(el => el.getClientRects().length);
                const first = focusable[0], last = focusable[focusable.length - 1];
                if (event.shiftKey && (document.activeElement === first || !this.dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); };
            };
        };
        document.addEventListener('keydown', this.keyListener, true);
        this.closeButton.focus();
        this.actionTimer = setInterval(() => this.renderActions(), 750);
        try {
            const profile = username !== null ? await this.request(username) : this.guestProfile();
            if (generation !== this.generation || !this.overlay) return;
            const live = this.livePlayer();
            if (live) {
                profile.loadout.classIdx = live.classIdx;
                profile.loadout.colorIdx = live.shellColor;
                profile.loadout.primaryId[live.classIdx] = live.primaryWeaponItem?.id;
                profile.loadout.secondaryId[live.classIdx] = live.secondaryWeaponItem?.id;
                profile.loadout.hatId = live.hatItem?.id ?? null;
                profile.loadout.stampId = live.stampItem?.id ?? null;
            };
            this.profile = profile;
            this.render();
        } catch (error) {
            if (generation !== this.generation || !this.overlay) return;
            this.content.replaceChildren();
            this.element('h2', '', target?.player.name || 'Player profile', this.content);
            this.element('p', 'lp-message', error.message, this.content).setAttribute('role', 'alert');
            this.button('Try Again', 'blue', () => this.open(username, target), this.content);
        };
    },

    request(username, preferences) {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(servicesServer);
            let done = false;
            const finish = (error, profile) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                socket.close();
                this.cancelRequest = null;
                error ? reject(error) : resolve(profile);
            };
            const timer = setTimeout(() => finish(new Error('The egg took too long. Try again.')), 10000);
            this.cancelRequest = () => finish(new Error('Profile closed.'));
            socket.onopen = () => socket.send(JSON.stringify(preferences === undefined ? { cmd: 'legacyprofilesGet', username } : { cmd: 'legacyprofilesSave', session: playerAccount.session, preferences }));
            socket.onmessage = event => {
                try {
                    const data = JSON.parse(event.data);
                    if (!data.legacyprofiles) return finish(new Error(data.error || 'Player not found.'));
                    finish(null, data.legacyprofiles);
                } catch { finish(new Error('Could not load this player.')); };
            };
            socket.onerror = () => finish(new Error('Could not reach the services server.'));
            socket.onclose = () => { if (!done) finish(new Error('The connection closed. Try again.')); };
        });
    },

    guestProfile() {
        const player = this.target.player;
        const primary = [], secondary = [];
        primary[player.classIdx] = player.primaryWeaponItem?.id;
        secondary[player.classIdx] = player.secondaryWeaponItem?.id;
        return {
            username: null, guest: true,
            rank: { name: 'Guest', value: 0 }, vip: { active: false }, inventory: [],
            loadout: { classIdx: player.classIdx, colorIdx: player.shellColor, primaryId: primary, secondaryId: secondary, hatId: player.hatItem?.id, stampId: player.stampItem?.id },
        };
    },

    renderActions() {
        if (!this.actions) return;
        const player = this.livePlayer();
        const allowed = player && player.id !== meId;
        const boot = allowed && perm.searchPermission('boot', me);
        const key = [!!player, allowed, player?.muted, boot].join(':');
        if (key === this.actionKey) return;
        this.actionKey = key;
        const focused = this.actions.contains(document.activeElement) ? document.activeElement.dataset.profileAction : null;
        this.actions.replaceChildren();
        this.actions.hidden = !this.target;
        if (!this.target) return;
        if (!player) {
            this.element('span', 'lp-muted', 'This player has left the game.', this.actions);
            if (focused) this.closeButton?.focus();
            return;
        };
        this.element('span', 'lp-muted', player.id === meId ? 'This is you!' : 'Player actions', this.actions);
        if (!allowed) return;
        this.button(player.muted ? 'Unmute' : 'Mute', player.muted ? 'blue' : 'orange', () => {
            const current = this.livePlayer();
            if (!current) return this.renderActions();
            mutePlayer(current.id, current.uniqueId);
            this.renderActions();
        }, this.actions).dataset.profileAction = 'mute';
        if (boot) this.button('Boot', 'red', () => {
            const current = this.livePlayer();
            if (current && perm.searchPermission('boot', me)) { bootPlayer(current.id, current.username); this.close(); };
        }, this.actions).dataset.profileAction = 'boot';
        if (focused) this.actions.querySelector('[data-profile-action="' + focused + '"]')?.focus();
    },

    number(value) { return Math.max(0, Number(value) || 0).toLocaleString(); },
    ratio(kills, deaths) { return (Math.max(0, Number(kills) || 0) / Math.max(1, Number(deaths) || 0)).toFixed(2); },

    rankIcon(profile) {
        if (profile.guest) return 'guest';
        const name = (profile.rank?.name || '').toLowerCase();
        if (name.includes('developer')) return 'developer';
        if (name.includes('twitch')) return 'twitch';
        if (name.includes('tiktok')) return 'tiktok';
        const rank = Number(profile.rank?.value) || 0;
        if (rank >= 255) return 'owner';
        if (rank >= 20) return 'admin';
        if (rank >= 10) return 'mod';
        if (rank >= 5) return 'creator';
        return 'player';
    },

    roleBadge(profile, parent) {
        const badge = this.element('span', 'lp-role-icon', undefined, parent);
        badge.title = profile.rank.name;
        badge.setAttribute('role', 'img');
        badge.setAttribute('aria-label', profile.rank.name);
        badge.style.setProperty('--lp-role-icon', 'url("/legacyprofiles/icons/roles/' + this.rankIcon(profile) + '.svg")');
        return badge;
    },

    updateRankBadges() {
        const list = document.getElementById('playerList');
        if (!list) return;
        const players = [];
        iteratePlayers(player => players.push(player));
        const teams = gameOptions.teamsEnabled ? getTeamScores().score : null;
        const score = player => player.score + (teams ? teams[player.team] + (player.team === lastLeadingTeam ? 1e5 : 0) : 0);
        players.sort((a, b) => score(b) - score(a));
        for (let i = 0; i < list.children.length; i++) {
            const row = list.children[i];
            const current = row.querySelector('.lp-rank-badge');
            const player = players[i];
            if (!player) { current?.remove(); continue; };
            row.classList.add('lp-ranked-player');
            const guest = !(Number(player.uniqueId) > 0);
            const rank = guest ? { name: 'Guest', value: 0 } : profileRank(player.adminRoles, permissions.ranks);
            const key = [guest, rank.value, rank.name].join(':');
            if (current?.dataset.rank === key) continue;
            current?.remove();
            const badge = this.roleBadge({ guest, rank }, null);
            badge.classList.add('lp-rank-badge');
            badge.dataset.rank = key;
            row.appendChild(badge);
        };
    },

    render() {
        const profile = this.profile;
        this.viewClassIdx = this.initialClass();
        this.content.replaceChildren();
        const hero = this.element('div', 'lp-hero', undefined, this.content);
        const stage = this.element('div', 'lp-stage', undefined, hero);
        const previewCanvas = this.element('canvas', 'lp-avatar', undefined, stage);
        previewCanvas.setAttribute('aria-label', '3D equipped loadout. Drag to rotate, scroll to zoom.');
        const previewMessage = this.element('span', 'lp-preview-message', 'Loading egg...', stage);
        this.element('span', 'lp-stage-hint', 'Drag to rotate', stage);
        if (this.isOwn()) this.editButton('Edit egg angle and featured class', () => this.editPreview(stage), stage);
        const summary = this.element('div', 'lp-summary', undefined, hero);
        this.element('span', 'lp-eyebrow', this.target ? 'In This Game' : 'Your Account', summary);
        const nickname = this.target?.player.name || (this.isOwn() ? document.getElementById('nickname')?.value : null) || profile.username;
        this.element('h1', '', profile.username ? '@' + profile.username : nickname, summary);
        if (profile.username && nickname !== profile.username) this.element('p', 'lp-username', 'Nickname: ' + nickname, summary);
        else if (!profile.username) this.element('p', 'lp-username', 'Guest player', summary);
        const tags = this.element('div', 'lp-tags', undefined, summary);
        const role = this.element('span', 'lp-tag', undefined, tags);
        const roleIcon = this.roleBadge(profile, role);
        roleIcon.setAttribute('aria-hidden', 'true');
        this.element('span', '', profile.rank.name, role);
        if (this.target?.player.isGameOwner) this.element('span', 'lp-tag', 'Game Owner', tags);
        if (profile.vip.active) {
            const vip = this.element('span', 'lp-tag lp-vip', undefined, tags);
            const image = this.element('img', '', undefined, vip);
            image.src = 'img/ico_chickenBadge.png';
            image.alt = '';
            this.element('span', '', 'VIP', vip);
            vip.title = 'VIP until ' + new Date(profile.vip.expires * 1000).toLocaleString();
        };
        if (profile.guest) this.element('p', 'lp-muted', 'Guest players do not have saved stats or an inventory.', summary);
        else {
            const joined = profile.joined ? new Date(profile.joined * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown';
            this.element('p', 'lp-joined', 'Joined ' + joined, summary);
            const stats = this.element('div', 'lp-stats', undefined, summary);
            for (const [label, value] of [['Kills', this.number(profile.kills)], ['Deaths', this.number(profile.deaths)], ['KDR', this.ratio(profile.kills, profile.deaths)], ['Best Streak', this.number(profile.streak)]]) {
                this.stat(stats, label, value);
            };
            const balance = this.element('div', 'lp-balance', undefined, summary);
            const egg = this.element('img', '', undefined, balance);
            egg.src = 'img/egg_icon.png'; egg.alt = '';
            this.element('strong', '', this.number(profile.eggs), balance);
            this.element('span', '', 'eggs', balance);
            this.element('span', 'lp-muted lp-spent', this.number(profile.eggsSpent) + ' spent', balance);
        };
        this.tabs = this.element('div', 'lp-tabs', undefined, this.content);
        this.tabs.setAttribute('role', 'tablist');
        this.pane = this.element('div', 'lp-pane', undefined, this.content);
        this.pane.setAttribute('role', 'tabpanel');
        this.tab('Loadout', 'loadout', container => this.renderLoadout(container));
        if (!profile.guest) this.tab('Inventory (' + profile.inventory.length + ')', 'inventory', container => this.renderInventory(container));
        for (const [id, section] of this.sections) this.tab(section.label, id, container => section.render(profile, container));
        this.selectTab('loadout');
        this.preview = new LegacyProfilePreview(previewCanvas, { ...profile, loadout: { ...profile.loadout, classIdx: this.viewClassIdx } },
            () => { previewMessage.hidden = true; },
            error => { previewMessage.textContent = '3D preview unavailable'; console.warn('LegacyProfiles preview:', error); });
        this.plugins.emit('legacyprofilesViewed', { profile, container: this.content });
    },

    isOwn() { return !this.profile?.guest && playerAccount?.isLoggedIn && this.profile?.username === playerAccount.username; },

    initialClass() {
        const featured = this.profile.preferences?.classIdx;
        return this.loadoutClasses().includes(featured) ? featured : this.profile.loadout.classIdx;
    },

    className(index) {
        return (typeof classes !== 'undefined' && classes[index]?.name) || ['Soldier', 'Scrambler', 'Ranger', 'Eggsploder'][index] || 'Class ' + (index + 1);
    },

    editButton(label, action, parent) {
        const button = this.button('✎', 'blue', action, parent);
        button.classList.add('lp-edit');
        button.title = label; button.setAttribute('aria-label', label);
        return button;
    },

    async savePreferences(changes, errorLabel) {
        const profile = this.profile, generation = this.generation;
        if (!this.isOwn() || this.savingPreferences) return false;
        this.savingPreferences = true;
        try {
            const saved = await this.request(profile.username, { yaw: 0, pitch: 0, classIdx: null, featuredItems: [], ...profile.preferences, ...changes });
            if (generation !== this.generation || this.profile !== profile) return false;
            profile.preferences = saved.preferences;
            return true;
        } catch (error) {
            if (generation === this.generation && errorLabel.isConnected) errorLabel.textContent = error.message;
            return false;
        } finally { this.savingPreferences = false; };
    },

    editPreview(stage) {
        if (this.savingPreferences) return;
        if (stage.querySelector('.lp-preview-editor') || !this.preview) return;
        const preview = this.preview;
        const before = { yaw: preview.yaw, pitch: preview.pitch, classIdx: this.viewClassIdx };
        const editor = this.element('div', 'lp-preview-editor', undefined, stage);
        this.element('span', '', 'Drag your egg to set its angle.', editor);
        const row = this.element('div', 'lp-edit-controls', undefined, editor);
        const select = this.element('select', 'ss_select', undefined, row);
        select.setAttribute('aria-label', 'Featured class');
        for (const index of this.loadoutClasses()) {
            const option = this.element('option', '', this.className(index), select);
            option.value = index;
        };
        select.value = this.viewClassIdx;
        select.onchange = () => { this.viewClassIdx = Number(select.value); this.showPreviewClass(this.viewClassIdx); };
        const error = this.element('span', 'lp-edit-error', '', editor);
        error.setAttribute('role', 'status');
        const finish = () => {
            this.cancelPreviewEdit = null;
            editor.remove();
            if (this.tabs.querySelector('[data-section="loadout"][aria-selected="true"]')) this.selectTab('loadout');
        };
        const save = this.button('Save', 'green', async () => {
            save.disabled = cancel.disabled = reset.disabled = select.disabled = true;
            const ok = await this.savePreferences({ yaw: preview.yaw, pitch: preview.pitch, classIdx: Number(select.value) }, error);
            if (ok) { preview.setAngle(this.profile.preferences.yaw, this.profile.preferences.pitch); finish(); }
            else save.disabled = cancel.disabled = reset.disabled = select.disabled = false;
        }, row);
        const cancel = this.button('Cancel', 'red', () => this.cancelPreviewEdit(), row);
        this.cancelPreviewEdit = () => {
            preview.setAngle(before.yaw, before.pitch);
            this.viewClassIdx = before.classIdx;
            this.showPreviewClass(before.classIdx); finish();
        };
        const reset = this.button('Reset', 'blue', () => preview.setAngle(0, 0), row);
    },

    editFeatured() {
        if (!this.isOwn() || this.savingPreferences) return;
        this.cancelPreviewEdit?.();
        this.featuredDraft = [...(this.profile.preferences?.featuredItems || [])];
        this.selectTab('inventory');
    },

    stat(parent, label, value) {
        const box = this.element('div', 'lp-stat', undefined, parent);
        this.element('strong', '', value, box).title = value;
        this.element('span', '', label, box);
    },

    tab(label, id, render) {
        const button = this.button(label, '', () => this.selectTab(id), this.tabs);
        button.className = 'ssbutton blue lp-tab';
        button.dataset.section = id;
        button.id = 'lp-tab-' + id;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', 'lp-pane');
        button.renderPane = render;
        button.onkeydown = event => {
            const buttons = [...this.tabs.children];
            let index = buttons.indexOf(button);
            if (event.key === 'ArrowRight') index = (index + 1) % buttons.length;
            else if (event.key === 'ArrowLeft') index = (index + buttons.length - 1) % buttons.length;
            else if (event.key === 'Home') index = 0;
            else if (event.key === 'End') index = buttons.length - 1;
            else return;
            event.preventDefault(); buttons[index].click(); buttons[index].focus();
        };
    },

    selectTab(id) {
        if (id !== 'inventory') this.featuredDraft = null;
        this.tileGeneration = (this.tileGeneration || 0) + 1;
        for (const button of this.tabs.children) {
            const active = button.dataset.section === id;
            button.classList.toggle('orange', active);
            button.classList.toggle('blue', !active);
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
            if (active) {
                this.pane.replaceChildren();
                this.pane.id = 'lp-pane';
                this.pane.setAttribute('aria-labelledby', button.id);
                button.renderPane(this.pane);
            };
        };
    },

    equippedIds(classIdx = this.profile.loadout.classIdx) {
        const loadout = this.profile.loadout;
        return [loadout.primaryId[classIdx], loadout.secondaryId[classIdx], loadout.hatId, loadout.stampId];
    },

    loadoutClasses() {
        return this.profile.loadout.primaryId.reduce((classes, id, index) => {
            if (catalog.findItemById(id)?.item_type_id === ItemType.Primary) classes.push(index);
            return classes;
        }, []);
    },

    cycleLoadout(direction, container) {
        if (this.cancelPreviewEdit) return;
        const classes = this.loadoutClasses();
        if (classes.length < 2) return;
        this.viewClassIdx = classes[(classes.indexOf(this.viewClassIdx) + direction + classes.length) % classes.length];
        this.tileGeneration++;
        container.replaceChildren();
        this.renderLoadout(container);
        container.querySelector('[data-lp-direction="' + direction + '"]')?.focus();
        this.showPreviewClass(this.viewClassIdx);
    },

    async showPreviewClass(classIdx) {
        const preview = this.preview;
        const message = this.content.querySelector('.lp-preview-message');
        if (!preview) return;
        try {
            await preview.ready;
            if (this.preview !== preview || preview.dead || this.viewClassIdx !== classIdx) return;
            message.textContent = 'Loading weapon...'; message.hidden = false;
            await preview.setWeapon(catalog.findItemById(this.profile.loadout.primaryId[classIdx]));
            if (this.preview === preview && this.viewClassIdx === classIdx) message.hidden = true;
        } catch (error) {
            if (this.preview !== preview || this.viewClassIdx !== classIdx) return;
            message.textContent = '3D preview unavailable'; message.hidden = false;
            console.warn('LegacyProfiles weapon:', error);
        };
    },

    renderLoadout(container) {
        const loadout = this.profile.loadout;
        const classIdx = this.viewClassIdx ?? loadout.classIdx;
        const featured = (this.profile.preferences?.featuredItems || []).map(id => catalog.findItemById(id)).filter(Boolean);
        const split = featured.length || this.isOwn();
        const layout = this.element('div', split ? 'lp-showcase' : '', undefined, container);
        const equipped = this.element('div', split ? 'lp-compact-loadout' : '', undefined, layout);
        const heading = this.element('div', 'lp-loadout-heading', undefined, equipped);
        if (this.loadoutClasses().length > 1) {
            for (const [direction, text, label] of [[-1, '‹', 'Previous loadout'], [1, '›', 'Next loadout']]) {
                const arrow = this.button(text, 'blue', () => this.cycleLoadout(direction, container), heading);
                arrow.classList.add('lp-loadout-arrow');
                arrow.dataset.lpDirection = direction;
                arrow.setAttribute('aria-label', label); arrow.title = label;
            };
        };
        this.element('h2', '', this.className(classIdx) + "'s Loadout", heading).setAttribute('aria-live', 'polite');
        const grid = this.element('div', 'lp-loadout', undefined, equipped);
        this.equippedIds(classIdx).forEach((id, index) => {
            if (index === 2) this.element('div', 'lp-loadout-divider', undefined, grid).setAttribute('aria-hidden', 'true');
            this.itemCard(catalog.findItemById(id), ['Primary', 'Secondary', 'Hat', 'Stamp'][index], grid);
        });
        if (split) {
            const section = this.element('div', 'lp-featured', undefined, layout);
            this.element('h2', '', 'Favourite Items', section);
            if (this.isOwn()) this.editButton('Choose favourite items', () => this.editFeatured(), section);
            const items = this.element('div', 'lp-featured-grid', undefined, section);
            for (const item of featured) {
                const card = this.itemCard(item, 'Favourite', items);
                card.removeAttribute('title');
            };
            if (!featured.length) this.element('p', 'lp-muted', 'Pick up to six favourites from your inventory.', section);
        };
        if (this.target) {
            const player = this.livePlayer();
            if (player) {
                this.element('h2', '', 'This Game', container);
                const stats = this.element('div', 'lp-match-stats', undefined, container);
                this.stat(stats, 'Kills', this.number(player.totalKills));
                this.stat(stats, 'Deaths', this.number(player.totalDeaths));
                this.stat(stats, 'KDR', this.ratio(player.totalKills, player.totalDeaths));
                this.stat(stats, 'Best Streak', this.number(player.bestGameStreak));
            };
        };
    },

    itemCard(item, label, parent) {
        const card = this.element('div', 'lp-item itemButton', undefined, parent);
        if (label) this.element('span', 'lp-item-type', label, card);
        if (item) {
            card.title = item.name;
            const canvas = this.element('canvas', '', undefined, card);
            canvas.width = 256; canvas.height = 256;
            canvas.setAttribute('aria-label', item.name);
            const token = this.tileGeneration;
            requestAnimationFrame(() => {
                if (!canvas.isConnected || token !== this.tileGeneration) return;
                try {
                    if (item.item_type_id === ItemType.Stamp) itemRenderer.renderStampToCanvas(item, canvas);
                    else itemRenderer.renderToCanvas(item.item_data.meshName, canvas, { radius: item.item_type_id === ItemType.Secondary ? 1 : 1.3, primaryGun: item.item_type_id === ItemType.Primary, secondaryGun: item.item_type_id === ItemType.Secondary });
                } catch (error) { console.warn('LegacyProfiles item:', error); };
            });
            this.element('span', 'lp-item-name', item.name, card);
            if (!label && this.equippedIds().includes(item.id)) {
                card.classList.add('itemButtonSelected');
                this.element('span', 'lp-equipped', 'Equipped', card);
            };
        } else {
            this.element('span', 'lp-no-item', '—', card);
            this.element('span', 'lp-item-name', 'None', card);
        };
        return card;
    },

    moveFavourite(from, to) {
        const draft = this.featuredDraft;
        if (this.savingPreferences || !draft || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= draft.length || to >= draft.length || from === to) return false;
        draft.splice(to, 0, draft.splice(from, 1)[0]);
        return true;
    },

    renderFavouriteStrip(strip, refresh) {
        strip.replaceChildren();
        let draggedId = null;
        this.featuredDraft.forEach((id, index) => {
            const item = catalog.findItemById(id);
            const slot = this.element('div', 'lp-favourite-slot', undefined, strip);
            slot.dataset.favouriteId = id;
            slot.tabIndex = 0;
            slot.setAttribute('role', 'button');
            slot.setAttribute('aria-label', 'Remove favourite ' + (index + 1) + ': ' + (item?.name || 'Item'));
            slot.draggable = !this.savingPreferences;
            const card = this.itemCard(item, 'Favourite', slot);
            card.removeAttribute('title');
            const tooltip = this.element('span', 'lp-favourite-tooltip', item?.name || 'Item', slot);
            tooltip.id = 'lp-favourite-tip-' + index;
            tooltip.setAttribute('role', 'tooltip');
            slot.setAttribute('aria-describedby', tooltip.id);
            const update = () => {
                refresh();
                strip.querySelector('[data-favourite-id="' + id + '"]')?.focus();
            };
            const remove = () => {
                if (this.savingPreferences || Date.now() < (strip.draggedUntil || 0)) return;
                this.featuredDraft.splice(index, 1);
                refresh();
                strip.querySelector('.lp-favourite-slot')?.focus();
            };
            slot.onclick = remove;
            slot.onkeydown = event => {
                if (['Enter', ' ', 'Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); remove(); }
                else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    if (this.moveFavourite(index, index + (event.key === 'ArrowLeft' ? -1 : 1))) update();
                };
            };
            slot.ondragstart = event => {
                if (this.savingPreferences) { event.preventDefault(); return; };
                draggedId = id;
                strip.draggedUntil = Infinity;
                strip.dataset.dragging = 'true';
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(id));
            };
            slot.ondragover = event => { if (draggedId !== null && !this.savingPreferences) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }; };
            slot.ondrop = event => {
                event.preventDefault();
                strip.draggedUntil = Date.now() + 250;
                strip.dataset.dragging = 'false';
                if (draggedId !== null && this.moveFavourite(this.featuredDraft.indexOf(draggedId), index)) update();
                draggedId = null;
            };
            slot.ondragend = () => { draggedId = null; strip.draggedUntil = Date.now() + 250; strip.dataset.dragging = 'false'; };
        });
        for (let index = this.featuredDraft.length; index < 6; index++) this.element('span', 'lp-favourite-empty', String(index + 1), strip).setAttribute('aria-hidden', 'true');
    },

    renderInventory(container) {
        const items = this.profile.inventory.map(id => catalog.findItemById(id)).filter(Boolean);
        let count, save, cancel, editError, strip;
        if (this.featuredDraft) {
            const editing = this.element('div', 'lp-featured-editor', undefined, container);
            count = this.element('span', '', 'Favourite Items ' + this.featuredDraft.length + '/6', editing);
            this.element('span', 'lp-favourite-hint', 'Drag to reorder · Click to remove', editing);
            editError = this.element('span', 'lp-edit-error', '', editing);
            editError.setAttribute('role', 'status');
            save = this.button('Save', 'green', async () => {
                save.disabled = cancel.disabled = true;
                const draft = [...this.featuredDraft];
                if (await this.savePreferences({ featuredItems: draft }, editError)) this.selectTab('loadout');
                else save.disabled = cancel.disabled = false;
            }, editing);
            cancel = this.button('Cancel', 'red', () => this.selectTab('loadout'), editing);
            strip = this.element('div', 'lp-favourite-strip', undefined, container);
            strip.setAttribute('aria-label', 'Selected favourites');
        };
        const controls = this.element('div', 'lp-inventory-controls', undefined, container);
        const search = this.element('input', 'textInput', undefined, controls);
        search.type = 'search'; search.placeholder = 'Find an item...'; search.setAttribute('aria-label', 'Search inventory');
        const filter = this.element('select', 'ss_select', undefined, controls);
        filter.setAttribute('aria-label', 'Inventory category');
        const addOption = (value, label, parent) => {
            const count = items.filter(item => this.matchesInventory(item, String(value), '')).length;
            const option = this.element('option', '', label + ' [' + count + ']', parent);
            option.value = value;
        };
        for (const [value, label] of [[0, 'All Items'], [3, 'Primary'], [4, 'Secondary'], [1, 'Hats'], [2, 'Stamps']]) {
            addOption(value, label, filter);
        };
        const weapons = this.element('optgroup', '', undefined, filter);
        weapons.label = 'Weapons';
        const names = { Eggk47: 'Soldier', DozenGauge: 'Scrambler', CSG1: 'Ranger', RPEGG: 'Eggsploder', Cluck9mm: 'Cluck 9mm' };
        const types = new Set([...catalog.primaryWeapons, ...catalog.secondaryWeapons].map(item => item.item_data?.class).filter(Boolean));
        for (const type of types) {
            const weapon = catalog.primaryWeapons.find(item => item.item_data?.class === type);
            const name = Number.isInteger(weapon?.exclusive_for_class) ? this.className(weapon.exclusive_for_class) : names[type] || type;
            addOption('weapon:' + type, name, weapons);
        };
        const grid = this.element('div', 'lp-inventory', undefined, container);
        const footer = this.element('div', 'lp-inventory-footer', undefined, container);
        let page = 0;
        const previous = this.button('Previous', 'blue', () => { page--; draw(); }, footer);
        const counter = this.element('span', 'lp-muted', '', footer);
        counter.setAttribute('aria-live', 'polite');
        const next = this.button('Next', 'blue', () => { page++; draw(); }, footer);
        const draw = () => {
            this.tileGeneration++;
            if (strip) {
                count.textContent = 'Favourite Items ' + this.featuredDraft.length + '/6';
                this.renderFavouriteStrip(strip, draw);
            };
            const query = search.value.trim().toLocaleLowerCase();
            const visible = items.filter(item => this.matchesInventory(item, filter.value, query));
            const pages = Math.max(1, Math.ceil(visible.length / 24));
            page = Math.max(0, Math.min(page, pages - 1));
            grid.replaceChildren();
            visible.slice(page * 24, (page + 1) * 24).forEach(item => {
                const card = this.itemCard(item, this.featuredDraft ? 'Choose item' : null, grid);
                if (!this.featuredDraft) return;
                const index = this.featuredDraft.indexOf(item.id);
                if (index >= 0) {
                    card.classList.add('itemButtonSelected');
                    this.element('span', 'lp-equipped', 'Favourite ' + (index + 1), card);
                };
                card.setAttribute('role', 'button'); card.tabIndex = 0;
                card.setAttribute('aria-pressed', index >= 0 ? 'true' : 'false');
                card.onclick = () => {
                    if (save.disabled) return;
                    if (index >= 0) this.featuredDraft.splice(index, 1);
                    else if (this.featuredDraft.length < 6) this.featuredDraft.push(item.id);
                    else { editError.textContent = 'Remove an item before adding another. Six is the limit!'; return; };
                    editError.textContent = '';
                    count.textContent = 'Favourite Items ' + this.featuredDraft.length + '/6';
                    draw();
                    [...grid.children].find(el => el.title === item.name)?.focus();
                };
                card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); }; };
            });
            if (!visible.length) this.element('p', 'lp-message', 'No items found.', grid);
            previous.disabled = page === 0; next.disabled = page >= pages - 1;
            counter.textContent = visible.length + (visible.length === 1 ? ' item · ' : ' items · ') + (page + 1) + ' / ' + pages;
        };
        search.oninput = filter.onchange = () => { page = 0; draw(); };
        draw();
    },

    matchesInventory(item, filter, query) {
        const category = filter.startsWith('weapon:')
            ? [ItemType.Primary, ItemType.Secondary].includes(item.item_type_id) && item.item_data?.class === filter.slice(7)
            : !Number(filter) || item.item_type_id === Number(filter);
        return category && item.name.toLocaleLowerCase().includes(query);
    },

    registerSection(id, section) {
        if (!/^[a-z][a-z0-9_-]*$/.test(id) || ['loadout', 'inventory'].includes(id) || typeof section.render !== 'function') throw new Error('Invalid profile section');
        this.sections.set(id, section);
    },

    close() {
        this.cancelPreviewEdit = null;
        this.featuredDraft = null;
        this.generation++;
        this.tileGeneration = (this.tileGeneration || 0) + 1;
        this.cancelRequest?.();
        this.preview?.dispose(); this.preview = null;
        clearInterval(this.actionTimer);
        if (this.keyListener) {
            document.removeEventListener('keydown', this.keyListener, true);
        };
        this.overlay?.remove(); this.overlay = null;
        this.actions = null; this.actionKey = null;
        if (this.previousFocus?.isConnected) this.previousFocus.focus();
        this.previousFocus = null;
    },
};

if (isClient) LegacyProfiles.registerListeners(plugins);
