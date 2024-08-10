var servers = [
    { name: 'LegacyShell', address: 'matchmaker.legacy.onlypuppy7.online:443' },
];

var debug = false;

var servicesServer = 'wss://services.legacy.onlypuppy7.online:443';

if (location.hostname.startsWith('localhost')) {
    servicesServer = 'ws://localhost:LEGACYSHELLSERVICESPORT';
	debug = true;
	servers.push({ name: 'local', address: '127.0.0.1:LEGACYSHELLWEBSOCKETPORT' });
}

// if (location.hostname.startsWith('staging.legacy.onlypuppy7.online')) {
//     debug = true;
//     servers = [{ name: 'Staging', address: 'staging.legacy.onlypuppy7.online:443' }];
//     servicesServer = 'ws://staging.legacy.onlypuppy7.online:4242/';
// }

// if (location.hostname.startsWith('dev.legacy.onlypuppy7.online')) {
//     servers = [{ name: 'Dev (US West)', address: 'gamedev.legacy.onlypuppy7.online:443' }];
//     servicesServer = 'ws://dev.legacy.onlypuppy7.online/services/:443';
// }

// if (location.hostname.startsWith('localshelldev')) {
//     servers = [
//         { name: 'Local VM', address: 'localshelldev.bluewizard.com:443' },
//     //    { name: 'US West', address: 'uswest2.legacy.onlypuppy7.online:443' }
//     ];

//     servicesServer = 'ws://localshelldev.bluewizard.com:4242/';
// }