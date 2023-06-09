/*
Rubik's Cube Game
Authors: Bryan Cohen & Tanishq Iyer

Official colors of the Rubik's Cube are used.
Red: #BA0C2F
Blue: #003DA5
Yellow: #FFD700
Orange: #FE5000
White: #FFFFFF
Green: #009A44

Dark side of cube: #353535
*/

"use strict";

import {
    Vec2, Mat4, Quat,
    identityMat4, multiplyMat4,
    translateMat4, rotateMat4,
    angleAxisToMat4,
    degreesToRadians, radiansToDegrees
} from "./linearAlgebraUtils.js";

import { SceneTreeNode, switchParentKeepTransform } from "./sceneTree.js";

import { loadModelFromWavefrontOBJ } from "./models.js";

import {
    ClickAndDragHandler,
    windowToClipSpace,
    KeyInputManager
} from "./input.js";

// Global WebGL context variable.
let gl;

// For storing other globals.
const GLB = {};

window.addEventListener("load", async function init() {
    // Get the canvas element.
    const canvas = document.getElementById("webgl-canvas");
    if (!canvas) { window.alert("Could not find #webgl-canvas"); return; }
    GLB.canvasElm = canvas;

    // Get the WebGL context.
    gl = canvas.getContext("webgl2");
    if (!gl) { window.alert("WebGL isn't available"); return; }

    // Configure WebGL.
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.8, 1.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    
    // Initialize the WebGL program and data.
    gl.program = initProgram();
    initUniforms();
    initGlobals();
    await initGameWorld();
    initEvents();
    resizeCanvas();

    // Start the Game Loop
    runFrame();
});

/**
 * Initializes the WebGL program.
 */
function initProgram() {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER,
        `#version 300 es
        precision mediump float;

        uniform vec4 uLight;
        uniform mat4 uModelMatrix;
        uniform mat4 uCameraMatrix;
        uniform mat4 uProjectionMatrix;

        in vec4 aPosition;
        in vec3 aNormal;
        in vec3 aColor;
        in vec2 aTexCoord;

        out vec3 vNormalVector;
        out vec3 vLightVector;
        out vec3 vEyeVector;
        flat out vec3 vColor;
        out vec2 vTexCoord;

        void main() {
            mat4 viewMatrix = inverse(uCameraMatrix);
            mat4 modelViewMatrix = viewMatrix * uModelMatrix;

            vec4 P = modelViewMatrix * aPosition;

            vNormalVector = mat3(modelViewMatrix) * aNormal;
            vec4 light = viewMatrix * uLight;
            vLightVector = (light.w == 1.0) ? (P - light).xyz : light.xyz;
            vEyeVector = -P.xyz; // from position to camera

            gl_Position = uProjectionMatrix * P;
            vColor = aColor;
            vTexCoord = aTexCoord;
        }`
    );

    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        // Light Constants
        const vec3 lightColor = normalize(vec3(1.0, 1.0, 1.0));

        // Material Constants
        const float materialAmbient = 0.2;
        const float materialDiffuse = 0.9;
        const float materialSpecular = 0.1;
        const float materialShininess = 5.0;
        
        // Attenuation Constants
        const float lightConstantA = 0.025;
        const float lightConstantB = 0.05;
        const float lightConstantC = 1.0;

        uniform float uLightIntensity;
        uniform sampler2D uTexture;

        in vec3 vNormalVector;
        in vec3 vLightVector;
        in vec3 vEyeVector;
        flat in vec3 vColor;
        in vec2 vTexCoord;

        // Output color of the fragment.
        out vec4 fragColor;

        void main() {
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

            // Color combined from texture and material.
            vec3 color = vColor * texture(uTexture, vTexCoord).xyz;

            // Compute Lighting
            float A = materialAmbient;
            float D = materialDiffuse * diffuse * attenuation;
            float S = materialSpecular * specular * attenuation;

            fragColor.rgb = (((A + D) * color) + S) * lightColor * uLightIntensity;
            fragColor.a = 1.0;
        }
        `
    );

    // Link the shaders into a program and use them with the WebGL context.
    const program = linkProgram(gl, vertexShader, fragmentShader);
    gl.useProgram(program);
    
    // Get location of all attributes.
    const attributes = ["aPosition", "aNormal", "aColor", "aTexCoord"];
    for (const a of attributes) {
        program[a] = gl.getAttribLocation(program, a);
    }

    // Get location of all uniforms.
    const uniforms = [
        "uCameraMatrix", "uModelMatrix", "uProjectionMatrix",
        "uLight", "uLightIntensity",
        "uTexture"
    ];
    for (const u of uniforms) {
        program[u] = gl.getUniformLocation(program, u);
    }

    return program;
}

function initUniforms() {
    // Set Texture Value
    gl.uniform1i(gl.program.uTexture, 0);
}

function initGlobals() {
    GLB.lastFrameTime = null;
    GLB.rotationCountDown = 0;
    GLB.curRotation = null;
}

/**
 * Create the camera and all objects in world.
 * Load all objects' models.
 */
async function initGameWorld() {
    GLB.world = SceneTreeNode("world");

    // Create the camera.
    {
        const camera = SceneTreeNode("camera");
        translateMat4(camera.localTransform, [0, 0, 4]);

        GLB.world.camera = camera;
        GLB.world.addChild(camera);
    }

    // Create the Rubik's Cube Parent Objects.
    {
        GLB.rubiksCube = SceneTreeNode("empty");
        rotateMat4(GLB.rubiksCube.localTransform, 30, [1, 0, 0]);
        rotateMat4(GLB.rubiksCube.localTransform, -45, [0, 1, 0]);

        // Parent of the smaller cubes in the Rubik's cube.
        GLB.cubelets = SceneTreeNode("empty");
        
        // Temporary parent for rotating cubelets.
        GLB.temp = SceneTreeNode("empty");

        GLB.world.addChild(GLB.rubiksCube);
        GLB.rubiksCube.addChild(GLB.cubelets);
        GLB.rubiksCube.addChild(GLB.temp);
    }

    const cornerCubletModel = await loadModelFromWavefrontOBJ(gl, "models/corner.obj");
    const edgeCubletModel = await loadModelFromWavefrontOBJ(gl, "models/edge.obj");
    const centerCubletModel = await loadModelFromWavefrontOBJ(gl, "models/center.obj");

    const cubletModels = [
        cornerCubletModel,
        edgeCubletModel, 
        centerCubletModel,
        null // no model for core
    ];

    const cubletModelTransforms = [
        identityMat4(),
        translateMat4(identityMat4(), [0, 0.015, -0.018]),
        translateMat4(identityMat4(), [0, 0.12, 0]),
        null
    ];

    const cubletRotations = [
        [180, 90, 0], [180, -90, 0], [0, 0, 180],
        [0, 0, 90],   [0, 0, 90],    [90, 0, 90],
        [0, 180, 0],  [0, 90, 0],    [0, -90, 0],

        [0, 0, 180], [0, 0, 180], [180, 0, 0],
        [-90, 0, 0], null,        [90, 0, 0],
        null,        null,        [0, 180, 0],

        [180, 0, 0],  [180, 90, 0], [0, -90, 180],
        [-90, 0, 90], [0, 0, -90],  [180, 0, 90],
        [0, 90, 0],   [0, -90, 0],  null
    ];

    const cubletTextures = [
        "corner-yellow-green-orange.png", "edge-yellow-green.png", "corner-yellow-green-red.png",
        "edge-green-orange.png", "center-green.png", "edge-green-red.png",
        "corner-white-green-orange.png", "edge-white-green.png", "corner-white-green-red.png",

        "edge-yellow-orange.png", "center-yellow.png", "edge-yellow-red.png",
        "center-orange.png", null, "center-red.png",
        "edge-white-orange.png", "center-white.png", "edge-white-red.png",

        "corner-yellow-blue-orange.png", "edge-yellow-blue.png", "corner-yellow-blue-red.png",
        "edge-blue-orange.png", "center-blue.png", "edge-blue-red.png",
        "corner-white-blue-orange.png", "edge-white-blue.png", "corner-white-blue-red.png",
    ];

    // Load all textures.
    for (let i = 0; i < cubletTextures.length; ++i) {
        let filename = cubletTextures[i];
        if (filename !== null) {
            filename = "textures/" + filename;
            cubletTextures[i] = await getTexture(filename);
        }
    }

    // Create cubelets.
    for (let x = 0; x < 3; ++x) {
        for (let y = 0; y < 3; ++y) {
            for (let z = 0; z < 3; ++z) {
                const numAxesCentered = [x, y, z]
                    .map(axis => axis === 1 ? 1 : 0)
                    .reduce((a, b) => a + b);
                const isCore = numAxesCentered === 3;
                const hasModel = !isCore;
                
                const cubletIndex = (x * 9) + (y * 3) + z;

                const nodeType = isCore ? "empty" : "model";
                const cublet = SceneTreeNode(nodeType);

                if (hasModel) {
                    cublet.model = cubletModels[numAxesCentered];
                    cublet.texture = cubletTextures[cubletIndex];
                }

                translateMat4(cublet.localTransform, [x, y, z].map(e => (e - 1) * 0.42));

                const rot = cubletRotations[cubletIndex];
                if (rot !== null) {
                    const q = Quat.fromEuler(Quat.create(), rot[0], rot[1], rot[2]);
                    const m = Mat4.fromQuat(Mat4.create(), q);
                    multiplyMat4(cublet.localTransform, m);
                }

                if (hasModel) {
                    const t = cubletModelTransforms[numAxesCentered];
                    multiplyMat4(cublet.localTransform, t);
                }

                GLB.cubelets.addChild(cublet);
            }
        }
    }
}

/**
 * Initialize event handlers.
 */
function initEvents() {
    window.addEventListener("resize", resizeCanvas);

    const shuffleButton = document.getElementById("shuffle");
    shuffleButton.addEventListener("click", onClickShuffle);

    GLB.keyInput = KeyInputManager(window);

    const handler = ClickAndDragHandler(GLB.canvasElm, onMouse);
    handler.attach();
}

/**
 * Keep the canvas sized to the window.
 */
function resizeCanvas() {
    const size = Math.min(window.innerWidth, window.innerHeight);

    gl.canvas.width = size;
    gl.canvas.height = size;
    gl.viewport(0, 0, size, size);

    updateProjectionMatrix();
}

/**
 * Updates the projection matrix based on the current canvas dimensions.
 */
function updateProjectionMatrix() {
    let [w, h] = [gl.canvas.width, gl.canvas.height];

    const proj = Mat4.perspective(Mat4.create(), degreesToRadians(90), w / h, 0.0001, 1000);

    gl.uniformMatrix4fv(gl.program.uProjectionMatrix, false, proj);
}

function onClickShuffle() {
    const d = document.getElementById("difficulty").value;

    let numShuffles;
    if (d === "easy") {
        numShuffles = 2;
    } else if (d === "medium") {
        numShuffles = 5;
    } else if (d === "hard") {
        numShuffles = 30;
    }

    shuffleRubiksCube(numShuffles);
}

const ROTATE_Z_KEY = "Meta";
const LOCK_AXIS_KEY = "Shift";
const LOCK_STEP_KEY = "Alt";

const XY_ROTATE_SPEED = 3;
const Z_ROTATE_SPEED = 3;
const STEP_SIZE = 20;

/**
 * Handles rotating the Rubik's cube
 * when clicking and dragging with the mouse.
 */
function onMouse(e, state, self) {
    function updateTransform() {
        const rotateZ = GLB.keyInput.isKeyDown(ROTATE_Z_KEY);
        const lockAxis = GLB.keyInput.isKeyDown(LOCK_AXIS_KEY);
        const lockStep = GLB.keyInput.isKeyDown(LOCK_STEP_KEY);

        const applyStep = (x) => Math.floor(x / STEP_SIZE) * STEP_SIZE;

        let rot;
        if (rotateZ) {
            // TODO: (Maybe?) center mousePos on view space cube center.

            const [x, y] = self.mousePos;
            const curAngle = Math.atan2(y, x);

            let angle = radiansToDegrees((curAngle - self.startAngle) * Z_ROTATE_SPEED);

            if (lockStep) {
                angle = applyStep(angle);
            }

            rot = angleAxisToMat4(angle, [0, 0, 1]);
        } else {
            const diff = Vec2.subtract(Vec2.create(), self.mousePos, self.startMousePos);
            const [x, y] = diff;

            const baseSpeed = 100;
            let angleX = x * baseSpeed * XY_ROTATE_SPEED;
            let angleY = y * baseSpeed * XY_ROTATE_SPEED;
            
            if (lockStep) {
                angleX = applyStep(angleX);
                angleY = applyStep(angleY);
            }

            const rotX = angleAxisToMat4(angleX, [0, 1, 0]);
            const rotY = angleAxisToMat4(angleY, [-1, 0, 0]);

            if (lockAxis) {
                rot = Math.abs(x) >= Math.abs(y) ? rotX : rotY;
            } else {
                rot = Mat4.multiply(Mat4.create(), rotX, rotY);
            }
        }

        // Rotate in view space.
        GLB.rubiksCube.localTransform = Mat4.multiply(
            Mat4.create(),
            rot,
            self.startTransform
        );
    }

    // Saving to self so updateTransform has access to
    // last captured mouse position when called in a listener.
    self.mousePos = windowToClipSpace(
        e.offsetX, e.offsetY, this.width, this.height);

    if (state === "enter") {
        const clickedLeftMouseButton = e.button === 0;

        if (clickedLeftMouseButton) {
            self.startMousePos = self.mousePos;
            self.startTransform = GLB.rubiksCube.transform;

            const [x, y] = self.startMousePos;
            self.startAngle = Math.atan2(y, x);
            
            self.removes = [
                GLB.keyInput.addListener(ROTATE_Z_KEY, updateTransform),
                GLB.keyInput.addListener(LOCK_AXIS_KEY, updateTransform),
                GLB.keyInput.addListener(LOCK_STEP_KEY, updateTransform)
            ];

            return true; // enters drag
        }
    } else if (state === "drag") {
        updateTransform();
    } else if (state === "exit") {
        for (const remove of self.removes) {
            remove();
        }
    }

    return false;
}

/**
 * Runs all tasks for a single frame.
 */
function runFrame() {
    // Get time since last frame (in milliseconds).
    let deltaTimeMs;
    {
        const time = performance.now();

        if (GLB.lastFrameTime === null) {
            GLB.lastFrameTime = time;
        }

        deltaTimeMs = time - GLB.lastFrameTime;

        GLB.lastFrameTime = time;
    }

    updateRubiksCube(deltaTimeMs);

    render();

    window.requestAnimationFrame(runFrame);
}

/**
 * Render the scene.
 */
function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.uniform4fv(gl.program.uLight, [0, 0, 10, 1]);
    gl.uniform1f(gl.program.uLightIntensity, 4);
    
    gl.uniformMatrix4fv(gl.program.uCameraMatrix, false, GLB.world.camera.transform);

    const draw = function (obj) {
        if (obj.type === "model") {
            gl.uniformMatrix4fv(gl.program.uModelMatrix, false, obj.transform);

            const model = obj.model;

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, obj.texture);

            gl.bindVertexArray(model.vao);
            gl.drawElements(model.mode, model.count, gl.UNSIGNED_SHORT, 0);
        }

        for (const child of obj.children) {
            draw(child);
        }
    }

    draw(GLB.world);

    // Cleanup
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
}

const ROTATIONS = [
    "left", "x-middle", "right",
    "front", "z-middle", "back",
    "up", "y-middle", "down"
];

const ROTATION_KEYS = [
    "g", "x", "b",
    "r", "z", "o",
    "u", "y", "d"
];

const ROTATE_CLOCKWISE_KEY = "Shift";

const ROTATION_TIME_MS = 300;

const START_ROTATE = 0;
const DO_ROTATE = 1;
const END_ROTATE = 2;

/**
 * Animates the Rubik's Cube if a current rotation is active.
 * Otherwise checks for rotation user input.
 */
function updateRubiksCube(deltaTimeMs) {
    if (GLB.curRotation !== null) {
        if (GLB.timeSinceRotationStart === 0) {
            const [rotation, rotateClockwise] = GLB.curRotation;
            rotateRubiksCubeSide(rotation, rotateClockwise, 0, START_ROTATE);

            GLB.timeSinceRotationStart += deltaTimeMs;
            return;
        }

        GLB.timeSinceRotationStart += deltaTimeMs;
        let interpolation = GLB.timeSinceRotationStart / ROTATION_TIME_MS;

        let reset = false;
        if (interpolation > 1.0) {
            interpolation = 1.0;
            reset = true;
        }

        const [rotation, rotateClockwise] = GLB.curRotation;
        rotateRubiksCubeSide(rotation, rotateClockwise, interpolation, reset ? END_ROTATE : DO_ROTATE);

        if (reset === true) {
            GLB.curRotation = null;
            GLB.timeSinceRotationStart = null;
        }
        return;
    }

    const input = getUserInputForRotatingRubiksCube(deltaTimeMs);
    if (input !== null) {
        GLB.curRotation = input;
        GLB.timeSinceRotationStart = 0;
    }
}

/**
 * Checks if any of the rotation keys have been pressed.
 * Returns a selected rotation and true if clockwise.
 */
function getUserInputForRotatingRubiksCube(deltaTimeMs) {
    if (GLB.rotationCountDown > 0) GLB.rotationCountDown -= deltaTimeMs;
    if (GLB.rotationCountDown > 0) return null;

    const i = ROTATION_KEYS.findIndex(
        (keyName) => GLB.keyInput.isKeyDown(keyName) ||
            GLB.keyInput.isKeyDown(keyName.toUpperCase()));
    
    // User didn't enter input for any side.
    if (i === -1) return null;

    // Reset countdown to 0.2 seconds.
    GLB.rotationCountDown = 200;

    const isShiftDown = GLB.keyInput.isKeyDown(ROTATE_CLOCKWISE_KEY);

    const selectedRotation = ROTATIONS[i];
    
    return [selectedRotation, isShiftDown];
}

/**
 * Randomly shuffles the Rubik's cube.
 */
function shuffleRubiksCube(numShuffles) {
    for (let i = 0; i < numShuffles; ++i) {
        const j = Math.floor(Math.random() * ROTATIONS.length);
        const rotation = ROTATIONS[j];

        const rotateClockwise = Math.random() < 0.5 ? false : true;

        rotateRubiksCubeSide(rotation, rotateClockwise, 0, START_ROTATE);
        rotateRubiksCubeSide(rotation, rotateClockwise, 1, DO_ROTATE);
        rotateRubiksCubeSide(rotation, rotateClockwise, 1, END_ROTATE);
    }
}

/**
 * Rotates a side of the Rubik's cube.
 * rotation - which side to rotate.
 * rotateClockwise - rotates clockwise if true.
 * interpolation - value between 0 and 1 that animates rotation.
 * rotateState - start, do (multiple), and end must be given in order.
 */
function rotateRubiksCubeSide(rotation, rotateClockwise, interpolation, rotateState) {
    const [alignmentMatrix, rotationMatrix, indices, newIndices] =
        getRotationInfo(rotation, rotateClockwise, interpolation);

    if (rotateState === START_ROTATE) {
        GLB.cubeletsBeforeRotation = GLB.cubelets.children.slice();

        GLB.cubletsToRotate = indices.map(i => GLB.cubeletsBeforeRotation[i]);

        GLB.temp.localTransform = alignmentMatrix;

        for (const cublet of GLB.cubletsToRotate) {
            switchParentKeepTransform(cublet, GLB.cubelets, GLB.temp);
        }
        return;
    }
    
    if (rotateState === DO_ROTATE || rotateState === END_ROTATE) {
        GLB.temp.localTransform = alignmentMatrix;
        multiplyMat4(GLB.temp.localTransform, rotationMatrix);
    }

    if (rotateState === END_ROTATE) {
        for (const cublet of GLB.cubletsToRotate) {
            switchParentKeepTransform(cublet, GLB.temp, GLB.cubelets, true);
        }

        GLB.temp.localTransform = identityMat4();
        GLB.temp.setChildren([]);

        const newCubelets = GLB.cubeletsBeforeRotation;
        GLB.cubeletsBeforeRotation = null;
        const temp = newCubelets.slice();

        for (let i = 0; i < indices.length; ++i) {
            const curI = indices[i];
            const newI = newIndices[i];

            newCubelets[newI] = temp[curI];
        }

        GLB.cubelets.setChildren(newCubelets);

        GLB.cubletsToRotate = null;
    }
}

// Relative to the coordinate space not relative to the center of the cube.
const ROTATION_MAPPINGS_CLOCKWISE = [
    [2, 0], [2, 1], [2, 2],
    [1, 0], [1, 1], [1, 2],
    [0, 0], [0, 1], [0, 2]
];

// Relative to the coordinate space not relative to the center of the cube.
const ROTATION_MAPPINGS_COUNTER_CLOCKWISE = [
    [0, 2], [0, 1], [0, 0],
    [1, 2], [1, 1], [1, 0],
    [2, 2], [2, 1], [2, 0]
];

function getRotationInfo(rotation, rotateClockwise, interpolation) {
    let indicesToRotate, newIndicesAfterRotation, axis;

    if (rotation === "left") {
        [indicesToRotate, newIndicesAfterRotation] = getIndicesOfCubletsToRotate(1, 2, 0, 0, rotateClockwise);
        axis = null;
    } else if (rotation === "x-middle") {
        rotateClockwise = !rotateClockwise;
        [indicesToRotate, newIndicesAfterRotation] = getIndicesOfCubletsToRotate(1, 2, 0, 1, rotateClockwise);
        axis = null;
    } else if (rotation === "right") {
        rotateClockwise = !rotateClockwise;
        [indicesToRotate, newIndicesAfterRotation] = getIndicesOfCubletsToRotate(1, 2, 0, 2, rotateClockwise);
        axis = null;
    } else if (rotation === "front") {
        [indicesToRotate, newIndicesAfterRotation] = getIndicesOfCubletsToRotate(1, 0, 2, 2, rotateClockwise);
        axis = [0, 1, 0];
    } else if (rotation === "z-middle") {
        [indicesToRotate, newIndicesAfterRotation] = getIndicesOfCubletsToRotate(1, 0, 2, 1, rotateClockwise);
        axis = [0, 1, 0];
    } else if (rotation === "back") {
        rotateClockwise = !rotateClockwise;
        [indicesToRotate, newIndicesAfterRotation] = getIndicesOfCubletsToRotate(1, 0, 2, 0, rotateClockwise);
        axis = [0, 1, 0];
    } else if (rotation === "up") {
        rotateClockwise = !rotateClockwise;
        [indicesToRotate, newIndicesAfterRotation] = getIndicesOfCubletsToRotate(2, 0, 1, 2, rotateClockwise);
        axis = [0, 0, 1];
    } else if (rotation === "y-middle") {
        rotateClockwise = !rotateClockwise;
        [indicesToRotate, newIndicesAfterRotation] = getIndicesOfCubletsToRotate(2, 0, 1, 1, rotateClockwise);
        axis = [0, 0, 1];
    } else if (rotation === "down") {
        [indicesToRotate, newIndicesAfterRotation] = getIndicesOfCubletsToRotate(2, 0, 1, 0, rotateClockwise);
        axis = [0, 0, 1];
    }

    const alignmentMatrix = identityMat4();
    if (axis !== null) {
        rotateMat4(alignmentMatrix, 90, axis);
    }

    const factor = rotateClockwise ? -1 : 1;
    const rotationMatrix = angleAxisToMat4(factor * 90 * interpolation, [-1, 0, 0]);

    return [alignmentMatrix, rotationMatrix, indicesToRotate, newIndicesAfterRotation];
}

function getIndicesOfCubletsToRotate(axisI, axisJ, lockedAxis, lockedValue, rotateClockwise) {
    function cubletPositionToIndex(pos) {
        return (pos[0] * 9) + (pos[1] * 3) + pos[2];
    }

    rotateClockwise = rotateClockwise === true;

    const indices = [];
    const newIndices = [];

    for (let i = 0; i < 3; ++i) {
        for (let j = 0; j < 3; ++j) {
            const pos = Array(3);
            pos[axisI] = i;
            pos[axisJ] = j;
            pos[lockedAxis] = lockedValue;

            indices.push(cubletPositionToIndex(pos));

            const mappings = rotateClockwise ?
                ROTATION_MAPPINGS_CLOCKWISE :
                ROTATION_MAPPINGS_COUNTER_CLOCKWISE;
            
            const newPos = Array(3);
            const [newI, newJ] = mappings[(j * 3) + i];
            newPos[axisI] = newI;
            newPos[axisJ] = newJ;
            newPos[lockedAxis] = lockedValue;

            newIndices.push(cubletPositionToIndex(newPos));
        }
    }

    return [indices, newIndices];
}

/**
 * Loads a texture from file.
 */
function getTexture(filename) {
    return new Promise(function (resolve) {
        const image = new Image();
        image.src = filename;

        image.addEventListener("load", function () {
            const texture = loadTexture(image);
            resolve(texture);
        });
    });
}

/**
 * Load a texture onto the GPU.
 */
function loadTexture(img) {
    let texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // Load the image data into the texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    // Setup options for downsampling and upsampling the image data
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Cleanup
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
}
