
import { mat4 } from "./linearAlgebraUtils.js";

/**
 * Creates a default scene tree node.
 */
function createSceneTreeNode(type) {
    let obj = {
        type: type,
        localTransform: mat4.identity(mat4.create()),
        parent: null,
        children: []
    };

    obj.addChild = function addChild(child) {
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
                const t = mat4.multiply(
                    mat4.create(),
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
