//legacyshell: string width
import { isClient } from '#constants';
import { createCanvas } from '@napi-rs/canvas';
//

//(server-only-start)
const nameTestCanvas = createCanvas(200, 50);
//(server-only-end)

export function getStringWidth(str) {
    const context = nameTestCanvas.getContext('2d');
    
    context.font = '1em Nunito, sans-serif'; // same font definition on both environments

    return context.measureText(str).width / (isClient ? 1 : 2); //dont ask abt the division
};

export function getStringHeight(str) {
    const context = nameTestCanvas.getContext('2d');

    context.font = '1em Nunito, sans-serif'; // same font definition on both environments

    const metrics = context.measureText(str);
    
    const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || 16;

    return textHeight (isClient ? 1 : 2);
};

export function fixStringWidth(str, len = 80) {
    while (getStringWidth(str) > len) {
        str = str.substr(0, str.length - 1);
    };

    return str;
};

// console.log("STRING WIDTH\n\n\n\nn\n\n\n\n\n\n\n", fixStringWidth("298h398fh23oi23fhf23328hf20aw3g"), getStringWidth("298h398fh23oi23fhf23328hf20aw3g"));
// console.log("STRING HEIGHT\n\n\n\nn\n\n\n\n\n\n\n", getStringHeight("298h398fh23oi23fhf23328hf20aw3g"));
// console.log("STRING HEIGHT\n\n\n\nn\n\n\n\n\n\n\n", getStringHeight("⎠"));
// console.log("STRING HEIGHT\n\n\n\nn\n\n\n\n\n\n\n", getStringHeight("t̸̡͕̟̮̬͕̙̹̹̦̦̙̺̗͋̇̿̌̐͆̏͂͌͗̔̊̈̕"));