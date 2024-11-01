//

export const isClient = typeof (window) !== 'undefined'; //best to define once, or something
export const isServer = typeof (window) === 'undefined'; //clearer in code

export const devlog = function (...args) {
    if (isServer) {
        console.log(...args);
    } else if (devmode || ss?.config?.devlogs) {
        console.log(getTimestamp(), "LS_DEVLOG", ...args);
    };
};

export const clientlog = function (...args) {
    if (isClient && devmode || ss?.config?.devlogs) {
        console.log(getTimestamp(), "LS_CLN_LOG", ...args);
    };
};

export const serverlog = function (...args) {
    if (isServer) {
        console.log(getTimestamp(), "LS_SRV_LOG", ...args);
    };
};

export const getTimestamp = (noBrackets) => {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); 
    const year = now.getFullYear().toString().slice(-2);
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
    
    return noBrackets
        ? `${day}-${month}-${year}_${hours}-${minutes}-${seconds}-${milliseconds}`
        : `[${day}-${month}-${year} ${hours}:${minutes}:${seconds}.${milliseconds}]`;
};