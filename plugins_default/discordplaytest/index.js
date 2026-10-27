//vibeslopped / quickly made
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ss } from '#misc';
import { PlaytestAccess, parseDuration } from './access.js';

export const PluginMeta = {
    identifier: 'discordplaytest',
    name: 'Discord Playtest',
    author: 'Codex (vibeslopped / quickly made)',
    version: '1.0.0',
    descriptionShort: 'Temporary site passwords from Discord slash commands',
    descriptionLong: 'Owner-approved Discord users can create expiring playtest passwords using the client password hook.',
    legacyShellVersion: 663,
};

export class Plugin {
    constructor(plugins, thisDir) {
        if (plugins.type !== 'client') return;
        this.plugins = plugins;
        this.storeFolder = path.join(thisDir, 'store');
        fs.mkdirSync(this.storeFolder, { recursive: true });
        const configPath = path.join(this.storeFolder, 'config.json');
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify({ enabled: false, token: '', guild_id: '' }, null, 4), { mode: 0o600 });
            console.log('[discordplaytest] Disabled config created at', configPath);
        };
        this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (this.config.enabled !== true || typeof this.config.token !== 'string' || !this.config.token.trim()) return;
        if (this.config.guild_id && !/^\d+$/.test(this.config.guild_id)) throw new Error('[discordplaytest] Invalid guild_id');
        this.enableGate();
        plugins.on('client:onConfigInfoLoaded', () => this.enableGate());
        plugins.on('client:onCheckPassword', this.checkPassword.bind(this));
        try {
            this.access = new PlaytestAccess(path.join(this.storeFolder, 'state.json'));
        } catch {
            console.error('[discordplaytest] Invalid or unreadable state.json. Bot disabled; site gate remains enabled. Restore the state file and restart.');
            return;
        };
        this.ready = this.startBot().catch(() => {
            console.error('[discordplaytest] Bot startup failed. Check token, invite and command permissions. Site gate remains enabled.');
            this.bot?.destroy();
        });
    };

    enableGate() {
        ss.config.client.login ||= {};
        ss.config.client.login.enabled = true;
        //keep an existing owner login; otherwise make an unguessable fallback for core's startup check
        if (!ss.config.client.login.username || !ss.config.client.login.password) {
            ss.config.client.login.username = 'playtest-owner';
            ss.config.client.login.password = randomBytes(32).toString('hex');
        };
    };

    checkPassword(data) {
        if (!this.access?.check(data.login, data.password)) return;
        //let core do next(), avoiding the shared plugins.cancel flag on concurrent requests
        data.auth.login = data.login;
        data.auth.password = data.password;
    };

    async startBot() {
        const { Client, Events, GatewayIntentBits } = await import('discord.js');
        this.bot = new Client({ intents: [GatewayIntentBits.Guilds] });
        this.bot.on(Events.Error, () => console.error('[discordplaytest] Discord connection error.'));
        this.bot.on(Events.InteractionCreate, interaction => {
            if (!interaction.isChatInputCommand() || !interaction.commandName.startsWith('playtest')) return;
            this.handleCommand(interaction).catch(async () => {
                console.error('[discordplaytest] Command failed. Check Discord permissions and store write access.');
                const message = { content: 'Something cracked. Try again or ask the bot owner.', flags: 64 };
                try {
                    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message.content });
                    else await interaction.reply(message);
                } catch {};
            });
        });
        this.bot.once(Events.ClientReady, () => {
            this.setupCommands().catch(() => console.error('[discordplaytest] Could not register commands or fetch bot owner.'));
        });
        await this.bot.login(this.config.token.trim());
    };

    async setupCommands() {
        const application = await this.bot.application.fetch();
        this.ownerId = application.owner?.ownerId || application.owner?.id;
        if (!this.ownerId) throw new Error('Missing bot owner');
        const userOption = { name: 'user', description: 'Discord user', type: 6, required: true };
        const commands = [
            { name: 'playtest', description: 'Create a temporary site password (replaces your previous one)', options: [
                { name: 'duration', description: 'Time to play: 30m, 2h, 1d (maximum 7d)', type: 3, required: true },
            ] },
            { name: 'playtest-clear', description: 'Clear your password; owner can target a user or everyone', options: [
                { ...userOption, required: false },
                { name: 'all', description: 'Clear every temporary password (owner only)', type: 5 },
            ] },
            { name: 'playtest-approve', description: 'Allow a user to create playtest passwords (owner only)', options: [userOption] },
            { name: 'playtest-unapprove', description: 'Remove approval and password (owner only)', options: [userOption] },
        ];
        //create upserts these commands without deleting any unrelated bot commands
        for (const command of commands) {
            await application.commands.create({ ...command, dm_permission: false }, this.config.guild_id || undefined);
        };
        console.log('[discordplaytest] Discord commands ready.');
    };

    async handleCommand(interaction) {
        const name = interaction.commandName;
        if (!['playtest', 'playtest-clear', 'playtest-approve', 'playtest-unapprove'].includes(name)) return;
        const reply = content => interaction.reply({ content, flags: 64, allowedMentions: { parse: [] } });
        if (!this.ownerId) return reply('Bot is still starting. Try again in a moment.');
        if (this.config.guild_id && interaction.guildId !== this.config.guild_id) return reply('Use this command in the playtest server.');
        const id = interaction.user.id;
        const owner = id === this.ownerId;
        if (name === 'playtest-approve' || name === 'playtest-unapprove') {
            if (!owner) return reply('Only the bot owner can change approvals.');
            const user = interaction.options.getUser('user', true);
            this.access.approve(user.id, name === 'playtest-approve');
            return reply(name === 'playtest-approve' ? `<@${user.id}> can now use /playtest.` : `<@${user.id}> approval and password cleared.`);
        };
        if (!owner && !this.access.approved(id)) return reply('Ask the bot owner to approve you first.');
        if (name === 'playtest-clear') {
            const user = interaction.options.getUser('user');
            const all = interaction.options.getBoolean('all') === true;
            if ((all || (user && user.id !== id)) && !owner) return reply('Only the bot owner can clear other users\' passwords.');
            if (all && user) return reply('Choose a user or all, not both.');
            this.access.clear(all ? null : user?.id || id);
            return reply(all ? 'All temporary passwords cleared.' : 'Temporary password cleared.');
        };
        const duration = parseDuration(interaction.options.getString('duration', true));
        if (!duration) return reply('Use a duration like 30m, 2h or 1d. Minimum 1m, maximum 7d.');
        const pass = this.access.issue(id, duration);
        return reply(`Your site login:\n\`playtest:${pass.password}\`\nExpires <t:${Math.floor(pass.expiresAt / 1000)}:R>.\nCreating another password replaces this one.`);
    };
};
