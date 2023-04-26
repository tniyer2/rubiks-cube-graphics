
import { initOptions } from "./utils.js";
import { makeObj } from "./type.js";

const MOUSE_DOWN = "mousedown";
const MOUSE_MOVE = "mousemove";
const MOUSE_UP = "mouseup";
const MOUSE_LEAVE = "mouseleave";

/**
 * Implements functionality of clicking and dragging on a DOM element.
 * elm      the DOM element to click and drag on.
 * callback (event, dragState, self) => true if should enter drag
 *          dragState can be "enter", "drag", or "exit".
 * options
 *   .self                an object that gets passed to the callback.
 *   .exitOnLeave         true if should exit drag on "onmouseleave".
 *   .callDragOnMouseDown true if callback should be called with "drag" on "onmousedown".
 */
function ClickAndDragHandler(elm, callback, options) {
    // Initialize optional arguments with defaults.
    {
        const DEFAULTS = {
            self: makeObj(),
            callDragOnMouseDown: true,
            exitOnLeave: true
        };
        options = initOptions(options, DEFAULTS);
    }

    const callDragOnMouseDown = options.callDragOnMouseDown === true;
    const exitOnLeave = options.exitOnLeave === true;

    // Enables and disables event listeners.
    const set = (t, l) => elm.addEventListener(t, l);
    const unset = (t, l) => elm.removeEventListener(t, l);

    const ENTER_STATE = "enter";
    const DRAG_STATE = "drag";
    const EXIT_STATE = "exit";

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

    function onMouseMove(e) {
        e.preventDefault();
        e.stopPropagation();

        callback.call(this, e, DRAG_STATE, options.self);
    }

    function onMouseUp(e) {
        e.preventDefault();
        e.stopPropagation();

        exitDrag.call(this, e);
    }

    function onMouseLeave(e) {
        e.preventDefault();
        e.stopPropagation();

        if (exitOnLeave) {
            exitDrag.call(this, e);
        }
    }

    function exitDrag(e) {
        enteredDrag = false;
        
        unset(MOUSE_MOVE, onMouseMove);
        unset(MOUSE_UP, onMouseUp);
        unset(MOUSE_LEAVE, onMouseLeave);
        set(MOUSE_DOWN, onMouseDown);

        callback.call(this, e, EXIT_STATE, options.self);
    }

    function enterDrag(e) {
        const shouldEnterDrag = callback.call(this, e, ENTER_STATE, options.self);

        if (shouldEnterDrag === true) {
            enteredDrag = true;

            unset(MOUSE_DOWN, onMouseDown)
            set(MOUSE_MOVE, onMouseMove);
            set(MOUSE_UP, onMouseUp);
            set(MOUSE_LEAVE, onMouseLeave);

            if (callDragOnMouseDown) {
                callback.call(this, e, DRAG_STATE, options.self);
            }
        }
    }

    const obj = {
        attach: () => {
            set(MOUSE_DOWN, onMouseDown);
        },
        detach: () => {
            enteredDrag = false;

            unset(MOUSE_DOWN, onMouseDown);
            unset(MOUSE_MOVE, onMouseMove);
            unset(MOUSE_UP, onMouseUp);
            unset(MOUSE_LEAVE, onMouseLeave);
        }
    };
    
    return obj;
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
function KeyInputManager(elm) {
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

export { ClickAndDragHandler, windowToClipSpace, KeyInputManager };
