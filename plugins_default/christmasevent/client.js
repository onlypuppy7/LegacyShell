//legacyshell: basic
import { devlog, isClient, isServer } from "#constants";
import { iterateXYZ } from "#loading";
//legacyshell: plugins
import { plugins } from '#plugins';
//

var isChristmas = events.currentArray.includes("christmas");

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
            // "nature.tree-01.aabb": "nature.tree-01-snow.aabb",
            "nature.tree-01.aabb": "christmas.tree-large.aabb",
            "nature.tree-02.full.verysoft": "nature.tree-02-snow.full.verysoft",
            // "nature.tree-03.full.verysoft": "nature.tree-03-snow.full.verysoft",
            "nature.tree-03.full.verysoft": "christmas.tree-small.full.verysoft",
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

    async createMapCellsMapLoaded({minMap}) {
        devlog("ChristmasEvent: Adding snow to map", map, minMap);

        if (minMap?.extents?.seasonalEffectsDisabled) return;

        var meshArr = [];
        var meshArrRound = [];
    
        for (var x = 0; x < map.width; x++) { //i would have liked to use iterateXYZ but its no good
            for (var z = 0; z < map.depth; z++) {
                for (var y = map.height - 1; y >= 0; y--) {
                    var cellBelow = map.data[x] && map.data[x][y-1] && map.data[x][y-1][z];
                    if (cellBelow && cellBelow?.mesh) {
                        var isRoundOut = (
                            cellBelow.mesh.name.includes("roundout") ||
                            cellBelow.mesh.name.includes("round-out")
                        ) && !(
                            cellBelow.mesh.name.includes("well")
                        );
                        var isCap = cellBelow.mesh.id.includes("singlecap") || cellBelow.mesh.id.includes("-cap-") || cellBelow.mesh.id.includes("-cap.");

                        if ( //this is a huge mess of a condition
                            ( //accept conditions
                                cellBelow.mesh.colliderType === "full" ||
                                cellBelow.mesh.name.includes("arch") ||
                                (cellBelow.mesh.name.includes("half") && cellBelow.rx === 0 && cellBelow.rz === 0) ||
                                (isRoundOut && cellBelow.rx === 0 && cellBelow.rz === 0)
                            ) &&
                            !( //reject conditions
                                cellBelow.mesh.name.includes("barrier") ||
                                cellBelow.mesh.id.includes(".tree-") ||
                                isCap
                            )
                        ) {
                            var cellThis = map.data[x] && map.data[x][y] && map.data[x][y][z];
                            if ( //if stairs or something, dont add snow but still break the loop
                                !(
                                    cellThis && cellThis?.mesh && (
                                        cellThis.mesh.colliderType === "wedge" ||
                                        isCap
                                    )
                                )
                            ) {
                                if (isRoundOut) {
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

        var meshArrsFloor = [
            [], //gifts
        ];

        var meshArrsCeiling = [
            [], //mistletoe
            [], //bauble cluster
            [], //bauble large
        ];

        var meshArrsWall = [
            [], //stockings
            [], //wreath
        ];

        var meshArrsWallCeiling = [
            [], //gingerbread
            [], //candy cane
        ];

        function addXmasItems(centralPos, checkPos, meshArrs, chance = 25, ry = Math.seededRandomInt(0, meshArrs.length - 1)) {
            var centralCell = map.data[centralPos.x] && map.data[centralPos.x][centralPos.y] && map.data[centralPos.x][centralPos.y][centralPos.z];

            if (centralCell && centralCell?.mesh && centralCell.mesh.colliderType === "full" && !centralCell.mesh.name.includes("barrier")) {
                var condition = true;
                checkPos.forEach(pos => {
                    var cell = map.data[pos.x] && map.data[pos.x][pos.y] && map.data[pos.x][pos.y][pos.z];
                    if (cell && cell?.mesh && cell.mesh.colliderType !== "none") { //isnt empty
                        if (pos.isSolid) {
                            if (!(cell && cell?.mesh && cell.mesh.colliderType === "full")) {
                                condition = false;
                            };
                        } else condition = false;
                        // devlog("didnt pass", cell)
                    } else { //is empty
                        // devlog("passed", cell)
                        if (pos.isSolid) {
                            condition = false;
                        };
                    };
                });

                if (condition && Math.seededRandomInt(1, chance) === 1) {
                    let meshArr = meshArrs[Math.seededRandomInt(0, meshArrs.length)];
                    meshArr.push({x: checkPos[0].x, y: checkPos[0].y, z: checkPos[0].z, ry});
                };
            };
        };

        iterateXYZ(map.width, map.height, map.depth, {}, (x, y, z)=>{
            Math.seed = x * map.width + y * map.height + z * map.depth;

            addXmasItems({x, y, z}, [
                {x, y: y + 1, z}, 
                {x, y: y + 2, z}
            ], meshArrsFloor, 35);

            addXmasItems({x, y, z}, [
                {x, y: y - 1, z}
            ], meshArrsCeiling, 15);

            addXmasItems({x, y, z}, [
                {x: x + 1, y: y, z: z}
            ], meshArrsWall, 15, 2);
            addXmasItems({x, y, z}, [
                {x: x - 1, y: y, z: z}
            ], meshArrsWall, 15, 0);
            addXmasItems({x, y, z}, [
                {x: x, y: y, z: z + 1}
            ], meshArrsWall, 15, 1);
            addXmasItems({x, y, z}, [
                {x: x, y: y, z: z - 1}
            ], meshArrsWall, 15, 3);

            addXmasItems({x, y, z}, [
                {x: x + 1, y: y, z: z},
                {x: x + 1, y: y - 1, z: z, isSolid: true},
            ], meshArrsWallCeiling, 10, 2);
            addXmasItems({x, y, z}, [
                {x: x - 1, y: y, z: z},
                {x: x - 1, y: y - 1, z: z, isSolid: true},
            ], meshArrsWallCeiling, 10, 0);
            addXmasItems({x, y, z}, [
                {x: x, y: y, z: z + 1},
                {x: x, y: y - 1, z: z + 1, isSolid: true},
            ], meshArrsWallCeiling, 10, 1);
            addXmasItems({x, y, z}, [
                {x: x, y: y, z: z - 1},
                {x: x, y: y - 1, z: z - 1, isSolid: true},
            ], meshArrsWallCeiling, 10, 3);
        });

        devlog("done", meshArrsFloor[0])

        addMeshToMapHelper(gameScene.getMeshByName("christmas.gifts.obb"), meshArrsFloor[0]);

        addMeshToMapHelper(gameScene.getMeshByName("christmas.bobblecluster.none"), meshArrsCeiling[0]);
        addMeshToMapHelper(gameScene.getMeshByName("christmas.bobblelarge.none"), meshArrsCeiling[1]);
        addMeshToMapHelper(gameScene.getMeshByName("christmas.bobblepablo.aabb"), meshArrsCeiling[2]);

        addMeshToMapHelper(gameScene.getMeshByName("christmas.stockings.none"), meshArrsWall[0]);
        addMeshToMapHelper(gameScene.getMeshByName("christmas.wreath.none"), meshArrsWall[1]);

        addMeshToMapHelper(gameScene.getMeshByName("christmas.gingerbread.aabb"), meshArrsWallCeiling[0]);
        addMeshToMapHelper(gameScene.getMeshByName("christmas.candycanelean.obb"), meshArrsWallCeiling[1]);
    },
};

if (isClient) ChristmasEvent.registerListeners(plugins);