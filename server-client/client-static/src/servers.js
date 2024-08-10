var servers = [
    { name: 'US East', address: 'useast2.legacy.onlypuppy7.online:443' },
    { name: 'US West', address: 'uswest2.legacy.onlypuppy7.online:443' },
    { name: 'US Central', address: 'uscentral2.legacy.onlypuppy7.online:443' },
    { name: 'Brazil', address: 'brazil2.legacy.onlypuppy7.online:443' },
    { name: 'Germany', address: 'egs-static-live-germany-287o43bv.shellshock.io:443' },
    { name: 'Singapore', address: 'singapore2.legacy.onlypuppy7.online:443' },
    { name: 'Sydney', address: 'sydney.legacy.onlypuppy7.online:443' },
];

var debug = false;

var servicesServer = 'wss://shellshock.io/services/:443';

if (location.hostname.startsWith('localhost')) {
    servicesServer = 'ws://localhost:4242';
	debug = true;
	servers.push({ name: 'local', address: '127.0.0.1:443' });
    servers.push({ name: 'Dev (US West)', address: 'gamedev.legacy.onlypuppy7.online:443' });
}

if (location.hostname.startsWith('staging.legacy.onlypuppy7.online')) {
    debug = true;
    servers = [{ name: 'Staging', address: 'staging.legacy.onlypuppy7.online:443' }];
    servicesServer = 'ws://staging.legacy.onlypuppy7.online:4242/';
}

if (location.hostname.startsWith('dev.legacy.onlypuppy7.online')) {
    servers = [{ name: 'Dev (US West)', address: 'gamedev.legacy.onlypuppy7.online:443' }];
    servicesServer = 'ws://dev.legacy.onlypuppy7.online/services/:443';
}

if (location.hostname.startsWith('localshelldev')) {
    servers = [
        { name: 'Local VM', address: 'localshelldev.bluewizard.com:443' },
    //    { name: 'US West', address: 'uswest2.legacy.onlypuppy7.online:443' }
    ];

    servicesServer = 'ws://localshelldev.bluewizard.com:4242/';
}