var gameplayTips = [ 
    'Your shots do more damage if they strike the center of an enemy egg',
    'Your accuracy decreases if you fire while moving, especially with the sniper rifle',
    'Hold down the Grenade button to throw further',
    'You can cancel a Grenade throw by pressing the Fire button',
    'Enable chat in the Options menu (but beware of foul-mouthed louts)',
    'Shoot gooder to die lesser',
    'Your health regenerates slowly over time',
    'Earn Golden Eggs to buy new hats, decals, and gun skins in the store',
    'Do your homework instead of playing video games',
    'Listen to your teacher, kids, don’t end up in the gutter',
    'Switch to your sidearm for close-quarter kills',
    'Your Shell Shocker friends are important but so are your real-life friends',
    'Don’t do drugs, they’re for loozers',
    'You can create private games for your friends and send them a link',
    'Turn off details in Settings if your framerate is low',
    'Cast iron skillets fry the best eggs',
    'Look around when going up ladders',
    'Not in the middle of the action?  Don’t forget to reload',
    'The EggK-47 is more accurate at long range if you fire slowly',
    'Private game owners can boot problem players by clicking on them in the leaderboard',
    'You can mute and change the names of players by clicking on them in the leaderboard'
];

function getRandomGameplayTip() {
    var rndIdx = Math.randomInt(0, gameplayTips.length);
    return gameplayTips[rndIdx];
}