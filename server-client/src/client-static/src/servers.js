var servers = LEGACYSHELLSERVERS;

var debug = false;

var servicesServer = 'LEGACYSHELLSERVICESSERVER';

if (location.hostname.startsWith('localhost')) {
    servicesServer = 'ws://localhost:LEGACYSHELLSERVICESPORT';
	debug = true;
	servers.push({ name: 'local', address: 'localhost:LEGACYSHELLWEBSOCKETPORT' });
}

// if (location.hostname.startsWith('staging.shellshock.io')) {
//     debug = true;
//     servers = [{ name: 'Staging', address: 'staging.shellshock.io:443' }];
//     servicesServer = 'ws://staging.shellshock.io:4242/';
// }

// if (location.hostname.startsWith('dev.shellshock.io')) {
//     servers = [{ name: 'Dev (US West)', address: 'gamedev.shellshock.io:443' }];
//     servicesServer = 'ws://dev.shellshock.io/services/:443';
// }

// if (location.hostname.startsWith('localshelldev')) {
//     servers = [
//         { name: 'Local VM', address: 'localshelldev.bluewizard.com:443' },
//     //    { name: 'US West', address: 'uswest2.shellshock.io:443' }
//     ];

//     servicesServer = 'ws://localshelldev.bluewizard.com:4242/';
// }

for (var i = 0; i < servers.length; i++) {
	servers[i].nameDisplay = servers[i].name;
	servers[i].id = i;
};