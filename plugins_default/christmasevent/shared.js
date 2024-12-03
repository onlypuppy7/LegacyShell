//legacyshell: basic
import { devlog, isClient, isServer } from "#constants";
//legacyshell: plugins
import { plugins } from '#plugins';
//

export var isChristmas = true;

export const ChristmasEvent = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (ChristmasEvent)");

        this.plugins = pluginManager;

        if (isChristmas) {
            this.plugins.on('game:createMapCellsMapLoaded', this.createMapCellsMapLoaded.bind(this));
            this.plugins.on('game:createMapCells', this.createMapCells.bind(this));
        };
    },

    async createMapCells(data) {
        const replacements = {
            "nature.tree-01.aabb": "nature.tree-01-snow.aabb",
            "nature.tree-02.full.verysoft": "nature.tree-02-snow.full.verysoft",
            "nature.tree-03.full.verysoft": "nature.tree-03-snow.full.verysoft",
        };
        
        const updatedMinMapData = {};

        for (const key in minMap.data) {
            devlog("ChristmasEvent: Checking key", key);
            if (Object.hasOwn(minMap.data, key)) {
                const newKey = replacements[key] || key;
                updatedMinMapData[newKey] = minMap.data[key];
                if (replacements[key]) {
                    console.log(`ChristmasEvent: Renaming mesh key "${key}" to "${newKey}"`);
                };
            };
        };
    
        minMap.data = updatedMinMapData;
    },

    async createMapCellsMapLoaded(data) {
        devlog("ChristmasEvent: Adding snow to map");

        var meshArr = [];
        var meshArrRound = [];
    
        for (var x = 0; x < map.width; x++) { //i would have liked to use iterateXYZ but its no good
            for (var z = 0; z < map.depth; z++) {
                for (var y = map.height - 1; y >= 0; y--) {
                    var cellBelow = map.data[x] && map.data[x][y-1] && map.data[x][y-1][z];
                    if (cellBelow && cellBelow?.mesh) {
                        var roundOut = cellBelow.mesh.name.includes("roundout") || cellBelow.mesh.name.includes("round-out");
                        if ( //this is a huge mess of a condition
                            ( //accept conditions
                                cellBelow.mesh.colliderType === "full" ||
                                cellBelow.mesh.name.includes("arch") ||
                                (cellBelow.mesh.name.includes("half") && cellBelow.rx === 0 && cellBelow.rz === 0) ||
                                (roundOut && cellBelow.rx === 0 && cellBelow.rz === 0)
                            ) &&
                            !( //reject conditions
                                cellBelow.mesh.name.includes("barrier") ||
                                cellBelow.mesh.name.includes(".tree-") ||
                                cellBelow.mesh.name.includes("cap")
                            )
                        ) {
                            var cellThis = map.data[x] && map.data[x][y] && map.data[x][y][z];
                            if ( //if stairs or something, dont add snow but still break the loop
                                !(
                                    cellThis && cellThis?.mesh && (
                                        cellThis.mesh.colliderType === "wedge" ||
                                        cellThis.mesh.name.includes("cap")
                                    )
                                )
                            ) {
                                if (roundOut) {
                                    meshArrRound.push({ x, y, z, ry: (cellBelow.ry * 2 / Math.PI) + 2 });
                                } else {
                                    meshArr.push({ x, y, z, ry: Math.randomInt(0, 3) });
                                };
                                // console.log("y2", y, cellBelow);
                            };
                            break;
                        };
                    };
                };
            };
        };

        addMeshToMapHelper(gameScene.getMeshByName("generic.snow-bottom.none"), meshArr);
        addMeshToMapHelper(gameScene.getMeshByName("generic.snow-bottom-2.none"), meshArrRound);
    },
};

if (isClient) ChristmasEvent.registerListeners(plugins);