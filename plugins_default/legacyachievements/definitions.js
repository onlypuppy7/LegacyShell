export const AchievementDefinitions = [
    { id: 'fresh_egg', name: 'Fresh Egg', category: 'Account', description: 'Make an account.', metric: 'account', goal: 1, image: '/img/ico_chicken.png', reward: { eggs: 250 } },
    { id: 'kills_5', tier: 1, name: 'Getting Cracking I', category: 'Combat', description: 'Kill 5 eggs.', metric: 'kills', goal: 5, image: '/img/egg_icon.png', reward: { eggs: 500 } },
    { id: 'kills_100', tier: 2, name: 'Getting Cracking II', category: 'Combat', description: 'Kill 100 eggs.', metric: 'kills', goal: 100, image: '/img/grenadeIcon.png', reward: { eggs: 2500, items: [200001], vipSeconds: 3600 } },
    { id: 'kills_500', tier: 3, name: 'Getting Cracking III', category: 'Combat', description: 'Kill 500 eggs.', metric: 'kills', goal: 500, image: '/img/ico_chickenBadge.png', reward: { eggs: 5000 } },
    { id: 'kills_1000', tier: 4, name: 'Getting Cracking IV', category: 'Combat', description: 'Kill 1,000 eggs.', metric: 'kills', goal: 1000, reward: { eggs: 10000 } },
    { id: 'kills_5000', tier: 5, name: 'Getting Cracking V', category: 'Combat', description: 'Kill 5,000 eggs.', metric: 'kills', goal: 5000, reward: { eggs: 25000 } },
    { id: 'kills_10000', tier: 6, name: 'Getting Cracking VI', category: 'Combat', description: 'Kill 10,000 eggs.', metric: 'kills', goal: 10000, reward: { eggs: 50000 } },
    { id: 'zombies_no_primary', name: 'Sidearm Survivor', category: 'Challenges', description: 'Survive a full Zombies round on Blue with at least 50 kills, without firing your primary weapon.', metric: 'zombies_no_primary', goal: 1, reward: { eggs: 2500 } },
];
