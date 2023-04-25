
/**
 * Create a quad tree.
 * model    - loaded model from createModel().
 * origin_  - a vec3 center of the tree.
 * length_  - the length and width of the tree.
 * maxDepth - the number of nodes before the tree stops splitting.
 */
function createQuadTree(model, modelTransform, origin_, size_, maxDepth) {
    if (typeof maxDepth !== "number" || maxDepth < 1) {
        throw new Error("Invalid argument.");
    }

    // if isXAxis is false it implies the node splits on the z-axis.
    const createNode = (isXAxis, origin, size, depth) => {
        const node = {
            isXAxis, origin, size, depth, front: null, back: null
        };

        if (depth === maxDepth) {
            node.leafs = [];
        }

        node._initChild = function (isFront) {
            isFront = isFront === true;

            const notAxis = this.isXAxis ? 1 : 0;

            let newSize = vec2.clone(this.size);
            newSize[notAxis] /= 2;

            const delta = (isFront ? 1 : -1) * (newSize[notAxis] / 2);
            const deltaVec = this.isXAxis ? [0, 0, delta] : [delta, 0, 0];

            const newOrigin = vec3.add(vec3.create(), this.origin, deltaVec);

            const node = createNode(!this.isXAxis, newOrigin, newSize, this.depth+1);

            if (isFront) {
                this.front = node;
            } else {
                this.back = node;
            }
        };

        // adds a triangle to the tree, possibly creating new nodes.
        node._add = function (triangle) {
            // base case
            if (this.depth === maxDepth) {
                this.leafs.push(triangle);
                return;
            }

            let [inFront, isBack] = this._isTriangleInFrontOrBack(triangle);
            
            if (inFront) {
                if (this.front === null) {
                    this._initChild(true);
                }
                this.front._add(triangle);
            }
            if (isBack) {
                if (this.back === null) {
                    this._initChild(false);
                }
                this.back._add(triangle);
            }
        };

        // returns whether a triangle should go in the front node
        // and whether it should go in the back node.
        node._isTriangleInFrontOrBack = function (triangle) {
            const axis = this.isXAxis ? 2 : 0;

            let isFront = false;
            let isBack = false;

            for (let point of triangle) {
                if (point[axis] >= this.origin[axis]) {
                    isFront = true;
                } else {
                    isBack = true;
                }
            }

            return [isFront, isBack];
        };

        // returns whether a AABB should go in the front node
        // and whether it should go in the back node.
        node._isAABBInFrontOrBack = function (aabb) {
            const axis = this.isXAxis ? 2 : 0;

            let isFront = false;
            let isBack = false;

            for (let point of [aabb.min, aabb.max]) {
                if (point[axis] >= this.origin[axis]) {
                    isFront = true;
                } else {
                    isBack = true;
                }
            }

            return [isFront, isBack];
        };

        // returns true if any leafs nodes (triangles) collide with the model
        node._doesAnyLeafCollide = function (otherModel, otherTransform) {
            for (let i = 0; i < otherModel.coords.length; i += 9) {
                let a = otherModel.coords.subarray(i, i+3);
                a = vec3.transformMat4(vec3.create(), a, otherTransform);
                
                let b = otherModel.coords.subarray(i+3, i+6);
                b = vec3.transformMat4(vec3.create(), b, otherTransform);

                let c = otherModel.coords.subarray(i+6, i+9);
                c = vec3.transformMat4(vec3.create(), c, otherTransform);

                for (let leaf of this.leafs) {
                    for (let i = 0; i < 3; ++i) {
                        const p1 = leaf[i];
                        const p2 = leaf[(i+1)%3];
                        const v = vec3.subtract(vec3.create(), p2, p1);

                        const intersection = line_seg_triangle_intersection(p1, v, a, b, c);

                        if (intersection !== null && !Number.isNaN(intersection[0])) {
                            return true;
                        }
                    }
                }
            }
            return false;
        };

        node.checkCollision = function (otherModel, otherTransform) {
            if (this.depth === maxDepth) {
                if (this._doesAnyLeafCollide(otherModel, otherTransform)) {
                    return true;
                }
            }

            const aabb = getAxisAlignedXZBoundingBox(otherModel, otherTransform);

            let [isFront, isBack] = this._isAABBInFrontOrBack(aabb);

            if (isFront) {
                if (this.front !== null && this.front.checkCollision(otherModel, otherTransform)) {
                    return true;
                }
            }
            if (isBack) {
                if (this.back !== null && this.back.checkCollision(otherModel, otherTransform)) {
                    return true;
                }
            }

            return false;
        };

        return node;
    };

    const root = createNode(true, origin_, size_, 1);

    // add the triangles to the tree
    for (let i = 0; i < model.coords.length; i += 9) {
        let a = model.coords.subarray(i, i+3);
        let b = model.coords.subarray(i+3, i+6);
        let c = model.coords.subarray(i+6, i+9);

        a = vec3.transformMat4(vec3.create(), a, modelTransform);
        b = vec3.transformMat4(vec3.create(), b, modelTransform);
        c = vec3.transformMat4(vec3.create(), c, modelTransform);

        const triangle = [a, b, c];

        root._add(triangle);
    }

    function nodeToString(node) {
        let s = "";

        s += `${node.depth}, ${node.isXAxis ? "x" : "z"}, ${node.size}, [${node.origin[0]}, ${node.origin[2]}]\n`;

        if (node.leafs) {
            s += `${" ".repeat(node.depth-1)}  LEAFS: ${node.leafs.length}\n`;
        } else {
            s += `${" ".repeat(node.depth-1)}front: ` + (node.front === null ? "null\n" : nodeToString(node.front));
            s += `${" ".repeat(node.depth-1)}back: ` + (node.back === null ? "null\n" : nodeToString(node.back));
        }

        return s;
    }

    // console.log(root);
    // console.log(nodeToString(root));

    return root;
}

/**
 * Gets a 2D Axis Aligned Bounding Box for a model.
 * Only the X and Z axes are included.
 * The bounding box has a min and max vec3.
 */
function getAxisAlignedXZBoundingBox(model, transform) {
    let minX = Number.MAX_VALUE;
    let maxX = Number.MIN_VALUE;

    let minZ = Number.MAX_VALUE;
    let maxZ = Number.MIN_VALUE;

    for (let i = 0; i < model.coords.length; i += 3) {
        let point = model.coords.subarray(i, i+3);
        point = vec3.transformMat4(vec3.create(), point, transform);

        if (point[0] < minX) {
            minX = point[0];
        }
        if (point[0] > maxX) {
            maxX = point[0];
        }

        if (point[2] < minZ) {
            minZ = point[2];
        }
        if (point[2] > maxZ) {
            maxZ = point[2];
        }
    }

    return { min: [minX, 0, minZ],  max: [maxX, 0, maxZ] };
}

export { createQuadTree, getAxisAlignedXZBoundingBox };
