const idx = {
    // 0: "generic.grass.full",
    // 3: "generic.grass.full",
    // 7: "generic.grass.full",shipyard.container-blue.full
    // 8: "generic.grass.full",generic.grass.full
    // 9: "generic.grass.full", 
    1: {0: "generic.grass.full", 1: "generic.pavement.full", 2: "generic.concrete.full"}, //2: shipyard.container-green.full
    2: {1: "shipyard.container-orange.full", 3: "generic.brown-block.full", 5: "generic.inset-blue.full", 6: "generic.green-block.full"}, //
    4: {0: "generic.barricade.aabb"}, //
    5: {0: "generic.stairs.wedge", 2: "generic.metal-ramp.wedge"}, //
    6: {0: "generic.metal-ladder.ladder"}, //
};

//generic.metal-ramp.wedge

// function addBlock(map, mesh, block) {

// };

function convert(m) {
    let n = {};
    n.width = m.width;
    n.height = m.height;
    n.depth = m.depth;
    n.name = m.name;
    n.surfaceArea = m.depth;

    n.data = {};

    Object.entries(m.data).forEach(([cat, value]) => {

        Object.entries(value).forEach(([dec, value]) => {
            value.forEach(cell => {

                let block = {
                    x: cell.x,
                    y: cell.y,
                    z: cell.z,
                };

                if (cell.dir !== 0) block.ry = cell.dir;

                let mesh;
                if (idx && idx[cat] && idx[cat][dec]) {
                    mesh = idx[cat][dec];
                };
                
                if (!mesh) console.log(n.name, cat, dec, mesh, cell);

                if (!n.data[mesh]) n.data[mesh] = [];
                n.data[mesh].push(block);
            });
        });

    });

    console.log(JSON.stringify(n));
};