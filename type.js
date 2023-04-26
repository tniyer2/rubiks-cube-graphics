
function isUdf(a) {
    return typeof a === "undefined";
}

function isNumber(a) {
    return typeof a === "number";
}

function isObject(a) {
    return typeof a === "object";
}

function makeObj() {
    return Object.create(null);
}

export { isUdf, isNumber, isObject, makeObj };
