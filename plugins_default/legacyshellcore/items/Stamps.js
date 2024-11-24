/*
    Default stamps

    Edit meta ids in the range 1-50,000

    Up to 10k is intended to be used for the items from the original game
    10k-20k is intended to be used for custom items in the LegacyShellCore plugin
    Past that is fair game for custom items in other plugins

    Note that 0 is reserved for no stamp
*/

//basic
import fs from 'node:fs';
import path from 'node:path';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: plugins
import { pluginInstance } from '../index.js';
//

var items = {
    "Stamps": [{
        "meta_id": 10000,
        "name": "Sex",
        "price": 500,
        "item_type_id": 2,
        "item_type_name": "Stamp",
        "category_name": "Stamps",
        "exclusive_for_class": null,
        "item_data": {},
        "is_available": false
    }]
};

//programmatically add stamps from the stamps directory :D
var stampsDir = path.join(pluginInstance.thisDir, 'stamps');

if (fs.existsSync(stampsDir)) {
    var stampImgs = fs.readdirSync(stampsDir);

    stampImgs.forEach((file) => {
        var ext = path.extname(file);

        if (ext !== '.png') return;

        var base = path.basename(file, ext);

        if (!base.includes('=')) return;

        var info = base.split('=')[0].split('_');
        var name = base.split('=')[1];

        var meta_id = (parseInt(info[0]) || 0) + 10000;
        var price = parseInt(info[1]) || 500;
        var is_available = (info[2] || "false").toLowerCase().includes("t");

        items.Stamps.push({
            meta_id,
            name,
            price,
            item_type_id: 2,
            item_type_name: "Stamp",
            category_name: "Stamps",
            exclusive_for_class: null,
            item_data: {},
            is_available
        });

        log.bgGray(`LegacyShellCore: Added stamp ${name} with meta_id ${meta_id}, price ${price}, and availability ${is_available}`);
    });
};

export default items;