import express from 'express';
import path from 'node:path';
import log from 'puppylog';
import { pluginInstance } from './index.js';

const app = express();
const port = 663;

export async function startDashboard(analDB) {
    const publicPath = path.join(pluginInstance.thisDir, 'dashboard');
    app.use(express.static(publicPath));

    app.get('/api/stats', async (req, res) => {
        const range = req.query.range || 'all';
        let seconds = 0;
        if (range.endsWith('h')) seconds = parseInt(range) * 3600;
        else if (range.endsWith('d')) seconds = parseInt(range) * 86400;

        const timeClause = seconds > 0 ? `WHERE time > (strftime('%s', 'now') - ${seconds})` : "";
        const bucket = seconds > 86400 * 7 ? 86400 : 3600;
        const bms = bucket * 1000;

        try {
            const query = (q) => analDB.getAll(q);
            const grouped = (tbl) => query(`SELECT (time/${bucket})*${bms} as x, count(*) as y FROM ${tbl} ${timeClause} GROUP BY x ORDER BY x ASC`);
            
            const [
                kills, deaths, logins, logFails, tokens, registers, regFails, vips,
                purchases, purchaseFails, redeems, redeemFails, feedback, rooms
            ] = await Promise.all([
                grouped('player_kills'), grouped('player_deaths'),
                grouped('player_logins'), grouped('player_loginfails'),
                grouped('player_tokenlogins'), grouped('player_registers'),
                grouped('player_registerfails'), grouped('player_vipredeems'),
                grouped('item_purchases'), grouped('item_purchasefails'),
                grouped('item_coderedeems'), grouped('item_coderedeemfails'),
                query(`SELECT time*1000 as t, feedback FROM player_feedbacks ${timeClause} ORDER BY t DESC LIMIT 100`),
                // ROOM DATA: We calculate both PEAK and TOTAL VOLUME for the bucket
                query(`SELECT (time/${bucket})*${bms} as x, 
                       MAX(public + private) as peak, 
                       SUM(public + private) as total_volume,
                       MAX(public) as pub_peak, 
                       MAX(private) as priv_peak 
                       FROM room_counts ${timeClause} GROUP BY x`)
            ]);

            res.json({
                series: { kills, deaths, logins, logFails, tokens, registers, regFails, vips, purchases, purchaseFails, redeems, redeemFails, rooms },
                totals: {
                    kills: (await analDB.getOne(`SELECT count(*) as c FROM player_kills ${timeClause}`)).c,
                    regSuccess: (await analDB.getOne(`SELECT count(*) as c FROM player_registers ${timeClause}`)).c,
                    sales: (await analDB.getOne(`SELECT count(*) as c FROM item_purchases ${timeClause}`)).c,
                    maxPeak: (await analDB.getOne(`SELECT MAX(public + private) as c FROM room_counts ${timeClause}`)).c || 0
                },
                feedback
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.listen(port, () => log.green(`Analytics Dashboard: http://localhost:${port}`));
}