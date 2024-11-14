import {
  createCanvas,
  loadImage
} from 'canvas';
import fs from 'fs';
import https from 'node:https';
import webp from 'webp-converter';
import path from 'path';

import { items } from './items.js';
import { filterName } from '#stampsGenerator';

const imageUrl = 'https://shellshock.io/img/stamps.webp';
const outputDir = './src/scripts/stamps-slicer/store';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const tempPngPath = path.join(outputDir, 'stamps.png');

async function downloadAndConvertWebpToPng() {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream('./stamps.webp');

    https.get(imageUrl, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(async () => {
          try {
            await webp.dwebp('./stamps.webp', tempPngPath, '-o');
            resolve(tempPngPath);
          } catch (err) {
            reject(err);
          }
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function cutImage() {
  try {
    const pngPath = await downloadAndConvertWebpToPng();
    const image = await loadImage(pngPath);
    const imgWidth = image.width;
    const imgHeight = image.height;

    const tileSize = 128;
    let count = 0;

    const canvas = createCanvas(tileSize, tileSize);
    const ctx = canvas.getContext('2d');

    for (let y = 0; y < imgHeight; y += tileSize) {
      for (let x = 0; x < imgWidth; x += tileSize) {
        ctx.clearRect(0, 0, tileSize, tileSize);
        ctx.drawImage(image, x, y, tileSize, tileSize, 0, 0, tileSize, tileSize);

        const buffer = canvas.toBuffer('image/png');
        var name = `${outputDir}/tile_${count}.png`;
        if (stampPositions[JSON.stringify({ x, y })]) {
          name = `${stampPositions[JSON.stringify({ x, y })]}`;
          name = filterName(name);
          name = `${outputDir}/${name}.png`;
          console.log(`Exporting stamp ${stampPositions[JSON.stringify({ x, y })]} to ${name}`);
          fs.writeFileSync(name, buffer);
          count++;
        };
      }
    }

    console.log(`Successfully exported ${count} images to the ${outputDir} directory.`);
  } catch (error) {
    console.error('Error cutting the image:', error);
  }
}

const stampPositions = {};

items.forEach((item) => {
  if (item.item_type_name !== 'Stamp') return;

  var item_data = item.item_data;
  var stampName = item.name;

  var stampPos = {
    x: item_data.x * 128,
    y: item_data.y * 128
  };

  stampPositions[JSON.stringify(stampPos)] = stampName;
});

console.log(stampPositions);

cutImage();