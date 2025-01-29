//basic
import fs from 'node:fs';
import path from 'node:path';
//legacyshell: preparing stamps
import sharp from 'sharp';
import crypto from 'crypto';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
import { devlog, stampSize } from '#constants';
//

export function filterName(name) {
    name = name.replace(/[?\/\<]/g, '_'); //just the specific ones causing issues
    return name;
};

export var widthheight = 32; //fyi 127 is max (assuming 128x128 stamps)
export var widthheightDetermined = false;
export var cacheModified = false;

async function generateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
};

export async function prepareStamps() {
    let startTime = Date.now();

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

    await plugins.emit('stampImageDirs', {this: this, stampImageDirs, stampImages});

    for (let dir of stampImageDirs) {
        if (!fs.existsSync(dir)) {
            log.error('Stamp image directory not found:', dir);
            continue;
        };

        let files = fs.readdirSync(dir);
        //remove ._ files
        files = files.filter(file => !file.startsWith('._')); //i hate macos

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
    let combinedHash = "";

    filesForImage.push(''); //blank for no stamp

    for (let stamp of stamps) {
        if (!stamp.name) log.warning("stamp has no name!", stamp);

        let name = filterName(stamp.name);

        if (stampImages[name]) {
            filesForImage.push({
                id: stamp.id,
                file: stampImages[name],
            });
            combinedHash += await generateFileHash(stampImages[name]);
        } else {
            log.warning(`Stamp not found: "${name}"`);
        };
    };

    widthheight = Math.ceil(Math.pow(filesForImage.length, 0.5));
    widthheightDetermined = true;

    log.info(filesForImage.length, "Stamp images prepared. Will use a", widthheight, "x", widthheight, "grid - hence total:", widthheight * widthheight);

    // devlog(combinedHash);

    let imageHashesPath = path.join(ss.currentDir, 'store', 'stamps_image_hashes.json');
    let imageHashes = {};

    if (fs.existsSync(imageHashesPath)) {
        imageHashes = JSON.parse(fs.readFileSync(imageHashesPath, 'utf8'));
    };

    var outputImagePath = path.join(ss.currentDir, 'store', 'client-modified', 'img', 'stamps.png');

    let outputImageHash = "undefined";

    if (fs.existsSync(outputImagePath)) {
        outputImageHash = await generateFileHash(outputImagePath);
    };

    let skipGeneration;

    if (imageHashes[combinedHash] === outputImageHash) {
        devlog("no need to redo image!");
        skipGeneration = true;
    };

    var image = skipGeneration || sharp({
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
            var input = skipGeneration || sharp(file.file);

            if (!skipGeneration) {
                var needsBorder = (await needsBorderCheck(input)) ? 2 : 0;
    
                if (needsBorder) {
                    log.beige('Adding border to', file.file);
                    input = input.clone();
                    input = input.extend({
                        top: 1,
                        bottom: 1,
                        left: 1,
                        right: 1,
                        background: { r: 255, g: 255, b: 255, alpha: 0 }
                    });
                };
    
                input = input.resize({
                    width: stampSize - needsBorder,
                    height: stampSize - needsBorder,
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 0 }
                });
    
                input = await input.toBuffer();
            };

            composites.push({
                id: file.id,
                x: x,
                y: y,

                input,
                top: y * stampSize,
                left: x * stampSize,
            });
        } else if (!(x+y === 0)) {
            log.warning('No image for stamp', x, y);
        };
    
        x++;
    };

    log.italic('[Stamps] Modifying item data...');
    for (let composite of composites) {
        for (let item of items) {
            if (item.id === composite.id) {
                // log.italic('[Stamp] Adding:', item.name, 'to stamps.png at', composite.x, composite.y);
                item.item_data.x = composite.x;
                item.item_data.y = composite.y;
            };
        };
    };

    ss.cache.items = JSON.stringify(items);

    cacheModified = true;

    if (skipGeneration) return;
    
    log.italic('[Stamps] Compositing images...');
    image.composite(composites);

    if (!fs.existsSync(path.dirname(outputImagePath))) {
        fs.mkdirSync(path.dirname(outputImagePath), {recursive: true});
    };

    log.info('[Stamps] Saving stamps to', outputImagePath);

    await image.toFile(outputImagePath);

    log.success('Stamps prepared in', Date.now() - startTime, 'ms');
    
    outputImageHash = await generateFileHash(outputImagePath);

    imageHashes[combinedHash] = outputImageHash;

    fs.writeFileSync(imageHashesPath, JSON.stringify(imageHashes, null, 4));

    await plugins.emit('stampsPrepared', {this: this, items, composites, image, output: outputImagePath});
};

export const needsBorderCheck = async (sharpInstance) => {
    try {
        sharpInstance = sharpInstance.clone();
        const metadata = await sharpInstance.metadata();
    
        const rawBuffer = await sharpInstance.raw().toBuffer();
        const { width, height, channels } = metadata;
    
        for (let x = 0; x < width; x++) {
            for (let c = 0; c < channels; c++) {
                if (rawBuffer[x * channels + c] !== 0) return true;
            };
            for (let c = 0; c < channels; c++) {
                if (rawBuffer[((height - 1) * width + x) * channels + c] !== 0) return true;
            };
        };
    
        for (let y = 0; y < height; y++) {
            for (let c = 0; c < channels; c++) {
                if (rawBuffer[(y * width) * channels + c] !== 0) return true;
            };
            for (let c = 0; c < channels; c++) {
                if (rawBuffer[(y * width + (width - 1)) * channels + c] !== 0) return true;
            };
        };
    
        return false;
    } catch (error) {
        log.error('Error checking for border:', error);
        return true;
    };
};

export async function createStampsUV(wh = widthheight, skipWait) {
    log.info('Planning to create stamps UV', wh);

    if (plugins.type === "client" && !skipWait) { //game server really doesnt need to care
        await new Promise(resolve => {
            const check = () => widthheightDetermined ? (wh = widthheight, resolve()) : setTimeout(check, 100);
            check(); console.log("widthheightDetermined", widthheightDetermined);
        });
    };

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
        (.08/wh),
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