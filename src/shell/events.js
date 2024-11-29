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
    start: "W12-1",
    duration: "13w",
    data: {},
}, {
    name: 'summer',
    start: "W25-1",
    duration: "13w",
    data: {},
}, {
    name: 'autumn',
    start: "W38-1",
    duration: "13w",
    data: {},
}, {
    name: 'winter',
    start: "W51-1",
    duration: "13w",
    data: {},
}, {
    name: 'christmas',
    start: "W50-7",
    duration: "1w",
    data: {},
}, {
    name: 'new-year',
    start: "W50-7",
    duration: "2w",
    data: {},
}, {
    name: 'easter',
    start: "W12-4", //annoying holiday that moves around
    duration: "4w",
    data: {},
}, {
    name: 'halloween',
    start: "W42-7",
    duration: "1w",
    data: {},
}, {
    name: 'valentines',
    start: "W06-4",
    duration: "1w",
    data: {},
}, {
    name: 'april-fools',
    start: "W13-2",
    duration: "1w",
    data: {},
}, {
    name: 'thanksgiving',
    start: "W47-4",
    duration: "1w",
    data: {},
}, {
    name: 'independence-day',
    start: "W27-7",
    duration: "1w",
    data: {},
}, {
    name:'january',
    start: "W00-1",
    duration: "31d",
    data: {},
}, {
    name:'february',
    start: "W04-4",
    duration: "28d",
    data: {},
}, {
    name:'march',
    start: "W08-4",
    duration: "31d",
    data: {},
}, {
    name:'april',
    start: "W13-2",
    duration: "30d",
    data: {},
}, {
    name:'may',
    start: "W17-4",
    duration: "31d",
    data: {},
}, {
    name:'june',
    start: "W21-7",
    duration: "30d",
    data: {},
}, {
    name:'july',
    start: "W26-2",
    duration: "31d",
    data: {},
}, {
    name:'august',
    start: "W30-4",
    duration: "31d",
    data: {},
}, {
    name:'september',
    start: "W35-1",
    duration: "30d",
    data: {},
}, {
    name:'october',
    start: "W39-3",
    duration: "31d",
    data: {},
}, {
    name:'november',
    start: "W43-6",
    duration: "30d",
    data: {},
}, {
    name:'december',
    start: "W47-7",
    duration: "31d",
    data: {},
},
];

export class EventManager {
    constructor() {
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
            const start = this.weekDayToUnix(event.start);
            const duration = this.parseHumanToMs(event.duration);
            const end = start + duration;

            // console.log(event, time, start, duration, end);

            if (start <= time && time <= end) {
                devlog('event', event.name, 'is happening now');
                this.current.push(event);
                this.currentArray.push(event.name);
            };
        };

        return {
            current: this.current,
            currentArray: this.currentArray,
        };
    };

    weekDayToUnix(weekDay) {
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

        if (Date.now() <= time) {
            //take away a year
            time -= 1e3*60*60*24*365;
        };
    
        return time;
    };

    parseHumanToMs(input) { //takes inputs like 2w3d4h5min6s7ms (extreme example, more likely just 1w) and converts it to ms
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