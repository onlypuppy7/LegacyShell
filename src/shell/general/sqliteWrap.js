//legacyshell: general
//shared better-sqlite3 wrapper: keeps the async runQuery/getOne/getAll interface every
//caller was already written against for the old sqlite3 driver, and matches that driver's
//permissive bind-param behavior (accepts params as an array OR as separate args, coerces
//booleans/undefined since better-sqlite3 throws on both instead of silently converting them).
//

function sanitizeParam (value) {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
};

function bindParams (params) {
    const arr = (params.length === 1 && Array.isArray(params[0])) ? params[0] : params;
    return arr.map(sanitizeParam);
};

export function wrapDatabase (db) {
    return {
        runQuery: async (sql, ...params) => db.prepare(sql).run(...bindParams(params)),
        getOne:   async (sql, ...params) => db.prepare(sql).get(...bindParams(params)),
        getAll:   async (sql, ...params) => db.prepare(sql).all(...bindParams(params)),
    };
};

export default { wrapDatabase };
