// Rubik's Cube Game
// Authors: Bryan Cohen & Tanishq Iyer
"use strict";

import {
    Vec2, Mat4,
    translateMat4, scaleMat4, rotateMat4,
    angleAxisToMat4,
    degreesToRadians, radiansToDegrees
} from "./linearAlgebraUtils.js";

import { createSceneTreeNode } from "./sceneTree.js";

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

    // Get the WebGL context.
    gl = canvas.getContext("webgl2");
    if (!gl) { window.alert("WebGL isn't available"); return; }
    GLB.canvasElm = canvas;

    // Configure WebGL.
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.8, 1.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    
    // Initialize the WebGL program and data.
    gl.program = initProgram();
    initUniforms();
    await initGameWorld();
    initEvents();
    onWindowResize();

    // Start the Game Loop
    runFrame();
});

/**
 * Initializes the WebGL program.
 */
function initProgram() {
    // Compile shaders.
    // Vertex Shader
    const vert_shader = compileShader(gl, gl.VERTEX_SHADER,
        `#version 300 es
        precision mediump float;

        uniform vec4 uLight;
        uniform mat4 uModelMatrix;
        uniform mat4 uCameraMatrix;
        uniform mat4 uProjectionMatrix;

        in vec4 aPosition;
        in vec3 aNormal;
        in vec3 aColor;

        out vec3 vNormalVector;
        out vec3 vLightVector;
        out vec3 vEyeVector;
        flat out vec3 vColor;

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
        }`
    );

    // Fragment Shader
    const frag_shader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        // Light constants
        const vec3 lightColor = normalize(vec3(1.0, 1.0, 1.0));

        // Material constants
        const float materialAmbient = 0.2;
        const float materialDiffuse = 0.95;
        const float materialSpecular = 0.05;
        const float materialShininess = 5.0;
        
        // Attenuation constants
        const float lightConstantA = 0.025;
        const float lightConstantB = 0.05;
        const float lightConstantC = 1.0;

        uniform float uLightIntensity;

        in vec3 vNormalVector;
        in vec3 vLightVector;
        in vec3 vEyeVector;
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

            fragColor.rgb = (((A + D) * vColor) + S) * lightColor * uLightIntensity;
            fragColor.a = 1.0;
        }
        `
    );

    // Link the shaders into a program and use them with the WebGL context.
    const program = linkProgram(gl, vert_shader, frag_shader);
    gl.useProgram(program);
    
    // Get the attribute indices.
    const attributes = ["aPosition", "aNormal", "aColor"];
    for (const a of attributes) {
        program[a] = gl.getAttribLocation(program, a);
    }

    // Get the uniform indices.
    const uniforms = [
        "uCameraMatrix", "uModelMatrix", "uProjectionMatrix",
        "uLight", "uLightIntensity",
        /*
        uLightAttenuation, uLightAmbient, uLightDiffuse, uLightSpecular,
        uMaterialAmbient, uMaterialDiffuse, uMaterialSpecular, uMaterialShininess
        */
    ];
    for (const u of uniforms) {
        program[u] = gl.getUniformLocation(program, u);
    }

    return program;
}

/**
 * Set the initial value of some uniforms.
 */
function initUniforms() {
    gl.uniform3fv(gl.program.uLightAmbient, stringToColorFloat32("#ffffff"));
    gl.uniform3fv(gl.program.uLightDiffuse, stringToColorFloat32("#ffffff"));
    gl.uniform3fv(gl.program.uLightSpecular, stringToColorFloat32("#ffffff"));

    gl.uniform3fv(gl.program.uMaterialAmbient, stringToColorFloat32("#330000"));
    gl.uniform3fv(gl.program.uMaterialDiffuse, stringToColorFloat32("#a00000"));
    gl.uniform3fv(gl.program.uMaterialSpecular, stringToColorFloat32("#606060"));
    gl.uniform1f(gl.program.uMaterialShininess, 5);
}

/**
 * Create the camera and all objects in world.
 * Load all objects' models.
 */
async function initGameWorld() {
    GLB.world = createSceneTreeNode("world");

    // Create the camera.
    {
        const camera = createSceneTreeNode("camera");
        translateMat4(camera.localTransform, [0, 0, 4]);

        GLB.world.camera = camera;
        GLB.world.addChild(camera);
    }

    // Create the Rubik's Cube Parent Objects.
    {
        GLB.rubiksCube = createSceneTreeNode("empty");
        rotateMat4(GLB.rubiksCube.localTransform, 30, [1, 0, 0]);
        rotateMat4(GLB.rubiksCube.localTransform, 45, [0, 1, 0]);

        GLB.childrens = createSceneTreeNode("empty");
        GLB.temp = createSceneTreeNode("empty");

        GLB.world.addChild(GLB.rubiksCube);
        GLB.rubiksCube.addChild(GLB.childrens);
        GLB.rubiksCube.addChild(GLB.temp);
    }

    const RED = stringToColor("#BA0C2F");
    const BLUE = stringToColor("#003DA5");
    const YELLOW = stringToColor("#FFD700");
    const ORANGE = stringToColor("#FE5000");
    const WHITE = stringToColor("#FFFFFF");
    const GREEN = stringToColor("#009A44");
    const BLACK = [0, 0, 0];

    const colors = [RED, BLUE, YELLOW, ORANGE, WHITE, GREEN, BLACK, BLACK]
        .flatMap(c => [c, c, c]).flat();

    const centerCubletModel = await loadModelFromWavefrontOBJ(gl, "center.obj", { colors });
    const edgeCubletModel = await loadModelFromWavefrontOBJ(gl, "edge.obj", { colors });
    const cornerCubletModel = await loadModelFromWavefrontOBJ(gl, "corner.obj", { colors });

    const cubletModels = [
        cornerCubletModel,
        edgeCubletModel, 
        centerCubletModel,
        centerCubletModel
    ];

    // Create smaller cubes
    for (let x = 0; x < 3; ++x) {
        for (let y = 0; y < 3; ++y) {
            for (let z = 0; z < 3; ++z) {
                const cublet = createSceneTreeNode("model");

                const numAxesCentered = [x, y, z]
                    .map(axis => axis === 1 ? 1 : 0)
                    .reduce((a, b) => a + b);
                
                cublet.model = cubletModels[numAxesCentered];

                translateMat4(cublet.localTransform, [x, y, z].map(e => (e - 1) * 0.5));
                // TODO: When models are complete, rotate them so they are oriented correctly.
                scaleMat4(cublet.localTransform, 0.2);

                GLB.childrens.addChild(cublet);
            }
        }
    }
}

/**
 * Initialize event handlers.
 */
function initEvents() {
    window.addEventListener("resize", onWindowResize);

    GLB.keyInput = KeyInputManager(window);

    const handler = ClickAndDragHandler(GLB.canvasElm, onMouse);
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
 * Updates the projection matrix based on the current canvas dimensions.
 */
function updateProjectionMatrix() {
    let [w, h] = [gl.canvas.width, gl.canvas.height];

    const proj = Mat4.perspective(Mat4.create(), degreesToRadians(90), w / h, 0.0001, 1000);

    // orthographic for debugging
    // const proj = mat4.ortho(mat4.create(), -2, 2, -2, 2, 1000, -1000);

    gl.uniformMatrix4fv(gl.program.uProjectionMatrix, false, proj);
}

const ROTATE_Z_KEY = "Meta";
const LOCK_AXIS_KEY = "Shift";
const LOCK_STEP_KEY = "Alt";

const XY_ROTATE_SPEED = 3;
const Z_ROTATE_SPEED = 3;
const STEP_SIZE = 20;

/**
 * Handles rotating the Rubik's cube
 * when clicking and dragging.
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

    gl.uniform4fv(gl.program.uLight, [0, 0, 10, 1]);
    gl.uniform1f(gl.program.uLightIntensity, 4);
    
    gl.uniformMatrix4fv(gl.program.uCameraMatrix, false, GLB.world.camera.transform);

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

    draw(GLB.world);

    // Cleanup
    gl.bindVertexArray(null);
}

/** rotate a row or column of the cube when a key is pressed */
function updateRubiksCubeTransform() {
    const centerCube = createSceneTreeNode("cube"); 
    //let center_cube = mat4.create(); 

    // Define positions of little cubes relative to center of Rubik's cube
    const positions = [
        [-1, 1, -1], [0, 1, -1], [1, 1, -1],
        [-1, 0, -1], [0, 0, -1], [1, 0, -1],
        [-1, -1, -1], [0, -1, -1], [1, -1, -1],

        [-1, 1, 0], [0, 1, 0], [1, 1, 0],
        [-1, 0, 0], [0, 0, 0], [1, 0, 0],
        [-1, -1, 0], [0, -1, 0], [1, -1, 0],

        [-1, 1, 1], [0, 1, 1], [1, 1, 1],
        [-1, 0, 1], [0, 0, 1], [1, 0, 1],
        [-1, -1, 1], [0, -1, 1], [1, -1, 1],
    ];

    // Create smaller cubes
    for (let position in positions) {
        const cublets = createSceneTreeNode("cube");
        cublets.scale = [0.2, 0.2, 0.2];
        cublets.position = positions[position];
        centerCube.addChild(cublets);
    }

    // Add event listener for key press
    document.addEventListener("keydown", event => {
        if (event.key === "m") {
            // Rotate the middle row by 90 degrees on the Y axis
            console.log("rotate m")
            const rotationAxis = [0, 1, 0];
            const radians = degreesToRadians(90);
            const rotationMatrix = Mat4.fromRotation(Mat4.create(), radians, rotationAxis);
            const translatedMatrix = Mat4.translate(Mat4.create(), GLB.rubiksCube.localTransform, [0, 0, 0]);
            const transformedMatrix = Mat4.multiply(Mat4.create(), rotationMatrix, translatedMatrix);
            //GLB.rubiksCube.localTransform(transformedMatrix);
        }

        if (event.key === "n") {
            // Rotate the middle column by 90 degrees on the X axis
            const rotationAxis = [1, 0, 0];
            const radians = degreesToRadians(90);
            const rotationMatrix = Mat4.fromRotation(Mat4.create(), radians, rotationAxis);
            const translatedMatrix = Mat4.translate(Mat4.create(), GLB.rubiksCube.localTransform, [0, 0, 0]);
            const transformedMatrix = Mat4.multiply(Mat4.create(), rotationMatrix, translatedMatrix);
            //GLB.rubiksCube.localTransform(transformedMatrix);
        }

        if (event.key === "b") {
            // Rotate the middle column by 90 degrees on the Z axis
            const rotationAxis = [0, 0, 1];
            const radians = degreesToRadians(90);
            const rotationMatrix = Mat4.fromRotation(Mat4.create(), radians, rotationAxis);
            const translatedMatrix = Mat4.translate(Mat4.create(), GLB.rubiksCube.localTransform, [0, 0, 0]);
            const transformedMatrix = Mat4.multiply(Mat4.create(), rotationMatrix, translatedMatrix);
            //GLB.rubiksCube.localTransform(transformedMatrix);
        }
    });

    return centerCube;
}

// Function to rotate the row containing the specified child cube
function rotateRowContainingChild(child) {
    // Get the parent node of the child
    const parent = child.parent;

    // Find the row that the child belongs to
    let rowIndex = null;
    for (let i = 0; i < parent.children.length; ++i) {
        const position = parent.children[i].position;
        if (position[1] === child.position[1]) {
            rowIndex = Math.floor(i / 3);
            break;
        }
    }

    // Rotate the entire row along the X or Z axis depending on the orientation of the row
    if (rowIndex === 0 || rowIndex === 2) {
        // Row is oriented along the X axis
        const radians = degreesToRadians(90);
        const rotationMatrix = Mat4.fromXRotation(Mat4.create(), radians);
        const translationMatrix = Mat4.translate(Mat4.create(), parent.getLocalTransform(), [0, child.position[1], 0]);
        const transformedMatrix = Mat4.multiply(Mat4.create(), translationMatrix, rotationMatrix);
        parent.setLocalTransform(transformedMatrix);
    } else {
        // Row is oriented along the Z axis
        const radians = degreesToRadians(90);
        const rotationMatrix = Mat4.fromZRotation(Mat4.create(), radians);
        const translationMatrix = Mat4.translate(Mat4.create(), parent.getLocalTransform(), [0, 0, child.position[2]]);
        const transformedMatrix = Mat4.multiply(Mat4.create(), translationMatrix, rotationMatrix);
        parent.setLocalTransform(transformedMatrix);
    }
}

function stringToColor(str) {
    return [
        parseInt(str.substr(1, 2), 16) / 255.0,
        parseInt(str.substr(3, 2), 16) / 255.0,
        parseInt(str.substr(5, 2), 16) / 255.0
    ];
}

function stringToColorFloat32(str) {
    return Float32Array.from(stringToColor(str));
}
