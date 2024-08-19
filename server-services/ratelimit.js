export const addRequest = async (ss, ip, type) => {
    let now = Math.floor(Date.now() / 1000);
    // let result = await ss.getOne(`SELECT * FROM ip_requests WHERE ip = ?`, [ip]);
    let result = ss.requests_cache[ip] || {
        sensitive_count: 0,
        regular_count: 0,
        last_sensitive_reset: now,
        last_regular_reset: now,
    };

    // if (!result) {
    //     await ss.runQuery(`INSERT INTO ip_requests (ip) VALUES (?)`, [ip]);
    //     result = { sensitive_count: 0, regular_count: 0 };
    // }

    // let { sensitive_count, regular_count, last_sensitive_reset, last_regular_reset } = result;

    // reset counts, if necessary
    if (now - result.last_sensitive_reset > (ss.config.services.ratelimit.sensitive.reset_interval || 5 * 60)) {
        // reset sensitive count every 5 minutes
        result.sensitive_count = 0;
        // await ss.runQuery(`
        //     UPDATE ip_requests
        //     SET sensitive_count = 0, last_sensitive_reset = ?
        //     WHERE ip = ?
        // `, [now, ip]);
    };

    if (now - result.last_regular_reset > (ss.config.services.ratelimit.regular.reset_interval || 60)) {
        // reset regular count every 1 minute
        result.regular_count = 0;
        // await ss.runQuery(`
        //     UPDATE ip_requests
        //     SET regular_count = 0, last_regular_reset = ?
        //     WHERE ip = ?
        // `, [now, ip]);
    };

    //update with new counts
    if (type === 'sensitive') {
        result.sensitive_count++;
        // await ss.runQuery(`
        //     UPDATE ip_requests
        //     SET sensitive_count = ?
        //     WHERE ip = ?
        // `, [sensitive_count, ip]);
    } else if (type === 'regular') {
        result.regular_count++;
        // await ss.runQuery(`
        //     UPDATE ip_requests
        //     SET regular_count = ?
        //     WHERE ip = ?
        // `, [regular_count, ip]);
    };

    ss.requests_cache[ip] = result;

    return result;
}

export const allowRequest = async (ss, ip, type) => {
    const counts = await addRequest(ss, ip, type);

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