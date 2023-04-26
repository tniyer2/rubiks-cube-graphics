
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

function makeFilledArray(length, element) {
    const a = [];
    const generate = isFunction(element);

    for (let i = 0; i < length; ++i) {
        a[i] = generate ? element(i) : element;
    }

    return a;
}

export { isUdf, isNumber, isObject, isFunction, makeObj, makeFilledArray };
