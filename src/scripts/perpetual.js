import path from "node:path";
import fs from "node:fs";
import { Perpetual } from "puppyperpetual";

const serverName = process.argv[2].replace("--","");

const perpConfigLocation = path.join('store', 'config', 'perpetual_all.yaml');

if (!fs.existsSync(perpConfigLocation)) {
    console.error(`Perpetual config file not found at ${perpConfigLocation}. Please run 'npm run init' first.`);
    process.exit(1);
}

new Perpetual(serverName, {
    perpConfigLocation,
    process_cmd_prefix: "node ",
    process_cmd_suffix: " --perpetual",
    process_cmd: `server-${serverName}/run-${serverName}.js`,
    isNodeScript: true,
}).run();