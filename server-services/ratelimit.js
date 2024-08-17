export const addRequest = async (db, ip, type) => {
    const runQuery = util.promisify(db.run.bind(db));
    const getOne = util.promisify(db.get.bind(db));

    let now = Math.floor(Date.now() / 1000);
    let result = await getOne(`SELECT * FROM ip_requests WHERE ip = ?`, [ip]);

    if (!result) {
        await runQuery(`INSERT INTO ip_requests (ip) VALUES (?)`, [ip]);
        result = { sensitive_count: 0, regular_count: 0 };
    }

    let { sensitive_count, regular_count, last_sensitive_reset, last_regular_reset } = result;

    // reset counts, if necessary
    if (now - last_sensitive_reset > (ss.config.services.ratelimit.sensitive.reset_interval || 5 * 60)) {
        // reset sensitive count every 5 minutes
        sensitive_count = 0;
        await runQuery(`
            UPDATE ip_requests
            SET sensitive_count = 0, last_sensitive_reset = ?
            WHERE ip = ?
        `, [now, ip]);
    };

    if (now - last_regular_reset > (ss.config.services.ratelimit.regular.reset_interval || 60)) {
        // reset regular count every 1 minute
        regular_count = 0;
        await runQuery(`
            UPDATE ip_requests
            SET regular_count = 0, last_regular_reset = ?
            WHERE ip = ?
        `, [now, ip]);
    };

    //update with new counts
    if (type === 'sensitive') {
        sensitive_count++;
        await runQuery(`
            UPDATE ip_requests
            SET sensitive_count = ?
            WHERE ip = ?
        `, [sensitive_count, ip]);
    } else if (type === 'regular') {
        regular_count++;
        await runQuery(`
            UPDATE ip_requests
            SET regular_count = ?
            WHERE ip = ?
        `, [regular_count, ip]);
    };

    return { sensitive_count, regular_count };
}

export const allowRequest = async (ip, type) => {
    const counts = await addRequest(ip, type);

    if (type === 'sensitive' && counts.sensitive_count >= (ss.config.services.ratelimit.sensitive.max_count || 5)) {
        return false;
    } else if (type === 'regular' && counts.regular_count >= (ss.config.services.ratelimit.regular.max_count || 10)) {
        return false;
    };

    return true;
}

export default {
    addRequest,
    allowRequest
}