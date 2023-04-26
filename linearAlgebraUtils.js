
import { isNumber } from "./type.js";

const Vec2 = glMatrix.vec2;
const Vec3 = glMatrix.vec3;
const Quat = glMatrix.quat;
const Mat4 = glMatrix.mat4;

// Translates a Mat4 by a Vec3.
function translateMat4(matrix, v) {
    if (isNumber(v)) {
        v = [v, v, v];
    }

    const t = Mat4.fromTranslation(Mat4.create(), v);

    return Mat4.multiply(matrix, matrix, t);
}

// Scales a Mat4 by a Vec3.
function scaleMat4(matrix, v) {
    if (isNumber(v)) {
        v = [v, v, v];
    }

    const s = Mat4.fromScaling(Mat4.create(), v);

    return Mat4.multiply(matrix, matrix, s);
}

// Rotates a Mat4 by an angle around an axis.
function rotateMat4(matrix, angle, axis) {
    const r = angleAxisToMat4(angle, axis);

    return Mat4.multiply(matrix, matrix, r);
}

/**
 * Returns a quaternion (Quat) converted from the angle and axis.
 * angle - angle in degrees.
 * axis  - a Vec3 representing a direction.
 */
function angleAxisToQuat(angle, axis) {
    angle = degreesToRadians(angle);
    
    axis = Vec3.normalize(Vec3.create(), axis);

    const sin = Math.sin(angle / 2);
    const cos = Math.cos(angle / 2);

    const q = Quat.fromValues(
        axis[0] * sin,
        axis[1] * sin,
        axis[2] * sin,
        cos
    );

    return q;
}

function angleAxisToMat4(angle, axis) {
    const q = angleAxisToQuat(angle, axis);
    
    return Mat4.fromQuat(Mat4.create(), q);
}

// Converts an angle from degrees to radians.
function degreesToRadians(deg) {
    return (deg / 180) * Math.PI;
}

// Converts an angle from radians to degrees.
function radiansToDegrees(rads) {
    return (rads * 180) / Math.PI;
}

export {
    Vec2, Vec3, Quat, Mat4,
    translateMat4, scaleMat4, rotateMat4,
    angleAxisToQuat, angleAxisToMat4,
    degreesToRadians, radiansToDegrees
};
