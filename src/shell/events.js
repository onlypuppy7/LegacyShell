//basic
import fs from 'node:fs';
import path from 'node:path';
//legacyshell: events
import { devlog } from '#constants';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

/*
    events are a way to coordinate when different things should happen throughout the year

    making a system like this isnt easy due to the way the calendar works

    events are specified by a start time and its duration
*/

export const defaultEvents = [{
    name: '_default',
    start: "01-01",
    duration: "999w",
    data: {
        shop: {
            perm: [ //items that are always in the shop
                "Permanent",

                "PermCluck9mm",
                "PermEggk47",
                "PermCSG1",
                "PermDozenGauge",
                "PermRPEGG",

                "GOLDset",
                "HappyGunBear",
            ], 
            temp: [ //items that are only in the shop for the duration of the event; functionally the same as perm but is used to denote elsewhere that these items are temporary
                // "Halloween",
            ],

            tier1pool: [ //one item from this list will be chosen if chance is met
            ],

            tier2pool: [ //one (tier2count) item from this list will always be chosen
            ],
            tier2count: 1,

            tier3pool: [ //five (tier3count) items from this list will always be chosen
            ],
            tier3count: 5,
        }
    },
}, {
    name: 'groundhog-day',
    start: "02-02",
    duration: "2w",
    data: {
        shop: {
            temp: [ //items that are only in the shop for the duration of the event
                "GroundhogDay" //tag
            ],
        }
    },
}, {
    name: 'legacyshellanniversary',
    start: "12-07",
    duration: "2w",
    data: {},
}, {
    name: 'shellshockersanniversary',
    start: "09-01",
    duration: "2w",
    data: {
        shop: {
            temp: [ //items that are only in the shop for the duration of the event
                50020, //shell shockers cap
            ],
        }
    },
}, {
    name: 'spring',
    start: "03-20",
    duration: "13w",
    data: {},
}, {
    name: 'summer',
    start: "06-20",
    duration: "13w",
    data: {},
}, {
    name: 'autumn',
    start: "09-22",
    duration: "13w",
    data: {},
}, {
    name: 'winter',
    start: "12-21",
    duration: "13w",
    data: {},
}, {
    name: 'christmas',
    start: "12-10",
    duration: "4w",
    data: {
        shop: {
            temp: [ //items that are only in the shop for the duration of the event
                "Christmas",
            ],
        }
    },
}, {
    name: 'new-year',
    start: "12-31",
    duration: "2w",
    data: {
        shop: {
            temp: [ //items that are only in the shop for the duration of the event
                "NewYears2019",
            ],
        }
    },
}, {
    name: 'easter',
    start: "03-24", //annoying holiday that moves around
    duration: "4w",
    data: {
        shop: {
            temp: [ //items that are only in the shop for the duration of the event
                "Easter",
            ],
        },
    },
}, {
    name: 'halloween',
    start: "10-15",
    duration: "3w",
    data: {
        shop: {
            temp: [ //items that are only in the shop for the duration of the event
                "Halloween",
            ],
        },
    },
}, {
    name: 'valentines',
    start: "02-14",
    duration: "1w",
    data: {
        shop: {
            temp: [ //items that are only in the shop for the duration of the event
                "ValentinesDay",
            ],
        },
    },
}, {
    name: 'april-fools',
    start: "04-01",
    duration: "1w",
    data: {
        "shop": {
            temp: [
                "AprilFools"
            ],
        },
    },
}, {
    name: 'thanksgiving',
    start: "11-22",
    duration: "2w",
    data: {
        shop: {
            temp: [ //items that are only in the shop for the duration of the event
                "Thanksgiving",
            ],
        },
    },
}, {
    name: 'independence-day',
    start: "07-04",
    duration: "1w",
    data: {},
}, {
    name:'january',
    start: "01-01",
    duration: "31d",
    data: {},
}, {
    name:'february',
    start: "02-01",
    duration: "28d",
    data: {},
}, {
    name:'march',
    start: "03-01",
    duration: "31d",
    data: {},
}, {
    name:'april',
    start: "04-01",
    duration: "30d",
    data: {},
}, {
    name:'may',
    start: "05-01",
    duration: "31d",
    data: {},
}, {
    name:'june',
    start: "06-01",
    duration: "30d",
    data: {},
}, {
    name:'july',
    start: "07-01",
    duration: "31d",
    data: {},
}, {
    name:'august',
    start: "08-01",
    duration: "31d",
    data: {},
}, {
    name:'september',
    start: "09-01",
    duration: "30d",
    data: {},
}, {
    name:'october',
    start: "10-01",
    duration: "31d",
    data: {},
}, {
    name:'november',
    start: "11-01",
    duration: "30d",
    data: {},
}, {
    name:'december',
    start: "12-01",
    duration: "31d",
    data: {},
},
];

export class EventManager {
    constructor() {
        this.printed = false;
    };

    async init() {
        this.events = JSON.parse(JSON.stringify(defaultEvents));

        await plugins.emit('eventsInit', { events: this.events, this: this });

        await this.initEvents();
    };

    async initEvents(events) {
        let eventsNow = this.getEventsAtTime();
        Object.assign(eventsNow, events);
        return eventsNow;
    };

    async getEventsAtTime(time = Date.now()) {
        let current = [];
        let currentArray = [];

        if (!this.events) await this.init();

        for (const event of this.events) {
            event.timeStart = this.parseDate(event.start, time);
            event.timeDuration = this.parseHumanToMs(event.duration, time);
            event.timeEnd = event.timeStart + event.timeDuration;

            if (!this.printed) devlog(event.name, event.start, event.duration, 'starts at', new Date(event.timeStart), 'and ends at', new Date(event.timeEnd), event.timeDuration/(60e3*60*24), event.data);

            if (event.timeStart <= time && time <= event.timeEnd) {
                if (!this.printed) log.bgCyan('event', event.name, 'is happening now');
                current.push(event);
                currentArray.push(event.name);
            };
        };

        this.printed = true; //only print once because it's annoying

        return {
            current,
            currentArray,
        };
    };

    isActive(event) {
        return this.getEventsAtTime().currentArray.includes(event);
    };

    parseDate(dateStr, timeNow = Date.now()) {
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/) || dateStr.match(/^\d{2}-\d{2}$/)) {
            return this.dateToUnix(dateStr, timeNow);
        } else if (dateStr.match(/^W\d{2}-\d$/)) {
            return this.weekDayToUnix(dateStr, timeNow);
        } else {
            throw new Error('Invalid format. Use YYYY-MM-DD or MM-DD or "W"WW-DD.');
        };
    };

    dateToUnix(dateStr, timeNow = Date.now()) {
        const currentYear = new Date().getFullYear();
        let year, month, day, match;
    
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            year = Number(match[1]);
            month = Number(match[2]) - 1;
            day = Number(match[3]);
        } else if (dateStr.match(/^\d{2}-\d{2}$/)) {
            match = dateStr.match(/^(\d{2})-(\d{2})$/);
            year = currentYear;
            month = Number(match[1]) - 1;
            day = Number(match[2]);
        } else {
            throw new Error('Invalid format. Use YYYY-MM-DD or MM-DD.');
        };
    
        const targetDate = new Date(year, month, day);
        let time = targetDate.getTime();
    
        if (timeNow <= time) {
            targetDate.setFullYear(targetDate.getFullYear() - 1);
            time = targetDate.getTime();
        };
    
        return time;
    };

    weekDayToUnix(weekDay, timeNow = Date.now()) {
        const currentYear = new Date().getFullYear();
        let year;
        let match;
        
        if (weekDay.startsWith('W')) {
            year = currentYear;
            match = weekDay.match(/W(\d{2})-(\d)/);
        } else {
            match = weekDay.match(/^(\d{4})-W(\d{2})-(\d)/);
            if (!match) throw new Error('Invalid format. Use YYYY-WXX-X or WXX-X.');
            year = Number(match[1]);
        };
    
        if (!match) throw new Error('Invalid week-day format. Use YYYY-WXX-X or WXX-X.');
    
        const [, week, day] = match.map(Number);
    
        const firstDayOfYear = new Date(year, 0, 1);
    
        const firstMonday = new Date(firstDayOfYear);
        const dayOfWeek = firstMonday.getDay();
        const daysUntilMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
        firstMonday.setDate(firstMonday.getDate() + (7 - daysUntilMonday));
    
        const targetDate = new Date(firstMonday);
        targetDate.setDate(targetDate.getDate() + (week - 1) * 7 + (day - 1));

        let time = Math.floor(targetDate.getTime());

        if (timeNow <= time) {
            //take away a year
            time -= 1e3*60*60*24*365;
        };
    
        return time;
    };

    parseHumanToMs(input, time = Date.now()) { //takes inputs like 2w3d4h5min6s7ms (extreme example, more likely just 1w) and converts it to ms
        const timeUnits = {
            w: 1e3*60*60*24*7,
            d: 1e3*60*60*24,
            h: 1e3*60*60,
            min: 1e3*60,
            s: 1e3,
            ms: 1,
        };
        
        const regex = /(\d+)(w|d|h|min|s|ms)/g;
        let totalMs = 0;
        let match;
    
        while ((match = regex.exec(input)) !== null) {
            const [_, value, unit] = match;
            totalMs += parseInt(value, 10) * (timeUnits[unit] || 0);
        };
        
        return totalMs;
    };
};

export const events = new EventManager();

export default events;