
import { isUdf, isObject, makeObj } from "./type.js";

/**
 * Initializes an options argument with defaults
 * for options not supplied.
 */
function initOptions(options, defaults) {
    if (isUdf(options)) {
        options = makeObj();
    } else if (!isObject(options)) {
        throw new Error("Invalid argument.")
    }

    return Object.assign(defaults, options);
}

const TIMES_LOGGED = makeObj();

/**
 * Logs a statement a maximum number of times
 * over the course of the program.
 * key      - an arbitrary unique key to keep track of the statement.
 * maxTimes - the maximum number of times to log the statement.
 * args     - arguments passed to console.log().
 */
function logMaxTimes(key, maxTimes, ...args) {
    if (!(key in TIMES_LOGGED)) {
        TIMES_LOGGED[key] = 0;
    }

    if (TIMES_LOGGED[key] < maxTimes) {
        TIMES_LOGGED[key] += 1;
        // eslint-disable-next-line no-console
        console.log(...args);
    }
}

function logOnce(key, ...args) {
    logMaxTimes(key, 1, ...args);
}

export { initOptions, logMaxTimes, logOnce };
