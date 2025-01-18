const idx = {
    1: { //3 used to be an unused block
        0: "generic.grass.full",
        1: "generic.pavement.full",
        2: "generic.concrete.full",
        3: "generic.inset-blue.full",
        6: "scifi.ground.full"
    },
    2: {
        0: "shipyard.container-green.full",
        1: "shipyard.container-orange.full",
        2: "shipyard.container-blue.full",
        3: "generic.brown-block.full",
        4: "generic.siding.full",
        5: "generic.inset-blue.full",
        6: "generic.green-block.full",
        10: "scifi.crate.full",
        11: "scifi.pipes.full",
        12: "scifi.computer.obb",
        13: "scifi.power-generator.aabb",
        14: "scifi.pipe.aabb",
        15: "scifi.robot-taxi.aabb",
        16: "scifi.detailcube.full",
        17: "scifi.detailcube-alt.full",
        18: "scifi.ceiling.iwedge",
        19: "scifi.ceiling-corner.full",
    },
    3: {
        0: "nature.tree-01.aabb"
    },
    4: {
        0: "generic.barricade.aabb"
    },
    5: {
        0: "generic.stairs.wedge",
        1: "generic.roof.wedge",
        2: "generic.metal-ramp.wedge",
        3: "scifi.ramp.wedge",
        4: "scifi.roof.wedge"
    },
    6: {
        0: "generic.metal-ladder.ladder"
    },

    10: {
        0: "SPECIAL.barrier.full.verysoft"
    }
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