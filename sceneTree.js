
import { isNumber, makeObj } from "./type.js";
import { Mat4, identityMat4 } from "./linearAlgebraUtils.js";

let GLB_NODE_ID = 0;

/**
 * A node in a scene tree.
 */
function SceneTreeNode(type) {
    const obj = {
        _id: ++GLB_NODE_ID,
        type,
        localTransform: identityMat4(),
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

    obj.removeChild = function (child) {
        const i = this.children.indexOf(child);
        if (i === -1) {
            throw new Error("Child could not be found.");
        }

        this.children.splice(i, 1);
        child.parent = null;
    }

    obj.removeChildAt = function (index) {
        if (!isNumber(index) || index < 0) {
            throw new Error("Invalid argument.");
        } else if (index >= this.children.length) {
            throw new Error("index out of bounds.");
        }

        const child = this.children[index];
        this.children.splice(index, 1);
        child.parent = null;
    }

    /**
     * Efficiently adds and removes children so that this.children becomes updatedChildren.
     */
    obj.setChildren = function (newChildren) {
        // Check that newChildren has no duplicates.
        {
            const newChildrenIds = makeObj();

            for (const child of newChildren) {
                const id = child._id;

                if (id in newChildrenIds) {
                    throw new Error("newChildren contains duplicates.");
                }

                newChildrenIds[id] = true;
            }
        }

        // Remove all current children.
        for (let i = this.children.length - 1; i >= 0; --i) {
            this.removeChildAt(i);
        }

        // Add all new children.
        for (const child of newChildren) {
            this.addChild(child);
        }
    }

    Object.defineProperty(obj, "transform", {
        get: function () {
            if (this.parent === null) {
                return Mat4.clone(this.localTransform);
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

function switchParentKeepTransform(child, oldParent, newParent, noSwitch) {
    noSwitch = noSwitch === true;

    const newTransform = Mat4.multiply(
        Mat4.create(),
        Mat4.invert(Mat4.create(), newParent.transform),
        child.transform,
    );

    if (!noSwitch) {
        oldParent.removeChild(child);
    }

    child.localTransform = newTransform;

    if (!noSwitch) {
        newParent.addChild(child);
    }
}

export { SceneTreeNode, switchParentKeepTransform};
