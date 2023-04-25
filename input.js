
/**
 * Implements all of the click and drag functionality.
 * Returning true in the callback will enable dragging
 * after a mousedown event.
 * @param {*} elm the DOM element to click and drag on.
 * @param {*} callback gets called on every mousedown, mousemove, and mouseup.
 * @param {*} options.self an object that gets passed to the callback.
 * @param {*} options.exitOnLeave should exit drag on 'onmouseleave'.
 * @param {*} options.callDragOnEnter should exit drag on 'onmouseleave'.
 * @returns the mouse handler object.
 */
function createMouseHandler(elm, callback, options) {
    if (typeof options === "undefined" || options == null) {
        options = {};
    } else if (typeof options !== "object") {
        throw new Error("Invalid argument.")
    }
    {
        const defaults = {
            self: {},
            callDragOnEnter: true,
            exitOnLeave: true
        };
        options = Object.assign(defaults, options);
    }

    let enteredDrag = false;

    function onMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();

        // prevents mousedown from being called after mousemove but before mouseup
        // this can happen if you move cursor outside of element while drag is in action.
        if (enteredDrag === true) {
            enteredDrag = false;
            exitDrag.call(this, e);
        } else {
            enterDrag.call(this, e);
        }
    }

    function exitDrag(e) {
        enteredDrag = false;
        
        elm.removeEventListener("mousemove", onMouseMove);
        elm.removeEventListener("mouseup", onMouseUp);
        elm.removeEventListener("mouseleave", onMouseLeave);
        elm.addEventListener("mousedown", onMouseDown);

        callback.call(this, e, "exit", options.self);
    }

    function enterDrag(e) {
        const shouldEnterDrag = callback.call(this, e, "enter", options.self);

        if (shouldEnterDrag === true) {
            enteredDrag = true;

            elm.removeEventListener("mousedown", onMouseDown)
            elm.addEventListener("mousemove", onMouseMove);
            elm.addEventListener("mouseup", onMouseUp);
            elm.addEventListener("mouseleave", onMouseLeave);

            if (options.callDragOnEnter) {
                callback.call(this, e, "drag", options.self);
            }
        }
    }

    function onMouseMove(e) {
        e.preventDefault();
        e.stopPropagation();

        callback.call(this, e, "drag", options.self);
    }

    function onMouseUp(e) {
        e.preventDefault();
        e.stopPropagation();

        exitDrag.call(this, e);
    }

    function onMouseLeave(e) {
        e.preventDefault();
        e.stopPropagation();

        if (options.exitOnLeave) {
            exitDrag.call(this, e);
        }
    }

    return {
        attach: () => {
            elm.addEventListener("mousedown", onMouseDown);
        },
        detach: () => {
            enteredDrag = false;

            elm.removeEventListener("mousedown", onMouseDown);
            elm.removeEventListener("mousemove", onMouseMove);
            elm.removeEventListener("mouseup", onMouseUp);
            elm.removeEventListener("mouseleave", onMouseLeave);
        },
    }
}

/**
 * Convert x and y from window coordinates (in pixels)
 * relative to a canvas element to clip coordinates (-1,-1 to 1,1).
 */
function windowToClipSpace(x, y, canvasWidth, canvasHeight) {
    return [
        (x / (canvasWidth / 2)) - 1,
        ((-y) / (canvasHeight / 2)) + 1
    ];
}

/**
 * Creates an object that keeps track of key input.
 */
function createKeyInputManager(elm) {
    const obj = {
        state: Object.create(null),
        allListeners: Object.create(null),
        setKey: function (keyName, value) {
            this.state[keyName] = value;
            this._callListeners(keyName, value);
        },
        isKeyDown: function (keyName) {
            return this.state[keyName] === true;
        },
        addListener: function (keyName, listener) {
            let listeners;
            if (keyName in this.allListeners) {
                listeners = this.allListeners[keyName];
            } else {
                listeners = [];
                this.allListeners[keyName] = listeners;
            }

            listeners.push(listener);

            let isRemoved = false;

            return function remove() {
                if (!isRemoved) {
                    isRemoved = true;

                    const i = listeners.indexOf(listener);
                    if (i === -1) {
                        throw new Error("Invalid state.");
                    }
                    listeners.splice(i, 1);
                }
            };
        },
        _callListeners: function (keyName, value) {
            if (!(keyName in this.allListeners)) return;

            const listeners = this.allListeners[keyName];
            for (const listener of listeners) {
                listener(value);
            }
        }
    };

    elm.addEventListener("keydown", function (e) {
        e.preventDefault();
        e.stopPropagation();

        if (e.repeat) return;

        obj.setKey(e.key, true);
    });

    elm.addEventListener("keyup", function (e) {
        e.preventDefault();
        e.stopPropagation();

        obj.setKey(e.key, false);
    });

    return obj;
}

export { createMouseHandler, windowToClipSpace, createKeyInputManager };
