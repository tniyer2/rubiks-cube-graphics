
import { isNumber } from "./type.js";
import { Vec3 } from "./linearAlgebraUtils.js";
import { lineSegTriangleIntersection } from "./tools.js";

/**
 * A Quad Tree on the X and Z axes.
 * model     - the model the tree is built on.
 * transform - (Mat4) the orientation and location of the model.
 * origin    - (Vec3) the center of the tree.
 * size      - (Vec3) the dimensions of the tree.
 * maxDepth  - the maximum depth of the tree.
 */
function QuadTree(model, transform, origin, size, maxDepth) {
    if (!isNumber(maxDepth) || maxDepth <= 0) {
        throw new Error("Invalid argument.");
    }

    const root = Node(true, origin, size, 1, maxDepth);

    // Add all of the model's triangles to the tree.
    for (let i = 0; i < model.coords.length; i += 9) {
        const triangle = [];

        // Adds each point to triangle.
        for (let j = 0; j < 3; ++j) {
            const start = i + (j * 3);

            let point = model.coords.subarray(start, start + 3);
            point = Vec3.transformMat4(Vec3.create(), point, transform);

            triangle.push(point);
        }

        root._add(triangle);
    }

    // eslint-disable-next-line no-unused-vars
    function nodeToString(node) {
        let s = "";

        s += `${node.depth}, ${node.splitsOnX ? "x" : "z"}, ${node.size}, [${node.origin[0]}, ${node.origin[2]}]\n`;

        if (node.leafs) {
            s += `${" ".repeat(node.depth-1)}  LEAFS: ${node.leafs.length}\n`;
        } else {
            s += `${" ".repeat(node.depth-1)}front: ` + (node.front === null ? "null\n" : nodeToString(node.front));
            s += `${" ".repeat(node.depth-1)}back: ` + (node.back === null ? "null\n" : nodeToString(node.back));
        }

        return s;
    }

    return root;
}

// splitsOnX is false implies the node splits on the z-axis.
function Node(splitsOnX, origin, size, depth, maxDepth) {
    const obj = {
        splitsOnX, origin, size, depth, front: null, back: null
    };

    if (depth === maxDepth) {
        obj.leafs = [];
    }

    obj._createChildNode = function (isFront) {
        isFront = isFront === true;

        const orthogonalAxis = this.splitsOnX ? 2 : 0;

        let childSize = Vec3.clone(this.size);
        childSize[orthogonalAxis] /= 2;

        const frontFactor = isFront ? 1 : -1;
        const delta = frontFactor * (childSize[orthogonalAxis] / 2);
        const deltaV = [0, 0, 0];
        deltaV[orthogonalAxis] = delta;

        const childOrigin = Vec3.add(Vec3.create(), this.origin, deltaV);

        const node = Node(!this.splitsOnX, childOrigin, childSize, this.depth+1, this.maxDepth);

        return node;
    };

    // Adds a triangle to the tree, possibly creating new nodes.
    obj._add = function (triangle) {
        // base case
        if (this.depth === maxDepth) {
            this.leafs.push(triangle);
            return;
        }

        let [inFront, isBack] = this._isTriangleInFrontAndOrBack(triangle);
        
        if (inFront) {
            if (this.front === null) {
                this.front = this._createChildNode(true);
            }
            this.front._add(triangle);
        }

        if (isBack) {
            if (this.back === null) {
                this.back = this._createChildNode(false);
            }
            this.back._add(triangle);
        }
    };

    /**
    * Returns whether an array of points falls in the front node
    * and/or the back node.
    */
    obj._arePointsInFrontAndOrBack = function (points) {
        const orthogonalAxis = this.splitsOnX ? 2 : 0;

        let isFront = false;
        let isBack = false;

        for (let point of points) {
            if (point[orthogonalAxis] >= this.origin[orthogonalAxis]) {
                isFront = true;
            } else {
                isBack = true;
            }
        }

        return [isFront, isBack];
    };

    obj._isTriangleInFrontAndOrBack = function (triangle) {
        return this._arePointsInFrontAndOrBack(triangle);
    };

    obj._isAABBInFrontAndOrBack = function (aabb) {
        return this._arePointsInFrontAndOrBack([aabb.min, aabb.max]);
    };

    // Returns true if any leafs nodes (triangles) collide with the model.
    obj._doesAnyLeafCollide = function (model, transform) {
        for (let i = 0; i < model.coords.length; i += 9) {
            const triangle = [];

            // Adds each point to triangle.
            for (let j = 0; j < 3; ++j) {
                const start = i + (j * 3);

                let point = model.coords.subarray(start, start + 3);
                point = Vec3.transformMat4(Vec3.create(), point, transform);

                triangle.push(point);
            }

            const [a, b, c] = triangle;

            for (const leaf of this.leafs) {
                for (let j = 0; j < 3; ++j) {
                    const p1 = leaf[j];
                    const p2 = leaf[(j + 1) % 3];
                    const v = Vec3.subtract(Vec3.create(), p2, p1);

                    const intersection = lineSegTriangleIntersection(p1, v, a, b, c);

                    if (intersection !== null &&
                        !Number.isNaN(intersection[0])) {
                        return true;
                    }
                }
            }
        }

        return false;
    };

    obj.checkCollision = function (model, transform) {
        if (this.depth === maxDepth &&
            this._doesAnyLeafCollide(model, transform)) {
            return true;
        }

        const aabb = AxisAlignedBoundingBox(model, transform);

        let [isFront, isBack] = this._isAABBInFrontAndOrBack(aabb);

        if (isFront &&
            this.front !== null &&
            this.front.checkCollision(model, transform)) {
            return true;
        }

        if (isBack &&
            this.back !== null &&
            this.back.checkCollision(model, transform)) {
            return true;
        }

        return false;
    };

    return obj;
}

/**
 * Returns a 2D Axis Aligned Bounding Box for a 3D model.
 * Only the X and Z axes are looked at.
 * The bounding box is defined by a min and max Vec3.
 */
function AxisAlignedBoundingBox(model, transform) {
    let min = [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE];
    let max = [Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE];

    // Iterate through every point in model.
    for (let i = 0; i < model.coords.length; i += 3) {
        let point = model.coords.subarray(i, i + 3);
        point = Vec3.transformMat4(Vec3.create(), point, transform);

        // Iterate through every axis in point.
        for (let j = 0; j < 3; ++j) {
            // update minimum
            if (point[j] < min[j]) {
                min[j] = point[j];
            }

            // update maximum
            if (point[j] > max[j]) {
                max[j] = point[j];
            }
        }
    }

    return { min, max };
}

export { QuadTree, AxisAlignedBoundingBox as XZAxisAlignedBoundingBox };
