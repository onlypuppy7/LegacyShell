export const AchievementMaxPins = 3; //earned achievements shown on a profile

//the weapons Air Mail II wants a kill in mid-jump with: every weapon tier line below adds itself, so a new gun is wanted too. each is kept as air_<weapon> next to the weapon kills
export const MidairWeapons = [];

//survived Zombies rounds in a row, a Hard Boiled tier each
export const ZombieRoundGoals = [1, 3, 5, 10];

//tier is the roman numeral of a line (Kills I to VIII) and picks the hexagon its badge gets, 1 bronze to 8 rgb
//grade does the same for a single challenge, it orders them easiest first and pays the default reward of that grade when none is given. icon names the layer the badge is built from
export const AchievementDefinitions = (() => {
    const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    const line = ({ id, name, category, icon, metric, weapon, goals, eggs, describe, extra = {} }) => goals.map((goal, index) => ({
        id: id + '_' + goal, tier: index + 1, name: name + ' ' + numerals[index], category, description: describe(goal.toLocaleString('en-US')),
        metric, ...(weapon && { weapon }), goal, icon, image: '/legacyachievements/img/' + icon + '-' + (index + 1) + '.svg', reward: { eggs: eggs[index], ...extra[index + 1] },
    }));
    //what a challenge pays when it names no reward, by grade
    const gradeEggs = [500, 1000, 1500, 2500, 5000, 10000, 20000, 40000];
    const gunGoals = [25, 100, 250, 500, 1000, 2500, 5000, 10000], gunEggs = [100, 250, 500, 1000, 2500, 5000, 10000, 20000];
    const weapon = (id, name, text, goals = gunGoals) => MidairWeapons.push(id) && line({ id, name, category: 'Weapons', icon: id, metric: 'weapon', weapon: id, goals, eggs: gunEggs, describe: count => 'Kill ' + count + ' eggs with ' + text + '.' });
    const list = [
        { id: 'fresh_egg', grade: 1, name: 'Fresh Egg', category: 'Account', description: 'Make an account.', metric: 'account', goal: 1, image: '/img/ico_chicken.png', reward: { eggs: 250 } },
        ...line({ id: 'kills', name: 'Kills', category: 'Combat', icon: 'kills', metric: 'kills', goals: [5, 100, 500, 1000, 5000, 10000, 25000, 100000], eggs: [250, 1000, 2500, 5000, 10000, 20000, 40000, 100000], describe: count => 'Kill ' + count + ' eggs.', extra: { 2: { items: [200001], vipSeconds: 3600 } } }),
        ...line({ id: 'deaths', name: 'Deaths', category: 'Combat', icon: 'deaths', metric: 'deaths', goals: [5, 100, 500, 1000, 5000, 10000, 25000, 100000], eggs: [100, 500, 1000, 2000, 5000, 10000, 20000, 50000], describe: count => 'Die ' + count + ' times.' }),
        ...line({ id: 'zombies', name: 'Rotten Eggs', category: 'Combat', icon: 'zombies', metric: 'weapon', weapon: 'zombies', goals: [250, 2500, 10000], eggs: [500, 2500, 10000], describe: count => 'Kill ' + count + ' zombies.' }), //kept apart from the kills, and the weapons: the game server counts them as their own thing
        ...weapon('eggk47', 'Eggk-cellent Soldier', 'the Eggk47'),
        ...weapon('dozen', 'Scrambled Legs', 'the Dozen Gauge'),
        ...weapon('csg1', 'Free Range', 'the CSG-1'),
        ...weapon('rpegg', 'Big Bang Theory', 'the RPEGG'),
        ...weapon('cluck', 'Pea Shooter', 'the Cluck 9mm'),
        ...weapon('grenade', 'Shellshock', 'grenades', [10, 50, 100, 250, 500, 1000, 2500, 5000]),
        { id: 'zombies_no_primary', grade: 4, icon: 'sidearm-survivor', name: 'Sidearm Survivor', category: 'Challenges', description: 'Survive a full Zombies round on Blue with at least 50 kills, without firing your primary weapon.', metric: 'zombies_no_primary', goal: 1, image: '/legacyachievements/img/sidearm-survivor.svg' },
        { id: 'shutdown', grade: 2, name: 'Shutdown', category: 'Challenges', description: "End someone's streak of 10 or more.", metric: 'game', goal: 1 },
        { id: 'revenge_fried', grade: 1, name: 'Revenge Is Best Served Fried', category: 'Challenges', description: 'Kill whoever last killed you.', metric: 'game', goal: 1 },
        { id: 'long_shot', grade: 4, name: 'Long Shot', category: 'Challenges', description: 'Get a CSG-1 kill from 40 metres or more.', metric: 'game', goal: 1 },
        { id: 'last_gasp', grade: 3, name: 'Last Gasp', category: 'Challenges', description: 'Get a kill while on 10 HP or less.', metric: 'game', goal: 1 },
        { id: 'from_beyond', grade: 4, name: 'From Beyond the Shell', category: 'Challenges', description: 'Get a kill after you have died.', metric: 'game', goal: 1 },
        { id: 'omelette', grade: 5, name: 'Omelette', category: 'Challenges', description: 'Get 3 or more kills with a single explosion.', metric: 'game', goal: 1 },
        { id: 'air_mail', tier: 1, grade: 2, name: 'Air Mail I', category: 'Challenges', description: 'Get a kill while mid-jump.', metric: 'game', goal: 1 },
        { id: 'air_mail_every_weapon', tier: 2, grade: 4, name: 'Air Mail II', category: 'Challenges', description: 'Get a kill while mid-jump with every gun.', metric: 'midair', goal: MidairWeapons.length },
        ...ZombieRoundGoals.map((goal, index) => ({ id: 'zombie_rounds_' + goal, tier: index + 1, grade: [1, 2, 3, 5][index], name: 'Hard Boiled ' + numerals[index], category: 'Challenges', description: goal === 1 ? 'Survive a Zombies round.' : 'Survive ' + goal + ' Zombies rounds in a row.', metric: 'game', goal })), //reported by the game server when a player's run of survived rounds gets there
    ];
    //categories stay in the order they first appear, inside one the grade decides (the sort is stable, lines without one keep their place)
    const categories = [...new Set(list.map(definition => definition.category))];
    return list.map(definition => definition.reward ? definition : { ...definition, reward: { eggs: gradeEggs[definition.grade - 1] } })
        .sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category) || (a.grade || 0) - (b.grade || 0));
})();

//challenges the game server reports itself, the services only accept these from an authorised game server
export const GameChallenges = new Set(['zombies_no_primary', ...AchievementDefinitions.filter(definition => definition.metric === 'game').map(definition => definition.id)]);

export const AirKeys = new Set(MidairWeapons.map(weapon => 'air_' + weapon));

//weapons whose kills the game server counts for the weapon tiers
export const WeaponKeys = new Set(AchievementDefinitions.filter(definition => definition.metric === 'weapon').map(definition => definition.weapon));
