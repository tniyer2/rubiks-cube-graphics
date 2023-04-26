
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

function makeFilledArray(length, createElement) {
    const a = [];
    
    for (let i = 0; i < length; ++i) {
        a[i] = createElement(i);
    }

    return a;
}

export { isUdf, isNumber, isObject, makeObj, makeFilledArray };
