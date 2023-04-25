
const vec2 = glMatrix.vec2;
const vec3 = glMatrix.vec3;
const quat = glMatrix.quat;
const mat4 = glMatrix.mat4;

// Translates a mat4 by a vec3 or Number.
function translateMat4(matrix, v) {
    if (typeof v === "number") {
        v = [v, v, v];
    }

    const t = mat4.fromTranslation(mat4.create(), v);
    return mat4.multiply(matrix, matrix, t);
}

// Scales a mat4 by a vec3 or Number.
function scaleMat4(matrix, v) {
    if (typeof v === "number") {
        v = [v, v, v];
    }

    const s = mat4.fromScaling(mat4.create(), v);
    return mat4.multiply(matrix, matrix, s);
}

// Rotates a mat4 by an angle around an axis.
function rotateMat4(matrix, angle, axis) {
    const r = angleAxisToMat4(angle, axis);
    return mat4.multiply(matrix, matrix, r);
}

/**
 * converts from angle-axis to quaternion.
 * angle: angle in degrees.
 * axis: a vec3 representing a direction.
 */
function angleAxisToQuat(angle, axis) {
    angle = degreesToRadians(angle);
    
    axis = vec3.normalize(vec3.create(), axis);

    const sin = Math.sin(angle/2);
    const cos = Math.cos(angle/2);

    const q = quat.fromValues(
        axis[0] * sin,
        axis[1] * sin,
        axis[2] * sin,
        cos
    );

    return q;
}

function angleAxisToMat4(angle, axis) {
    const q = angleAxisToQuat(angle, axis);
    
    return mat4.fromQuat(mat4.create(), q);
}

// Converts an angle in degrees to radians.
function degreesToRadians(deg) {
    return (deg / 360) * (2 * Math.PI);
}

// Converts an angle in radians to degrees.
function radiansToDegrees(rads) {
    return (rads * 360) / (2 * Math.PI);
}

export {
    vec2, vec3, quat, mat4,
    translateMat4, scaleMat4, rotateMat4,
    angleAxisToQuat, angleAxisToMat4,
    degreesToRadians, radiansToDegrees
};
