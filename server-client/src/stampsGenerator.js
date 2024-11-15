//basic
import fs from 'node:fs';
import path from 'node:path';
//legacyshell: preparing stamps
import sharp from 'sharp';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
import { stampSize } from '#constants';
//

export function filterName(name) {
    name = name.replace(/[?\/\<]/g, '_'); //just the specific ones causing issues
    return name;
};

export var widthheight = 32;

export async function prepareStamps() {
    let items = JSON.parse(ss.cache.items);
    //filter out items which arent stamps
    let stamps = items.filter((item) => item.item_type_name === 'Stamp');
    //sort by meta id
    stamps.sort((a, b) => a.meta_id - b.meta_id);

    // console.log(stamps);

    log.info('Preparing stamps...', stamps.length);

    var stampImageDirs = [
        path.join(ss.currentDir, 'src', 'stamps'),
        //add more via plugins, if you want. if you dont, i dont care
    ];

    var stampImages = {};

    plugins.emit('stampImageDirs', {this: this, stampImageDirs, stampImages});

    for (let dir of stampImageDirs) {
        if (!fs.existsSync(dir)) {
            log.error('Stamp image directory not found:', dir);
            continue;
        };

        let files = fs.readdirSync(dir);

        for (let file of files) {
            var ext = path.extname(file);
            var base = filterName(path.basename(file, ext));
            var filepath = path.join(dir, file);
            // console.log(base, ext);

            if (ext !== '.png') continue;

            stampImages[base] = filepath;

            //the rest of these things are just for compatibility with the new stamp names if required

            //replace anything after "Stamp" with ""
            var noStamp = base.replace(/ Stamp.*/, '');

            stampImages[noStamp] = filepath;
            
            var replacements = {
                "Pablo Smile": "Smiley",
                "Happy Bear": "Happy Gun Bear",
                "Dapper Mustache": "Mustache",
            };

            if (replacements[noStamp]) {
                stampImages[replacements[noStamp]] = filepath;
            };

            if (noStamp.includes('&')) {
                stampImages[noStamp.replace("&", "and")] = filepath;
            };

            //allows you to insert extra information before the =
            //eg: "0=LegacyShell"
            //in this instance acting as a way to easily ID the stamp without even needing the Stamps.js
            if (noStamp.includes('=')) { 
                console.log('found', noStamp, noStamp.replace(/^.*?=/, ''));
                stampImages[noStamp.replace(/^.*?=/, '')] = filepath;
            };
        };
    };

    // console.log(stampImages);

    var filesForImage = [];

    filesForImage.push(''); //blank for no stamp

    for (let stamp of stamps) {
        let name = filterName(stamp.name);

        if (stampImages[name]) {
            filesForImage.push({
                id: stamp.id,
                file: stampImages[name],
            });
        } else {
            log.warning('Stamp not found:', name);
        };
    };

    widthheight = Math.ceil(Math.pow(filesForImage.length, 0.5));

    log.info(filesForImage.length, "Stamp images prepared. Will use a", widthheight, "x", widthheight, "grid - hence total:", widthheight * widthheight);

    var image = sharp({
        create: {
            width: stampSize * widthheight,
            height: stampSize * widthheight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    });

    var x = 0;
    var y = 0;

    const composites = [];

    for (let file of filesForImage) {
        if (x >= widthheight) {
            x = 0;
            y++;
        };
    
        if (file && file !== "") {
            composites.push({
                id: file.id,
                x: x,
                y: y,

                input: await sharp(file.file).resize(stampSize, stampSize).toBuffer(),
                top: y * stampSize,
                left: x * stampSize,
            });
        } else if (!(x+y === 0)) {
            log.warning('No image for stamp', x, y);
        };
    
        x++;
    };
    
    image.composite(composites);

    var output = path.join(ss.currentDir, 'store', 'client-modified', 'img', 'stamps.png');

    if (!fs.existsSync(path.dirname(output))) {
        fs.mkdirSync(path.dirname(output), {recursive: true});
    };

    log.info('Saving stamps to', output);

    await image.toFile(output);

    for (let composite of composites) {
        for (let item of items) {
            if (item.id === composite.id) {
                log.italic('[Stamp] Adding:', item.name, 'to stamps.png at', composite.x, composite.y);
                item.item_data.x = composite.x;
                item.item_data.y = composite.y;
            };
        };
    };

    ss.cache.items = JSON.stringify(items);
};

export function createStampsUV(wh = widthheight) {
    log.info('Creating stamps UV...', wh);
    var uv = [
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        -(.045/wh),
        1-(1/wh),
        (.2048/wh),
        1-(1.04/wh),
        (0.00015*wh),
        (1-(.736/wh)),
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        -(.0448/wh),
        1-(1/wh),
        -(.208/wh),
        1-(.768/wh),
        0,
        1,
        0,
        1,
        0,
        1,
        (1.0496/wh),
        1-(1/wh),
        (1.216/wh),
        1-(.768/wh),
        (.928/wh),
        (1-(.736/wh)),
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        (.6272/wh),
        1-(.1824/wh),
        (.7106/wh),
        1+(.1216/wh),
        (0.5024/wh),
        1+(.048/wh),
        (.7744/wh),
        1-(.4544/wh),
        (.8768/wh),
        1-(.1472/wh),
        (1.0592/wh),
        1-(.4672/wh),
        (.7106/wh),
        1+(.1216/wh),
        (.9568/wh),
        1+(0.1728/wh),
        (.7106/wh),
        1+(.1216/wh),
        (1.1616/wh),
        1-(.1152/wh),
        (.9568/wh),
        1+(0.1728/wh),
        0,
        1,
        (1.216/wh),
        1-(.768/wh),
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        -(.0512/wh),
        1-(.4672/wh),
        (.1312/wh),
        1-(.1472/wh),
        -(.1536/wh),
        1-(.1152/wh),
        -(.1536/wh),
        1-(.1152/wh),
        (.0512/wh),
        1+(0.1728/wh),
        (.2976/wh),
        1+(.1216/wh),
        (.0512/wh),
        1+(0.1728/wh),
        -(.0512/wh),
        1-(.4672/wh),
        (.2336/wh),
        1-(.4544/wh),
        -(.0512/wh),
        1-(.4672/wh),
        -(.0512/wh),
        1-(.4672/wh),
        (0.3808/wh),
        1-(.1824/wh),
        (.2976/wh),
        1+(.1216/wh),
        (0.5024/wh),
        1+(.048/wh),
        (.2976/wh),
        1+(.1216/wh),
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        (0.5024/wh),
        1+(.048/wh),
        (0.5024/wh),
        1-(.4544/wh),
        (.352/wh),
        1-(.7584/wh),
        (.6528/wh),
        1-(.7584/wh),
        (.2048/wh),
        1-(1.04/wh),
        (.2048/wh),
        1-(1.04/wh),
        (0.5024/wh),
        1-(1.0624/wh),
        (0.8/wh),
        1-(1.04/wh),
        (1.0496/wh),
        1-(1/wh),
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1,
        0,
        1
    ];
    return uv;
};