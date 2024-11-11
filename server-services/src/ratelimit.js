//legacyshell: logging
import log from '#coloured-logging';
//

const createIfNotExists = async (ss, ip, result) => {
    if (!result.entry_exists) {
        ss.config.verbose && log.bgBlue("ratelimit: Writing to DB: insertings reqs "+ip);
        await ss.runQuery(`INSERT INTO ip_requests (ip) VALUES (?)`, [ip]);
        result.entry_exists = true;
    };
};

export const addRequest = async (ss, ip, type) => {
    let now = Math.floor(Date.now() / 1000);
    let result = ss.requests_cache[ip];

    if (!result) {
        ss.config.verbose && log.bgCyan("ratelimit: Reading from DB: get reqs "+ip);
        result = await ss.getOne(`SELECT * FROM ip_requests WHERE ip = ?`, [ip]);
        if (!result) result = {
            sensitive_count: 0,
            regular_count: 0,
            last_sensitive_reset: now,
            last_regular_reset: now,
            entry_exists: false,
        }; else result.entry_exists = true ;
    };

    // if (!result) {
        // await ss.runQuery(`INSERT INTO ip_requests (ip) VALUES (?)`, [ip]);
        // result = { sensitive_count: 0, regular_count: 0 };
    // };

    // let { sensitive_count, regular_count, last_sensitive_reset, last_regular_reset } = result;

    // reset counts, if necessary
    if (now - result.last_sensitive_reset > (ss.config.services.ratelimit.sensitive.reset_interval || 5 * 60)) {
        // reset sensitive count every 5 minutes
        result.sensitive_count = 0;
        result.last_sensitive_reset = now;
        if (result.sensitive_count >= (ss.config.services.ratelimit.sensitive.max_count || 5)) {
            await createIfNotExists(ss, ip, result);
            ss.config.verbose && log.bgBlue("ratelimit: Writing to DB: reset sensitive reqs "+ip);
            await ss.runQuery(`
                UPDATE ip_requests
                SET sensitive_count = 0, last_sensitive_reset = ?
                WHERE ip = ?
            `, [now, ip]);
        };
    };

    if (now - result.last_regular_reset > (ss.config.services.ratelimit.regular.reset_interval || 60)) {
        // reset regular count every 1 minute
        result.regular_count = 0;
        result.last_regular_reset = now;
        if (result.regular_count >= (ss.config.services.ratelimit.regular.max_count || 10)) {
            await createIfNotExists(ss, ip, result);
            ss.config.verbose && log.bgBlue("ratelimit: Writing to DB: reset regular reqs "+ip);
            await ss.runQuery(`
                UPDATE ip_requests
                SET regular_count = 0, last_regular_reset = ?
                WHERE ip = ?
            `, [now, ip]);
        };
    };

    //update with new counts
    if (type === 'sensitive') {
        result.sensitive_count++;
        if (result.sensitive_count >= (ss.config.services.ratelimit.sensitive.max_count || 5)) {
            if (result.sensitive_count == (ss.config.services.ratelimit.sensitive.max_count || 5)) {
                await createIfNotExists(ss, ip, result);
                ss.config.verbose && log.bgBlue("ratelimit: Writing to DB: set sensitive reqs "+ip);
                await ss.runQuery(`
                    UPDATE ip_requests
                    SET sensitive_count = ?
                    WHERE ip = ?
                `, [result.sensitive_count, ip]);
            };
            return false;
        };
    } else if (type === 'regular') {
        result.regular_count++;
        if (result.regular_count >= (ss.config.services.ratelimit.regular.max_count || 10)) {
            if (result.regular_count == (ss.config.services.ratelimit.regular.max_count || 10)) {
                await createIfNotExists(ss, ip, result);
                ss.config.verbose && log.bgBlue("ratelimit: Writing to DB: set regular reqs "+ip);
                await ss.runQuery(`
                    UPDATE ip_requests
                    SET regular_count = ?
                    WHERE ip = ?
                `, [result.regular_count, ip]);
            };
            return false;
        };
    };

    ss.requests_cache[ip] = result;

    return true;
};

export const allowRequest = async (ss, ip, type) => {
    const verdict = await addRequest(ss, ip, type);

    return verdict;
};

export default {
    addRequest,
    allowRequest
};