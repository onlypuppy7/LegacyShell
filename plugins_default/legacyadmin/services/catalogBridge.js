// Backs the item-catalog tile browser tab - a thin read-only layer over the exact same call the
// shop-generation code already uses (src/shell/catalog.js), just exposed over a services command.
// Item mutation intentionally goes through the SQL/table-editor tab against the `items` table
// (USER-EDITABLE per the root README's DB tags) instead of a bespoke edit form here.
import recs from '#recordsManagement';
import { requireModeratorOrAbove } from './auth.js';

export function registerCatalogBridge(plugins) {
    plugins.on('services:unhandledCommand', async ({ msg, ws, ip }) => {
        if (msg.cmd !== 'adminGetCatalog') return;
        plugins.cancel = true;

        const userData = await requireModeratorOrAbove(msg, ws, ip);
        if (!userData) return;

        const items = await recs.getAllItemData(true);
        ws.send(JSON.stringify({ adminGetCatalog: { items } }));
    });
};
