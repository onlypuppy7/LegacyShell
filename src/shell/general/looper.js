//legacyshell: looper
import { TickStep } from '#constants';
//

//fyi: lifted directly from RTW's server

function getMicro() {
    let time = process.hrtime();
    return time[0] * 1000 + time[1] / 1000000;
};

let s2micro = 1e3;
let micro2s = 1 / s2micro; // avoid a divide later, although maybe not nessecary
let ms2micro = 1;

/**
 * Create a game loop that will attempt to update at some target `tickLengthMs`.
 *
 * `tickLengthMs` defaults to 30fps (~33.33ms).
 *
 * Internally, the `gameLoop` function created has two mechanisms to update itself.
 * One for coarse-grained updates (with `setTimeout`) and one for fine-grained
 * updates (with `setImmediate`).
 *
 * On each tick, we set a target time for the next tick. We attempt to use the coarse-
 * grained "long wait" to get most of the way to our target tick time, then use the
 * fine-grained wait to wait the remaining time.
 */
export default function createLoop (update, tickLengthMs) {
    if (!tickLengthMs) tickLengthMs = TickStep;

    // expected tick length
    let tickLengthMicro = tickLengthMs * ms2micro;

    // We pick the floor of `tickLengthMs - 1` because the `setImmediate` below runs
    // around 16ms later and if our coarse-grained 'long wait' is too long, we tend
    // to miss our target framerate by a little bit
    let longwaitMs = Math.floor(tickLengthMs - 1);
    let longwaitMicro = longwaitMs * ms2micro;

    let prev = getMicro();
    let target = getMicro();

    let isRunning = true;
    let frame = 0;
    let timeoutId;

    // console.log(36756767)

    let gameLoop = function () {
        if (!isRunning) return;

        frame++;

        let now = getMicro();

        if (now >= target) {
            let delta = now - prev;

            prev = now;
            target = now + tickLengthMicro;

            // actually run user code
            console.log("looper: run");
            update(delta * micro2s);
        };

        // re-grab the current time in case we ran update and it took a long time
        let remainingInTick = target - getMicro();
        if (remainingInTick > longwaitMicro) {
            // unfortunately it seems our code/node leaks memory if setTimeout is
            // called with a value less than 16, so we give up our accuracy for
            // memory stability
            timeoutId = setTimeout(gameLoop, Math.max(longwaitMs, 16));
        } else {
            setImmediate(gameLoop);
        };
    };
    // begin the loop!
    gameLoop();

    return {
        stop: function () {
            isRunning = false;
            clearTimeout(timeoutId);
            console.log("stop loop");
        },
    };
};