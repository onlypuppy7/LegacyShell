//legacyshell: string width
import { createCanvas } from 'canvas';
//

//(server-only-start)
const nameTestCanvas = createCanvas(200, 50);
//(server-only-end)

export function fixStringWidth(str, len = 80) {
    const context = nameTestCanvas.getContext('2d');

    context.font = '1em Nunito, sans-serif';

    while (context.measureText(str).width > len) {
        str = str.substr(0, str.length - 1);
    };

    return str;
};