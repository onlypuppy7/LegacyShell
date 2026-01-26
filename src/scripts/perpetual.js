import path from "node:path";
import { Perpetual } from "puppyperpetual";

const serverName = process.argv[2].replace("--","");

new Perpetual(serverName, {
    perpConfigLocation: path.join('store', 'config', 'perpetual_all.yaml'),
    process_cmd_prefix: "node ",
    process_cmd_suffix: " --perpetual",
    isNodeScript: true,
}).run();