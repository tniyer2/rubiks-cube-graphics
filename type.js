
function isUdf(a) {
    return typeof a === "undefined";
}

function isNumber(a) {
    return typeof a === "number";
}

function isObject(a) {
    return typeof a === "object";
}

function isFunction(a) {
    return typeof a === "function";
}

function makeObj() {
    return Object.create(null);
}

export { isUdf, isNumber, isObject, isFunction, makeObj };
