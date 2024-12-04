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
    data: {},
}, {
    name: 'new-year',
    start: "12-31",
    duration: "2w",
    data: {},
}, {
    name: 'easter',
    start: "03-24", //annoying holiday that moves around
    duration: "4w",
    data: {},
}, {
    name: 'halloween',
    start: "10-15",
    duration: "3w",
    data: {},
}, {
    name: 'valentines',
    start: "02-14",
    duration: "1w",
    data: {},
}, {
    name: 'april-fools',
    start: "04-01",
    duration: "1w",
    data: {},
}, {
    name: 'thanksgiving',
    start: "11-22",
    duration: "2w",
    data: {},
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

        await this.getEventsAtTime();
    };

    async getEventsAtTime(time = Date.now()) {
        this.current = [];
        this.currentArray = [];

        for (const event of this.events) {
            const start = this.parseDate(event.start, time);
            const duration = this.parseHumanToMs(event.duration, time);
            const end = start + duration;

            if (!this.printed) devlog(event, time, start, duration, end);

            if (start <= time && time <= end) {
                if (!this.printed) log.bgCyan('event', event.name, 'is happening now');
                this.current.push(event);
                this.currentArray.push(event.name);
            };
        };

        this.printed = true;

        return {
            current: this.current,
            currentArray: this.currentArray,
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