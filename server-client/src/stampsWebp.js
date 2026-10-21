//basic
import fs from 'node:fs';
//

//sends the lossless webp of the stamps spritesheet under the same url to browsers that take it, png otherwise
export default function stampsWebp(webpPath) {
    return (req, res, next) => {
        if (req.path !== '/img/stamps.png') return next();

        res.set('Vary', 'Accept');
        if (!(req.headers.accept || '').includes('image/webp') || !fs.existsSync(webpPath)) return next();

        res.sendFile(webpPath, { dotfiles: 'allow' }, (error) => {
            if (error && !res.headersSent) next();
        });
    };
};
