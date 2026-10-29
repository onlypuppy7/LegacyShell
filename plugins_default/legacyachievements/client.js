export const LegacyAchievements = {
    queued: new Set(),
    queue: [],
    requests: new Map(),
    nextRequest: 0,
    tooltipIcons: new Set(),

    registerListeners(plugins) {
        plugins.on('game:onPageLoadedEnd', () => this.setup());
        plugins.on('game:setupComplete', () => this.setup());
        plugins.on('game:legacyprofilesViewed', ({ profile }) => this.profileViewed(profile));
    },

    setup() {
        if (this.ready) return;
        this.ready = true;
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = '/legacyachievements/achievements.css';
        document.head.appendChild(css);
        if (typeof LegacyProfiles !== 'undefined') LegacyProfiles.registerSection('achievements', {
            label: 'Achievements 0/' + this.total(), render: (profile, container) => this.render(profile, container),
        });
        this.tooltipObserver = new MutationObserver(() => this.clearTooltips());
        this.observeTooltips();
        this.timer = setInterval(() => this.tick(), 1000);
        this.tick();
    },

    tick() {
        const key = playerAccount?.isLoggedIn && playerAccount.session ? playerAccount.username + '\n' + playerAccount.session : '';
        if (key !== this.key) {
            this.stop();
            this.key = key;
            this.state = null;
            this.queue = []; this.queued.clear();
            clearTimeout(this.popupTimer); this.popup?.remove(); this.popup = null;
        };
        if (!key || this.socket || Date.now() < (this.retryAt || 0)) return;
        const socket = this.socket = new WebSocket(servicesServer);
        socket.onopen = () => {
            if (this.socket !== socket) return;
            socket.send(JSON.stringify({ cmd: 'achievementsWatch', session: playerAccount.session }));
        };
        socket.onmessage = event => {
            if (this.socket !== socket || this.key !== key) return;
            try {
                const message = JSON.parse(event.data), data = message.legacyachievements;
                if (!data) return;
                const request = this.requests.get(message.requestId);
                if (request) {
                    clearTimeout(request.timer); this.requests.delete(message.requestId);
                    data.type === 'error' ? request.reject(new Error(data.message)) : request.resolve(data);
                };
                if (data.type === 'snapshot' || data.type === 'claimed') this.receive(data);
                else if (data.type === 'error' && !request) { console.warn('LegacyAchievements:', data.message); socket.close(); };
            } catch (error) { console.warn('LegacyAchievements:', error); };
        };
        socket.onerror = () => socket.close();
        socket.onclose = () => {
            if (this.socket !== socket) return;
            this.socket = null; this.retryAt = Date.now() + 10000;
            this.rejectRequests('Achievements disconnected. Try again.');
        };
    },

    rejectRequests(message) {
        for (const request of this.requests.values()) { clearTimeout(request.timer); request.reject(new Error(message)); };
        this.requests.clear();
    },

    stop() {
        const socket = this.socket;
        this.socket = null; this.retryAt = 0;
        socket?.close();
        this.rejectRequests('Account changed. Try again.');
    },

    request(cmd, data = {}) {
        return new Promise((resolve, reject) => {
            if (this.socket?.readyState !== 1) return reject(new Error('Achievements are reconnecting. Try again in a moment.'));
            if (cmd === 'achievementsFeature' && !Array.isArray(this.state?.featured)) return reject(new Error('Display pins need the updated services server. Restart services, then reopen your profile.'));
            const requestId = 'achievement-' + ++this.nextRequest;
            const timer = setTimeout(() => { this.requests.delete(requestId); reject(new Error('The egg took too long. Try again.')); }, 10000);
            this.requests.set(requestId, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ cmd, ...data, requestId, session: playerAccount.session }));
        });
    },

    receive(data) {
        if (data.username !== playerAccount.username) return;
        this.state = data;
        if (Number.isFinite(data.kills)) {
            playerAccount.kills = data.kills;
            if (typeof updatePlayerStatsDisplay === 'function') updatePlayerStatsDisplay();
            if (typeof LegacyProfiles !== 'undefined' && LegacyProfiles.profile?.username === data.username) {
                LegacyProfiles.profile.kills = data.kills;
                const stats = LegacyProfiles.content?.querySelectorAll('.lp-stats strong');
                if (stats?.length === 4) {
                    stats[0].textContent = data.kills.toLocaleString();
                    stats[2].textContent = LegacyProfiles.ratio(data.kills, LegacyProfiles.profile.deaths);
                };
            };
        };
        if (data.type === 'claimed') this.applyReward(data.account);
        for (const id of data.pending) {
            if (this.queued.has(id)) continue;
            const achievement = data.achievements.find(entry => entry.id === id);
            if (!achievement || achievement.claimedAt) continue;
            this.queued.add(id); this.queue.push(achievement);
        };
        this.showNext();
        if (typeof LegacyProfiles !== 'undefined' && (!LegacyProfiles.overlay || LegacyProfiles.profile?.username === data.username)) this.updateCount(data);
        if (typeof LegacyProfiles !== 'undefined' && LegacyProfiles.overlay && LegacyProfiles.profile?.username === data.username) this.drawCase(LegacyProfiles.profile, data);
        this.refreshPane();
    },

    total() { return typeof AchievementDefinitions === 'undefined' ? this.state?.achievements.length || 0 : AchievementDefinitions.length; },

    updateCount(data) {
        if (typeof LegacyProfiles === 'undefined') return;
        const unlocked = data?.achievements.filter(entry => entry.unlockedAt).length || 0;
        const label = 'Achievements ' + unlocked + '/' + (data?.achievements.length ?? this.total());
        const section = LegacyProfiles.sections?.get('achievements');
        if (section) section.label = label;
        const button = LegacyProfiles.tabs?.querySelector('[data-section="achievements"]');
        if (button) button.textContent = label;
    },

    profileViewed(profile) {
        this.jumpTo = null;
        this.pinDraft = null;
        this.drawCase(profile, this.state?.username === profile.username ? this.state : null);
        const own = playerAccount?.isLoggedIn && profile.username === playerAccount.username;
        this.updateCount(own && this.state?.username === profile.username ? this.state : null);
        this.profileRequest = null;
        if (profile.guest || own) return;
        const request = this.profileRequest = { profile, promise: this.publicList(profile.username) };
        request.promise.then(data => {
            if (LegacyProfiles.overlay && LegacyProfiles.profile === profile) { this.updateCount(data); this.drawCase(profile, data); };
        }).catch(() => { if (this.profileRequest === request) this.profileRequest = null; });
    },

    pin(achievement, parent) {
        const pin = this.element('button', 'la-pin', undefined, parent);
        pin.type = 'button';
        pin.setAttribute('aria-label', achievement.name);
        pin.dataset.category = (achievement.category || 'Other').toLowerCase();
        pin.dataset.art = (achievement.image || '').split('/').pop();
        this.element('span', 'la-ribbon', undefined, pin);
        const art = this.element('span', 'la-pin-art', undefined, pin);
        this.image(achievement, art);
        const numeral = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][achievement.tier - 1];
        if (achievement.tier) this.element('span', 'la-pin-tier', numeral || String(achievement.tier), pin);
        const tip = this.element('span', 'la-pin-tooltip', achievement.name, pin);
        this.element('span', 'la-pin-category', achievement.category || 'Other', tip);
        tip.setAttribute('role', 'tooltip');
        return pin;
    },

    drawCase(profile, data) {
        if (typeof LegacyProfiles === 'undefined' || LegacyProfiles.profile !== profile) return;
        const summary = LegacyProfiles.content?.querySelector('.lp-summary');
        this.caseResize?.disconnect(); this.caseHost?.remove(); this.caseHost = null;
        if (!summary || profile.guest) return;
        const own = playerAccount?.isLoggedIn && profile.username === playerAccount.username;
        const selected = (data?.featured || []).map(id => data.achievements.find(entry => entry.id === id && entry.unlockedAt)).filter(Boolean);
        if (!selected.length && !own) return;
        const host = this.caseHost = this.element('div', 'la-showcase', undefined, summary);
        host.setAttribute('aria-label', 'Featured achievements');
        for (const achievement of selected) this.pin(achievement, host).onclick = () => this.openAchievement(profile, achievement.id);
        if (own) {
            const edit = LegacyProfiles.editButton('Choose achievement pins', () => {
                if (this.pinSaving) return;
                this.pinDraft = [...(data?.featured || [])];
                LegacyProfiles.selectTab('achievements');
            }, host);
            edit.classList.add('la-case-edit');
        };
        const fit = () => {
            if (!host.isConnected) return;
            const heading = summary.querySelector('h1'), stats = summary.querySelector('.lp-stats');
            if (!heading || !stats) return;
            const box = summary.getBoundingClientRect(), top = heading.getBoundingClientRect().bottom + 3;
            let occupied = box.left;
            for (const selector of ['.lp-username', '.lp-tags', '.lp-joined']) {
                const el = summary.querySelector(selector);
                if (!el) continue;
                const range = document.createRange(); range.selectNodeContents(el);
                occupied = Math.max(occupied, range.getBoundingClientRect().right);
            };
            const width = Math.max(0, Math.min(box.width * .46, box.right - occupied - 10));
            const height = Math.max(0, stats.getBoundingClientRect().top - top - 5);
            host.style.top = top - box.top + 'px'; host.style.width = width + 'px'; host.style.height = height + 'px';
            host.hidden = width < 66 || height < 30;
        };
        this.caseResize = new ResizeObserver(fit); this.caseResize.observe(summary); fit();
    },

    movePin(from, to) {
        if (this.pinSaving || !this.pinDraft || from < 0 || to < 0 || from >= this.pinDraft.length || to >= this.pinDraft.length || from === to) return false;
        this.pinDraft.splice(to, 0, this.pinDraft.splice(from, 1)[0]);
        return true;
    },

    shortDate(timestamp) {
        const date = new Date(timestamp * 1000);
        return [String(date.getDate()).padStart(2, '0'), String(date.getMonth() + 1).padStart(2, '0'), date.getFullYear()].join('/');
    },

    openAchievement(profile, id) {
        if (LegacyProfiles.profile !== profile) return;
        this.filters = { username: profile.username, search: '', category: '', status: '' };
        this.jumpTo = { profile, id };
        LegacyProfiles.selectTab('achievements');
    },

    scrollToAchievement(view) {
        if (this.jumpTo?.profile !== view.profile) return;
        const row = [...view.list.querySelectorAll('.la-row')].find(row => row.dataset.achievement === this.jumpTo.id);
        if (!row) return;
        this.jumpTo = null;
        row.tabIndex = -1;
        row.dataset.pinTarget = 'true';
        row.onblur = () => { delete row.dataset.pinTarget; row.removeAttribute('tabindex'); };
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },

    pinEditor(profile, data, container) {
        if (!playerAccount?.isLoggedIn || profile.username !== playerAccount.username) return;
        const bar = this.element('div', 'la-pin-editor', undefined, container);
        if (!this.pinDraft) {
            const edit = this.element('button', 'ssbutton blue', 'Choose Pins', bar);
            edit.onclick = () => { this.pinDraft = [...(data.featured || [])]; this.render(profile, container); };
            return;
        };
        this.element('strong', '', 'Display Pins ' + this.pinDraft.length + '/' + AchievementMaxPins, bar);
        this.element('span', 'la-pin-hint', 'Drag to reorder · Click to remove', bar);
        const error = this.element('span', 'la-error', '', bar);
        error.setAttribute('role', 'status');
        const save = this.element('button', 'ssbutton green', 'Save', bar);
        const cancel = this.element('button', 'ssbutton red', 'Cancel', bar);
        save.onclick = async () => {
            if (this.pinSaving) return;
            this.pinSaving = save.disabled = cancel.disabled = true;
            try {
                await this.request('achievementsFeature', { pins: [...this.pinDraft] });
                if (LegacyProfiles.profile === profile && container.isConnected) { this.pinDraft = null; this.render(profile, container); };
            } catch (problem) { if (error.isConnected) error.textContent = problem.message; }
            finally { this.pinSaving = save.disabled = cancel.disabled = false; };
        };
        cancel.onclick = () => { this.pinDraft = null; this.render(profile, container); };
        const strip = this.element('div', 'la-pin-strip', undefined, container);
        let dragged = null;
        this.pinDraft.forEach((id, index) => {
            const achievement = data.achievements.find(entry => entry.id === id);
            if (!achievement) return;
            const pin = this.pin(achievement, strip);
            pin.draggable = true;
            pin.onclick = () => { if (!this.pinSaving && Date.now() > (this.pinDragUntil || 0)) { this.pinDraft.splice(index, 1); this.render(profile, container); }; };
            pin.onkeydown = event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                if (this.movePin(index, index + (event.key === 'ArrowLeft' ? -1 : 1))) this.render(profile, container);
            };
            pin.ondragstart = event => { if (this.pinSaving) { event.preventDefault(); return; }; dragged = id; this.pinDragUntil = Infinity; event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; };
            pin.ondragover = event => { if (dragged !== null && !this.pinSaving) event.preventDefault(); };
            pin.ondrop = event => { event.preventDefault(); this.pinDragUntil = Date.now() + 250; if (dragged !== null && this.movePin(this.pinDraft.indexOf(dragged), index)) this.render(profile, container); dragged = null; };
            pin.ondragend = () => { dragged = null; this.pinDragUntil = Date.now() + 250; };
        });
    },

    observeTooltips(container = null) {
        if (!this.tooltipObserver) return;
        this.tooltipObserver.disconnect();
        this.tooltipObserver.observe(document.body, { childList: true });
        this.tooltipPane = container;
        if (container) this.tooltipObserver.observe(container, { childList: true, subtree: true });
    },

    clearTooltips(root) {
        if (this.caseHost && !this.caseHost.isConnected) { this.caseResize?.disconnect(); this.caseHost = null; };
        for (const icon of this.tooltipIcons) {
            if (icon.isConnected && !root?.contains?.(icon)) continue;
            this.tooltipIcons.delete(icon);
            if (typeof ItemToolTips !== 'undefined') ItemToolTips.clearItemButtons({ canvas: icon });
            else icon.tooltip?.remove();
        };
        if (this.tooltipPane && !this.tooltipPane.isConnected) {
            if (this.view?.container === this.tooltipPane) this.view = null;
            this.observeTooltips();
        };
    },

    tooltip(icon, text) {
        icon.tabIndex = 0;
        icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', text);
        icon.title = text;
        if (typeof ItemToolTips === 'undefined') return;
        ItemToolTips.encloseRenderPageFunc({ canvas: icon, renderingItem: { name: text } });
        icon.title = '';
        icon.tooltip.style.zIndex = '100300';
        icon.tooltip.id = 'la-reward-tip-' + (this.nextTooltip = (this.nextTooltip || 0) + 1);
        icon.tooltip.setAttribute('role', 'tooltip'); icon.setAttribute('aria-describedby', icon.tooltip.id);
        icon.onfocus = () => {
            const box = icon.getBoundingClientRect();
            icon._tooltipMouseMove({ pageX: box.left + window.scrollX, pageY: box.bottom + window.scrollY });
        };
        icon.onblur = () => icon._tooltipMouseOut();
        this.tooltipIcons.add(icon);
    },

    rewardIcons(reward, parent) {
        const rewards = this.element('div', 'la-rewards', undefined, parent);
        const add = (src, label, quantity, item) => {
            const icon = this.element('span', 'la-reward-icon', undefined, rewards);
            if (item && (item.item_data?.meshName || item.item_type_id === 2) && typeof itemRenderer !== 'undefined') {
                const canvas = this.element('canvas', '', undefined, icon);
                canvas.width = canvas.height = 256;
                requestAnimationFrame(() => {
                    if (!canvas.isConnected) return;
                    try {
                        if (item.item_type_id === 2) itemRenderer.renderStampToCanvas(item, canvas);
                        else itemRenderer.renderToCanvas(item.item_data.meshName, canvas, { radius: 1.2, primaryGun: item.item_type_id === 3, secondaryGun: item.item_type_id === 4 });
                    }
                    catch { canvas.remove(); this.image({ image: src }, icon); };
                });
            } else this.image({ image: src }, icon);
            if (quantity) this.element('span', 'la-reward-quantity', quantity, icon);
            this.tooltip(icon, label);
        };
        add('/img/egg_icon.png', Number(reward.eggs).toLocaleString() + ' eggs', Number(reward.eggs).toLocaleString());
        for (const id of reward.items || []) {
            const item = catalog.findItemById(id);
            add('/legacyachievements/img/placeholder.png', item?.name || 'Skin reward', null, item);
        };
        if (reward.vipSeconds) {
            const hours = reward.vipSeconds / 3600;
            const duration = hours >= 1 ? hours.toLocaleString() + (hours === 1 ? ' hour' : ' hours') : Math.ceil(reward.vipSeconds / 60) + ' minutes';
            add('/img/ico_chickenBadge.png', duration + ' VIP, added to existing VIP time', hours >= 1 ? hours.toLocaleString() + 'h' : Math.ceil(reward.vipSeconds / 60) + 'm');
        };
        return rewards;
    },

    element(tag, className, text, parent) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        parent?.appendChild(element);
        return element;
    },

    image(achievement, parent) {
        const image = this.element('img', 'la-image', undefined, parent);
        image.alt = ''; image.src = achievement.image || '/legacyachievements/img/placeholder.png';
        image.onerror = () => { image.onerror = null; image.src = '/legacyachievements/img/placeholder.png'; };
        return image;
    },

    showNext() {
        if (this.popup || !this.queue.length || !this.key || !playerAccount.isLoggedIn || this.state?.username !== playerAccount.username) return;
        let achievement;
        while (this.queue.length && !achievement) {
            const next = this.queue.shift();
            if (!this.state.achievements.find(entry => entry.id === next.id)?.claimedAt) achievement = next;
        };
        if (!achievement) return;
        const popup = this.popup = this.element('aside', 'la-popup', undefined, document.body);
        popup.setAttribute('role', 'status'); popup.setAttribute('aria-live', 'polite');
        this.image(achievement, popup);
        const content = this.element('div', 'la-popup-copy', undefined, popup);
        this.element('div', 'la-eyebrow', 'Achievement Unlocked!', content);
        this.element('strong', 'la-popup-name', achievement.name, content);
        this.rewardIcons(achievement.reward, content);
        if (!this.state.hasClaimed) this.element('p', 'la-first-claim', 'Redeem your reward from your profile.', content);
        const actions = this.element('div', 'la-popup-actions', undefined, content);
        if (typeof LegacyProfiles !== 'undefined') {
            const view = this.element('button', 'ssbutton blue', 'View Rewards', actions);
            view.type = 'button';
            view.onclick = async () => {
                this.dismiss();
                try { await LegacyProfiles.open(playerAccount.username, null); if (LegacyProfiles.overlay) LegacyProfiles.selectTab('achievements'); }
                catch (error) { console.warn('LegacyAchievements:', error); };
            };
        };
        const close = this.element('button', 'la-popup-close', '×', popup);
        close.type = 'button'; close.setAttribute('aria-label', 'Dismiss achievement'); close.onclick = () => this.dismiss();
        try { playSoundIndependent2D('ammo', { vol: .55 }); } catch { };
        if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ cmd: 'achievementsSeen', achievement: achievement.id, session: playerAccount.session }));
        this.popupTimer = setTimeout(() => this.dismiss(), this.state.hasClaimed ? 6500 : 10000);
    },

    dismiss() {
        this.clearTooltips(this.popup);
        clearTimeout(this.popupTimer); this.popup?.remove(); this.popup = null;
        this.showNext();
    },

    async publicList(username) {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(servicesServer);
            let done = false;
            const finish = (error, data) => {
                if (done) return;
                done = true; clearTimeout(timer); socket.close(); error ? reject(error) : resolve(data);
            };
            const timer = setTimeout(() => finish(new Error('Could not load achievements. Try again.')), 10000);
            socket.onopen = () => socket.send(JSON.stringify({ cmd: 'achievementsGet', username }));
            socket.onmessage = event => {
                try {
                    const data = JSON.parse(event.data).legacyachievements;
                    if (data?.type === 'list') finish(null, data);
                    else finish(new Error(data?.message || 'Could not load achievements.'));
                } catch { finish(new Error('Could not load achievements.')); };
            };
            socket.onerror = () => finish(new Error('Could not reach achievements.'));
            socket.onclose = () => { if (!done) finish(new Error('The connection closed. Try again.')); };
        });
    },

    async render(profile, container) {
        this.clearTooltips(container);
        this.observeTooltips(container);
        container.replaceChildren();
        const token = this.renderToken = (this.renderToken || 0) + 1;
        const generation = typeof LegacyProfiles === 'undefined' ? null : LegacyProfiles.tileGeneration;
        const current = () => container.isConnected && token === this.renderToken && (typeof LegacyProfiles === 'undefined' || LegacyProfiles.pane !== container || LegacyProfiles.tileGeneration === generation);
        if (profile.guest) { this.element('p', 'lp-message', 'Sign in to earn achievements.', container); return; };
        const own = playerAccount?.isLoggedIn && profile.username === playerAccount.username;
        if (own && this.state?.username !== profile.username) { this.element('p', 'lp-message', 'Connecting to achievements...', container); return; };
        this.element('p', 'lp-message', 'Loading achievements...', container);
        try {
            const data = own ? this.state : await (this.profileRequest?.profile === profile ? this.profileRequest.promise : this.publicList(profile.username));
            if (!current()) return;
            container.replaceChildren();
            this.updateCount(data);
            this.pinEditor(profile, data, container);
            const controls = this.element('div', 'la-controls', undefined, container);
            const search = this.element('input', 'textInput', undefined, controls);
            search.type = 'search'; search.placeholder = 'Find an achievement...'; search.setAttribute('aria-label', 'Search achievements');
            const category = this.element('select', 'ss_select', undefined, controls);
            category.setAttribute('aria-label', 'Achievement category');
            const status = this.element('select', 'ss_select', undefined, controls);
            status.setAttribute('aria-label', 'Achievement status');
            const option = (select, value, label) => { this.element('option', '', label, select).value = value; };
            option(category, '', 'All Categories');
            for (const name of new Set(data.achievements.map(entry => entry.category || 'Other'))) option(category, name, name);
            for (const [value, label] of [['', 'All Achievements'], ['locked', 'Locked'], ['unlocked', 'Unlocked'], ['ready', 'Rewards Ready'], ['claimed', 'Redeemed']]) option(status, value, label);
            if (this.filters?.username === profile.username) {
                search.value = this.filters.search; category.value = this.filters.category; status.value = this.filters.status;
            };
            const summary = this.element('p', 'la-summary', '', container);
            const list = this.element('div', 'la-list', undefined, container);
            const view = this.view = { profile, container, generation, data, own, search, category, status, summary, list };
            search.oninput = category.onchange = status.onchange = () => this.drawList(view);
            this.drawList(view);
        } catch (error) {
            if (!current()) return;
            container.replaceChildren(); this.element('p', 'lp-message', error.message, container);
            const retry = this.element('button', 'ssbutton blue', 'Try Again', container);
            retry.onclick = () => this.render(profile, container);
        };
    },

    matches(achievement, category, status, query) {
        if (category && (achievement.category || 'Other') !== category) return false;
        if (status === 'locked' && achievement.unlockedAt || status === 'unlocked' && !achievement.unlockedAt ||
            status === 'ready' && (!achievement.unlockedAt || achievement.claimedAt) || status === 'claimed' && !achievement.claimedAt) return false;
        return !query || (achievement.name + ' ' + achievement.description + ' ' + (achievement.category || 'Other')).toLocaleLowerCase().includes(query.toLocaleLowerCase());
    },

    drawList(view) {
        this.clearTooltips(view.list);
        view.list.replaceChildren();
        const { search, category, status, data } = view;
        this.filters = { username: view.profile.username, search: search.value, category: category.value, status: status.value };
        const entries = data.achievements.filter(entry => this.matches(entry, category.value, status.value, search.value.trim()));
        const unclaimed = entries.filter(entry => entry.unlockedAt && !entry.claimedAt).length;
        view.summary.textContent = entries.length + ' / ' + data.achievements.length + ' shown' + (view.own && unclaimed ? ' · ' + unclaimed + (unclaimed === 1 ? ' reward ready' : ' rewards ready') : '');
        for (const name of new Set(entries.map(entry => entry.category || 'Other'))) {
            const group = this.element('section', 'la-category', undefined, view.list);
            const all = data.achievements.filter(entry => (entry.category || 'Other') === name);
            const heading = this.element('h3', 'la-category-heading', name, group);
            this.element('span', '', all.filter(entry => entry.unlockedAt).length + '/' + all.length, heading);
            const rows = this.element('div', 'la-rows', undefined, group);
            rows.setAttribute('role', 'list'); rows.setAttribute('aria-label', name + ' achievements');
            for (const achievement of entries.filter(entry => (entry.category || 'Other') === name)) this.row(achievement, view.own, rows);
        };
        if (!entries.length) this.element('p', 'lp-message', 'No achievements found.', view.list);
        this.scrollToAchievement(view);
    },

    row(achievement, own, parent) {
        const row = this.element('article', 'la-row' + (achievement.unlockedAt ? '' : ' la-locked'), undefined, parent);
        row.setAttribute('role', 'listitem');
        row.dataset.achievement = achievement.id;
        row.dataset.category = (achievement.category || 'Other').toLowerCase();
        const art = this.element('div', 'la-art', undefined, row);
        this.image(achievement, art);
        const info = this.element('div', 'la-row-copy', undefined, row);
        this.element('h4', '', achievement.name, info);
        this.element('p', 'la-description', achievement.description, info);
        this.rewardIcons(achievement.reward, row);
        const actions = this.element('div', 'la-row-actions', undefined, row);
        if (!achievement.unlockedAt) {
            this.element('span', '', achievement.progress + ' / ' + achievement.goal, actions);
            const progress = this.element('progress', '', undefined, actions);
            progress.max = achievement.goal; progress.value = achievement.progress;
            progress.setAttribute('aria-label', achievement.name + ' progress');
        } else if (achievement.claimedAt && !(own && this.pinDraft)) {
            const date = this.element('span', 'la-redeemed', this.shortDate(achievement.unlockedAt), actions);
            date.setAttribute('aria-label', 'Achieved on ' + date.textContent);
        } else if (!own) this.element('span', 'la-redeemed', 'Unlocked', actions);
        else if (!this.pinDraft) {
            const claim = this.element('button', 'ssbutton orange', 'Redeem', actions);
            claim.type = 'button';
            claim.onclick = async () => {
                claim.disabled = true;
                try { await this.request('achievementsClaim', { achievement: achievement.id }); }
                catch (error) {
                    if (!claim.isConnected) return;
                    claim.disabled = false;
                    let message = row.querySelector('.la-error');
                    if (!message) message = this.element('p', 'la-error', undefined, row);
                    message.textContent = error.message; message.setAttribute('role', 'alert');
                };
            };
        };
        if (own && this.pinDraft && achievement.unlockedAt) {
            const chosen = this.pinDraft.includes(achievement.id);
            const toggle = this.element('button', 'ssbutton blue', chosen ? 'Unpin' : 'Pin', actions);
            toggle.disabled = !!this.pinSaving || (!chosen && this.pinDraft.length >= AchievementMaxPins);
            toggle.onclick = () => {
                if (this.pinSaving) return;
                if (chosen) this.pinDraft.splice(this.pinDraft.indexOf(achievement.id), 1);
                else if (this.pinDraft.length < AchievementMaxPins) this.pinDraft.push(achievement.id);
                this.render(LegacyProfiles.profile, LegacyProfiles.pane);
            };
        };
    },

    refreshPane() {
        if (typeof LegacyProfiles === 'undefined' || !LegacyProfiles.overlay || LegacyProfiles.profile?.username !== this.state?.username) return;
        const selected = LegacyProfiles.tabs.querySelector('[data-section="achievements"][aria-selected="true"]');
        if (selected) {
            if (this.view?.container === LegacyProfiles.pane && this.view.generation === LegacyProfiles.tileGeneration && this.view.search.isConnected) {
                this.view.data = this.state;
                this.drawList(this.view);
            } else this.render(LegacyProfiles.profile, LegacyProfiles.pane);
        };
    },

    applyReward(account) {
        playerAccount.currentBalance = account.currentBalance;
        playerAccount.ownedItemIds = account.ownedItemIds;
        playerAccount.inventory = account.ownedItemIds.map(id => catalog.findItemById(id)).filter(Boolean);
        playerAccount.upgradeProductId = account.upgradeProductId;
        playerAccount.upgradeExpiryDate = account.upgradeExpiryDate;
        playerAccount.upgradeIsExpired = account.upgradeExpiryDate <= Date.now() / 1000;
        playerAccount.killMultiplier = account.upgradeMultiplier || 1;
        playerAccount.hideAds = account.upgradeAdFree;
        updateCurrentBalance();
        if (typeof setupUpgradeUI === 'function') setupUpgradeUI();
        if (typeof LegacyProfiles !== 'undefined' && LegacyProfiles.profile?.username === playerAccount.username) {
            LegacyProfiles.profile.eggs = account.currentBalance;
            LegacyProfiles.profile.inventory = [...account.ownedItemIds];
            LegacyProfiles.profile.vip = { active: account.upgradeProductId > 0 && !playerAccount.upgradeIsExpired, expires: account.upgradeExpiryDate, multiplier: account.upgradeMultiplier };
            if (LegacyProfiles.overlay) {
                LegacyProfiles.preview?.dispose();
                LegacyProfiles.render();
                LegacyProfiles.selectTab('achievements');
            };
        };
    },
};

if (isClient) LegacyAchievements.registerListeners(plugins);
