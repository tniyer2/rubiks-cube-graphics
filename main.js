// Rubik's Cube Game
// Authors: Bryan Cohen & Tanishq Iyer
'use strict';

const vec2 = glMatrix.vec2;
const vec3 = glMatrix.vec3;
// const vec4 = glMatrix.vec4;
const mat4 = glMatrix.mat4;
const quat = glMatrix.quat;

// Global WebGL context variable
let gl;

window.addEventListener('load', function init() {
    // Get the HTML5 canvas object from it's ID
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas) { window.alert('Could not find #webgl-canvas'); return; }

    // Get the WebGL context (save into a global variable)
    gl = canvas.getContext('webgl2');
    if (!gl) { window.alert("WebGL isn't available"); return; }

    // Configure WebGL
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.8, 1.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    
    // Initialize the WebGL program and data
    gl.program = initProgram();
    initBuffers();

    initEvents();
    onWindowResize();

    gl.uniform3fv(gl.program.uLightAmbient, stringToColor("#ffffff"));
    gl.uniform3fv(gl.program.uLightDiffuse, stringToColor("#ffffff"));
    gl.uniform3fv(gl.program.uLightSpecular, stringToColor("#ffffff"));

    gl.uniform3fv(gl.program.uMaterialAmbient, stringToColor("#330000"));
    gl.uniform3fv(gl.program.uMaterialDiffuse, stringToColor("#a00000"));
    gl.uniform3fv(gl.program.uMaterialSpecular, stringToColor("#606060"));
    gl.uniform1f(gl.program.uMaterialShininess, 5);

    // Start the Game Loop
    runFrame();
});

/**
 * Initializes the WebGL program.
 */
function initProgram() {
    // Compile shaders
    // Vertex Shader
    let vert_shader = compileShader(gl, gl.VERTEX_SHADER,
        `#version 300 es
        precision mediump float;

        uniform vec4 uLight; // Light position
        uniform float uLightIntensity;

        uniform mat4 uModelMatrix;
        uniform mat4 uCameraMatrix;
        uniform mat4 uProjectionMatrix;

        in vec4 aPosition;
        in vec3 aNormal;
        in vec3 aColor;

        out vec3 vNormalVector;
        out vec3 vLightVector;
        out vec3 vEyeVector;
        out float vLightIntensity;

        flat out vec3 vColor;

        void main() {
            mat4 viewMatrix = inverse(uCameraMatrix);
            mat4 modelViewMatrix = viewMatrix * uModelMatrix;

            vec4 P = modelViewMatrix * aPosition;

            vNormalVector = mat3(modelViewMatrix) * aNormal;
            vec4 light = viewMatrix * uLight;
            vLightVector = (light.w == 1.0) ? (P - light).xyz : light.xyz;
            vEyeVector = -P.xyz; // from position to camera
            vLightIntensity = uLightIntensity;

            gl_Position = uProjectionMatrix * P;
            vColor = aColor;
        }`
    );

    // Fragment Shader
    let frag_shader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        // Light constants
        const vec3 lightColor = normalize(vec3(1.0, 1.0, 1.0));
        in float vLightIntensity;

        // Material constants
        const float materialAmbient = 0.2;
        const float materialDiffuse = 0.95;
        const float materialSpecular = 0.05;
        const float materialShininess = 5.0;
        
        // Attenuation constants
        const float lightConstantA = 0.025;
        const float lightConstantB = 0.05;
        const float lightConstantC = 1.0;

        in vec3 vNormalVector;
        in vec3 vLightVector;
        in vec3 vEyeVector;

        // Fragment base color
        flat in vec3 vColor;

        // Output color of the fragment
        out vec4 fragColor;

        void main() {
            // normalize vectors
            vec3 N = normalize(vNormalVector);
            vec3 L = normalize(vLightVector);
            vec3 E = normalize(vEyeVector);

            float diffuse = dot(-L, N);
            float specular = 0.0;
            if (diffuse < 0.0) {
                diffuse = 0.0;
            } else {
                vec3 R = reflect(L, N);
                specular = pow(max(dot(R, E), 0.0), materialShininess);
            }

            float d = length(vLightVector);
            float attenuation = 1.0 / ((lightConstantA * d * d) + (lightConstantB * d) + lightConstantC);

            // compute lighting
            float A = materialAmbient;
            float D = materialDiffuse * diffuse * attenuation;
            float S = materialSpecular * specular * attenuation;

            fragColor.rgb = (((A + D) * vColor) + S) * lightColor * vLightIntensity;
            fragColor.a = 1.0;
        }
        `
    );

    // Link the shaders into a program and use them with the WebGL context
    let program = linkProgram(gl, vert_shader, frag_shader);
    gl.useProgram(program);
    
    // Get the attribute indices
    program.aPosition = gl.getAttribLocation(program, 'aPosition');
    program.aNormal = gl.getAttribLocation(program, 'aNormal');
    program.aColor = gl.getAttribLocation(program, 'aColor');

    // Get the uniform indices
    program.uCameraMatrix = gl.getUniformLocation(program, 'uCameraMatrix');
    program.uModelMatrix = gl.getUniformLocation(program, 'uModelMatrix');
    program.uProjectionMatrix = gl.getUniformLocation(program, 'uProjectionMatrix');
    program.uLight = gl.getUniformLocation(program, 'uLight');
    program.uLightIntensity = gl.getUniformLocation(program, 'uLightIntensity');

    /*
    program.uLightAttenuation = gl.getUniformLocation(program, 'uLightAttenuation');
    program.uLightAmbient = gl.getUniformLocation(program, 'uLightAmbient');
    program.uLightDiffuse = gl.getUniformLocation(program, 'uLightDiffuse');
    program.uLightSpecular = gl.getUniformLocation(program, 'uLightSpecular');
    program.uMaterialAmbient = gl.getUniformLocation(program, 'uMaterialAmbient');
    program.uMaterialDiffuse = gl.getUniformLocation(program, 'uMaterialDiffuse');
    program.uMaterialSpecular = gl.getUniformLocation(program, 'uMaterialSpecular');
    program.uMaterialShininess = gl.getUniformLocation(program, 'uMaterialShininess');
    */

    return program;
}

/**
 * Initialize the camera and the data buffers.
 * Also initialize the octree.
 */
function initBuffers() {
    gl.world = createSceneTreeNode("world");

    // Create the camera
    const camera = createSceneTreeNode("camera");
    {
        const t = camera.localTransform;
        const translation = mat4.fromTranslation(mat4.create(), [0, 0, 4]);
        
        mat4.multiply(t, t, translation);
    }

    // Load cube model into GPU
    {
        const cube_coords = [
            1, 1, 1, // A
            -1, 1, 1, // B
            -1, -1, 1, // C
            1, -1, 1, // D
            1, -1, -1, // E
            -1, -1, -1, // F
            -1, 1, -1, // G
            1, 1, -1, // H
        ];

        const cube_colors = [
            1, 0, 0, // red
            1, 1, 0, // yellow
            0, 1, 0, // green
            0, 0, 0, // black (color is not actually used)
            0, 1, 1, // cyan
            0, 0, 1, // blue
            0, 0, 0, // black (color is not actually used)
            1, 0, 1, // purple
        ];

        const cube_indices = [
            1, 2, 0, 2, 3, 0,
            7, 6, 1, 0, 7, 1,
            1, 6, 2, 6, 5, 2,
            3, 2, 4, 2, 5, 4,
            6, 7, 5, 7, 4, 5,
            0, 3, 7, 3, 4, 7,
        ];

        gl.cube = createSceneTreeNode("model");
        gl.cube.model = loadModel(cube_coords, cube_colors, cube_indices);
        
        // compute cube's transform
        const t = gl.cube.localTransform;
        mat4.multiply(t, t, angleAxisToMat4(45, [0, 1, 0]));
    }

    gl.world.addChild(gl.cube);

    gl.world.addChild(camera);
    gl.world.camera = camera;
}

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

/**
 * Initialize event handlers
 */
function initEvents() {
    // stores which keys are pressed
    gl.input = {
        state: {},
        reset: function () { this.state = {}; },
        isKeyDown: function (key) {
            return this.state[key] === true;
        }
    };

    window.addEventListener('resize', onWindowResize);

    window.addEventListener('keydown', function (e) {
        e.preventDefault();
        gl.input.state[e.key] = true;
    });

    window.addEventListener('keyup', function (e) {
        e.preventDefault();
        gl.input.state[e.key] = false;
    });

    const handler = createMouseHandler(
        document.getElementsByTagName('canvas')[0],
        onMouse
    );
    handler.attach();
}

/**
 * Keep the canvas sized to the window.
 */
function onWindowResize() {
    const size = Math.min(window.innerWidth, window.innerHeight);

    gl.canvas.width = size;
    gl.canvas.height = size;
    gl.viewport(0, 0, size, size);

    updateProjectionMatrix();
}

/**
 * Updates the projection transformation matrix.
 */
function updateProjectionMatrix() {
    let [w, h] = [gl.canvas.width, gl.canvas.height];

    const mv = mat4.perspective(mat4.create(), degreesToRadians(90), w / h, 0.0001, 1000);

    // for debugging
    // const mv = mat4.ortho(mat4.create(), -2, 2, -2, 2, 1000, -1000);

    gl.uniformMatrix4fv(gl.program.uProjectionMatrix, false, mv);
}

/**
 * Runs all tasks for a single frame.
 */
function runFrame() {
    updateRubiksCubeTransform();

    render();

    window.requestAnimationFrame(runFrame);
}

/**
 * Render the scene.
 */
function render() {
    const ms = performance.now();

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // warp
    gl.uniform4fv(gl.program.uLight, [0, 0, 10, 1]);
    gl.uniform1f(gl.program.uLightIntensity, 4);
    
    gl.uniformMatrix4fv(gl.program.uCameraMatrix, false, gl.world.camera.transform);

    const draw = function (obj) {
        if (obj.type === "model") {
            gl.uniformMatrix4fv(gl.program.uModelMatrix, false, obj.transform);

            const model = obj.model;
            gl.bindVertexArray(model.vao);
            gl.drawElements(model.mode, model.count, gl.UNSIGNED_SHORT, 0);
        }

        for (const child of obj.children) {
            draw(child);
        }
    }

    draw(gl.world);

    // Cleanup
    gl.bindVertexArray(null);
}

function updateRubiksCubeTransform() {
    /*
    // updated is in local space
    const delta = mat4.identity(mat4.create());

    // !== for booleans does exclusive or

    // moves forward and backward
    if (gl.input.isKeyDown("ArrowUp") !== gl.input.isKeyDown("ArrowDown")) {
        const factor = gl.input.isKeyDown("ArrowUp") ? -1 : 1;
        const t = mat4.fromTranslation(mat4.create(), [0, 0, 0.2 * factor]);
        mat4.multiply(delta, delta, t);
    }

    const rotations = [];

    // yaw (rotate y-axis)
    if (gl.input.isKeyDown("ArrowLeft") !== gl.input.isKeyDown("ArrowRight")) {
        const factor = gl.input.isKeyDown("ArrowRight") ? 1 : -1;
        rotations.push(angleAxisToQuat(1 * factor, [0, 1, 0]));
    }

    // pitch (rotate x-axis)
    if (gl.input.isKeyDown("w") !== gl.input.isKeyDown("s")) {
        const factor = gl.input.isKeyDown("s") ? 1 : -1;
        rotations.push(angleAxisToQuat(1 * factor, [1, 0, 0]));
    }

    // roll (rotate z-axis)
    if (gl.input.isKeyDown("a") !== gl.input.isKeyDown("d")) {
        const factor = gl.input.isKeyDown("d") ? 1 : -1;
        rotations.push(angleAxisToQuat(1 * factor, [0, 0, 1]));
    }

    let finalRotation = rotations.reduce((a, b) => quat.multiply(a, a, b),
        quat.identity(quat.create()));
    finalRotation = mat4.fromQuat(mat4.create(), finalRotation);

    mat4.multiply(delta, delta, finalRotation);

    const t = gl.drone.localTransform;
    mat4.multiply(t, t, delta);
    */
}

/**
 * Loads a model into GPU with the coordinates, colors, and indices provided.
 */
function loadModel(coords, colors, indices, useStrips) {
    useStrips = useStrips === true;

    // Create and bind VAO
    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    
    // Load vertex positions into GPU
    coords = Float32Array.from(coords);
    loadArrayBuffer(coords, gl.program.aPosition, 3, gl.FLOAT);

    // Load vertex normals into GPU
    const normals = calc_normals(coords, indices, useStrips)
    loadArrayBuffer(normals, gl.program.aNormal, 3, gl.FLOAT);

    if (colors === null) {
        colors = Array(coords.length / 3).fill().flatMap(() => [0, 1, 0]);
    }
    
    // Load vertex colors into GPU
    loadArrayBuffer(Float32Array.from(colors), gl.program.aColor, 3, gl.FLOAT);

    // Load the index data into the GPU
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint16Array.from(indices), gl.STATIC_DRAW);

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    const count = indices.length;
    const mode = useStrips ? gl.TRIANGLE_STRIP : gl.TRIANGLES;

    const object = { vao, count, mode, coords };

    return object;
}

/**
 * Creates and loads an array buffer into the GPU.
 * Then attaches it to a location and enables it.
 * values - an array of values to upload to the buffer.
 * location - the location the buffer should attach to.
 * numComponents - the number of components per attribute.
 * numType - the type of the component.
 */
function loadArrayBuffer(values, location, numComponents, componentType) {
    const buf = gl.createBuffer();
    
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
    gl.vertexAttribPointer(location, numComponents, componentType, false, 0, 0);
    gl.enableVertexAttribArray(location);

    return buf;
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
function degreesToRadians(angle) {
    return (angle / 360) * (2 * Math.PI);
}

// scales a mat4 by a constant.
function scaleByConstant(matrix, value) {
    const scaling = mat4.fromScaling(
        mat4.create(),
        Array(3).fill(value)
    );

    mat4.multiply(matrix, matrix, scaling);
}

/**
 * Create a quad tree.
 * model    - loaded model from createModel().
 * origin_  - center or starting point of the tree.
 * length_  - the length and width of the tree.
 * maxDepth - the number of nodes before the tree stops splitting.
 */
function createQuadTree(model, modelTransform, origin_, size_, maxDepth) {
    if (typeof maxDepth !== 'number' || maxDepth < 1) {
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
                    for (let i = 0; i < 3; i++) {
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
 * The bounding box includes a min and a max of type Vec3.
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

/**
 * Implements all of the click and drag functionality.
 * Returning true in the callback will enable dragging
 * after a mousedown event.
 * @param {*} elm the DOM element to click and drag on.
 * @param {*} callback gets called on every mousedown, mousemove, and mouseup.
 * @param {*} options.self an object that gets passed to the callback.
 * @param {*} options.exitOnLeave should exit drag on 'onmouseleave'.
 * @returns the mouse handler object.
 */
function createMouseHandler(elm, callback, options) {
    if (typeof options === "undefined" || options == null) {
        options = {};
    } else if (typeof options !== "object") {
        throw new Error("Invalid argument.")
    }
    {
        const defaults = { self: {}, exitOnLeave: true };
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
        
        elm.removeEventListener('mousemove', onMouseMove);
        elm.removeEventListener('mouseup', onMouseUp);
        elm.removeEventListener('mouseleave', onMouseLeave);
        elm.addEventListener('mousedown', onMouseDown);

        // mouse up
        callback.call(this, e, "up", options.self);
    }

    function enterDrag(e) {
        // mouse down
        const shouldEnterDrag = callback.call(this, e, "down", options.self);

        if (shouldEnterDrag === true) {
            enteredDrag = true;

            elm.removeEventListener('mousedown', onMouseDown)
            elm.addEventListener('mousemove', onMouseMove);
            elm.addEventListener('mouseup', onMouseUp);
            elm.addEventListener('mouseleave', onMouseLeave);
        }
    }

    function onMouseMove(e) {
        e.preventDefault();
        e.stopPropagation();

        // mouse move
        callback.call(this, e, "move", options.self);
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
            elm.addEventListener('mousedown', onMouseDown);
        },
        detach: () => {
            enteredDrag = false;

            elm.removeEventListener('mousedown', onMouseDown);
            elm.removeEventListener('mousemove', onMouseMove);
            elm.removeEventListener('mouseup', onMouseUp);
            elm.removeEventListener('mouseleave', onMouseLeave);
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
 * Handle the click-and-drag to rotate the Rubik's cube.
 */
function onMouse(e, type, self) {
    const mousePos = windowToClipSpace(
        e.offsetX, e.offsetY, this.width, this.height);

    if (type === "down") {
        const clickedLeftMouseButton = e.button === 0;
        if (clickedLeftMouseButton) {
            // Set initials
            self.startMousePos = mousePos;
            self.startTransform = gl.cube.transform;

            return true; // enters drag
        }
    } else if (type === "move") {        
        // Get the amount moved (in clip coordinates)
        let diff = vec2.subtract(mousePos, mousePos, self.startMousePos);

        // Add difference to tetrahedron's starting position
        const rot = mat4.multiply(
            mat4.create(), 
            angleAxisToMat4(diff[0] * 100, [0, 1, 0]),
            angleAxisToMat4(diff[1] * 100, [-1, 0, 0])
        );
        gl.cube.localTransform = mat4.multiply(
            mat4.create(), 
            rot, 
            self.startTransform
        );
    }

    return false;
}

function stringToColor(str) {
    return Float32Array.of(
        parseInt(str.substr(1, 2), 16) / 255.0,
        parseInt(str.substr(3, 2), 16) / 255.0,
        parseInt(str.substr(5, 2), 16) / 255.0
    );
}
