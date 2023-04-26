
import { Mat4 } from "./linearAlgebraUtils.js";

/**
 * Creates a default scene tree node.
 */
function createSceneTreeNode(type) {
    let obj = {
        type: type,
        localTransform: Mat4.identity(Mat4.create()),
        parent: null,
        children: []
    };

    obj.addChild = function (child) {
        if (child.parent !== null) {
            throw new Error("Child already has a parent.");
        }

        child.parent = this;
        this.children.push(child);
    }

    Object.defineProperty(obj, "transform", {
        get: function () {
            if (this.parent === null) {
                return this.localTransform;
            } else {
                const t = Mat4.multiply(
                    Mat4.create(),
                    this.parent.transform,
                    this.localTransform
                );
                return t;
            }
        }
    });

    return obj;
}

export { createSceneTreeNode };
