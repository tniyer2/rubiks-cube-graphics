// Rubik's Cube Game
// Authors: Bryan Cohen & Tanishq Iyer
"use strict";

import {
    vec2, vec3, vec4, mat4, quat,
    translateMat4, scaleMat4, rotateMat4,
    angleAxisToQuat, angleAxisToMat4,
    degreesToRadians, radiansToDegrees
} from "./linearAlgebraUtils.js";

import { createMouseHandler, windowToClipSpace, createKeyInputManager } from "./input.js";

// Global WebGL context variable
let gl;

window.addEventListener("load", async function init() {
    // Get the canvas element.
    const canvas = document.getElementById("webgl-canvas");
    if (!canvas) { window.alert("Could not find #webgl-canvas"); return; }

    // Get the WebGL context.
    gl = canvas.getContext("webgl2");
    if (!gl) { window.alert("WebGL isn't available"); return; }
    gl.canvasElm = canvas;

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
    gl.uniform3fv(gl.program.uLightAmbient, stringToColor("#ffffff"));
    gl.uniform3fv(gl.program.uLightDiffuse, stringToColor("#ffffff"));
    gl.uniform3fv(gl.program.uLightSpecular, stringToColor("#ffffff"));

    gl.uniform3fv(gl.program.uMaterialAmbient, stringToColor("#330000"));
    gl.uniform3fv(gl.program.uMaterialDiffuse, stringToColor("#a00000"));
    gl.uniform3fv(gl.program.uMaterialSpecular, stringToColor("#606060"));
    gl.uniform1f(gl.program.uMaterialShininess, 5);
}

/**
 * Create the camera and all objects in world.
 * Load all objects' models.
 */
async function initGameWorld() {
    gl.world = createSceneTreeNode("world");

    // Create the camera.
    {
        const camera = createSceneTreeNode("camera");
        translateMat4(camera.localTransform, [0, 0, 4]);

        gl.world.camera = camera;
        gl.world.addChild(camera);
    }

    // Create the Rubik's Cube Parent Objects.
    {
        gl.rubiksCube = createSceneTreeNode("empty");
        rotateMat4(gl.rubiksCube.localTransform, 30, [1, 0, 0]);
        rotateMat4(gl.rubiksCube.localTransform, 45, [0, 1, 0]);

        gl.childrens = createSceneTreeNode("empty");
        gl.temp = createSceneTreeNode("empty");

        gl.world.addChild(gl.rubiksCube);
        gl.rubiksCube.addChild(gl.childrens);
        gl.rubiksCube.addChild(gl.temp);
    }

    const centerCubletModel = await loadModelFromWavefrontOBJ("center.obj");
    const edgeCubletModel = await loadModelFromWavefrontOBJ("edge.obj");
    const cornerCubletModel = await loadModelFromWavefrontOBJ("corner.obj");

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

                gl.childrens.addChild(cublet);
            }
        }
    }
}

/**
 * Initialize event handlers.
 */
function initEvents() {
    window.addEventListener("resize", onWindowResize);

    gl.input = createKeyInputManager(window);

    const handler = createMouseHandler(gl.canvasElm, onMouse);
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

const ROTATE_Z_KEY = "Meta";
const LOCK_AXIS_KEY = "Shift";
const LOCK_STEP_KEY = "Alt";

const XY_ROTATE_SPEED = 3;
const Z_ROTATE_SPEED = 3;
const STEP_SIZE = 20;

/**
 * Handle the click-and-drag to rotate the Rubik's cube.
 */
function onMouse(e, type, self) {
    function updateTransform() {
        const rotateZ = gl.input.isKeyDown(ROTATE_Z_KEY);
        const lockAxis = gl.input.isKeyDown(LOCK_AXIS_KEY);
        const lockStep = gl.input.isKeyDown(LOCK_STEP_KEY);

        const applyStep = (x) => Math.floor(x / STEP_SIZE) * STEP_SIZE;

        let rot;
        if (rotateZ) {
            // TODO: (Maybe?) center mousePos on screen space cube center.
            const [x, y] = self.mousePos;
            const curAngle = Math.atan2(y, x);

            let angle = radiansToDegrees((curAngle - self.startAngle) * Z_ROTATE_SPEED);

            if (lockStep) {
                angle = applyStep(angle);
            }

            rot = angleAxisToMat4(angle, [0, 0, 1]);
        } else {
            const diff = vec2.subtract(vec2.create(), self.mousePos, self.startMousePos);

            let angleX = diff[0] * 100 * XY_ROTATE_SPEED;
            let angleY = diff[1] * 100 * XY_ROTATE_SPEED;
            
            if (lockStep) {
                angleX = applyStep(angleX);
                angleY = applyStep(angleY);
            }

            const rotX = angleAxisToMat4(angleX, [0, 1, 0]);
            const rotY = angleAxisToMat4(angleY, [-1, 0, 0]);

            if (lockAxis) {
                rot = Math.abs(diff[0]) >= Math.abs(diff[1]) ? rotX : rotY;
            } else {
                rot = mat4.multiply(mat4.create(), rotX, rotY);
            }
        }

        gl.rubiksCube.localTransform = mat4.multiply(
            mat4.create(), 
            rot, 
            self.startTransform
        );
    }

    self.mousePos = windowToClipSpace(
        e.offsetX, e.offsetY, this.width, this.height);

    if (type === "enter") {
        const clickedLeftMouseButton = e.button === 0;
        if (clickedLeftMouseButton) {
            self.startMousePos = self.mousePos;
            self.startTransform = gl.rubiksCube.transform;

            const [x, y] = self.startMousePos;
            self.startAngle = Math.atan2(y, x);
            
            self.removes = [
                gl.input.addListener(ROTATE_Z_KEY, updateTransform),
                gl.input.addListener(LOCK_AXIS_KEY, updateTransform),
                gl.input.addListener(LOCK_STEP_KEY, updateTransform)
            ];

            return true; // enters drag
        }
    } else if (type === "drag") {
        updateTransform();
    } else if (type === "exit") {
        self.removes.forEach(r => r());
    }

    return false;
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

/** rotate a row or column of the cube when a key is pressed */
function updateRubiksCubeTransform() {
    const centerCube = createSceneTreeNode("cube"); 
    //let center_cube = glMatrix.mat4.create(); 

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
            const rotationMatrix = glMatrix.mat4.fromRotation(glMatrix.mat4.create(), radians, rotationAxis);
            const translatedMatrix = glMatrix.mat4.translate(glMatrix.mat4.create(), gl.rubiksCube.localTransform, [0, 0, 0]);
            const transformedMatrix = glMatrix.mat4.multiply(glMatrix.mat4.create(), rotationMatrix, translatedMatrix);
            //gl.rubiksCube.localTransform(transformedMatrix);
        }

        if (event.key === "n") {
            // Rotate the middle column by 90 degrees on the X axis
            const rotationAxis = [1, 0, 0];
            const radians = degreesToRadians(90);
            const rotationMatrix = glMatrix.mat4.fromRotation(glMatrix.mat4.create(), radians, rotationAxis);
            const translatedMatrix = glMatrix.mat4.translate(glMatrix.mat4.create(), gl.rubiksCube.localTransform, [0, 0, 0]);
            const transformedMatrix = glMatrix.mat4.multiply(glMatrix.mat4.create(), rotationMatrix, translatedMatrix);
            //gl.rubiksCube.localTransform(transformedMatrix);
        }

        if (event.key === "b") {
            // Rotate the middle column by 90 degrees on the Z axis
            const rotationAxis = [0, 0, 1];
            const radians = degreesToRadians(90);
            const rotationMatrix = glMatrix.mat4.fromRotation(glMatrix.mat4.create(), radians, rotationAxis);
            const translatedMatrix = glMatrix.mat4.translate(glMatrix.mat4.create(), gl.rubiksCube.localTransform, [0, 0, 0]);
            const transformedMatrix = glMatrix.mat4.multiply(glMatrix.mat4.create(), rotationMatrix, translatedMatrix);
            //gl.rubiksCube.localTransform(transformedMatrix);
        }
    });

    return centerCube;
}

// Function to rotate the row containing the specified child cube
function rotateRowContainingChild(child) {
    // Get the parent node of the child
    const parent = child.getParent();

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
        const rotationMatrix = glMatrix.mat4.fromXRotation(glMatrix.mat4.create(), radians);
        const translationMatrix = glMatrix.mat4.translate(glMatrix.mat4.create(), parent.getLocalTransform(), [0, child.position[1], 0]);
        const transformedMatrix = glMatrix.mat4.multiply(glMatrix.mat4.create(), translationMatrix, rotationMatrix);
        parent.setLocalTransform(transformedMatrix);
    } else {
        // Row is oriented along the Z axis
        const radians = degreesToRadians(90);
        const rotationMatrix = glMatrix.mat4.fromZRotation(glMatrix.mat4.create(), radians);
        const translationMatrix = glMatrix.mat4.translate(glMatrix.mat4.create(), parent.getLocalTransform(), [0, 0, child.position[2]]);
        const transformedMatrix = glMatrix.mat4.multiply(glMatrix.mat4.create(), translationMatrix, rotationMatrix);
        parent.setLocalTransform(transformedMatrix);
    }
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

function loadCubeModel() {
    const coords = [
        1, 1, 1, // A
        -1, 1, 1, // B
        -1, -1, 1, // C
        1, -1, 1, // D
        1, -1, -1, // E
        -1, -1, -1, // F
        -1, 1, -1, // G
        1, 1, -1, // H
    ];

    const colors = [
        1, 0, 0, // red
        1, 1, 0, // yellow
        0, 1, 0, // green
        0, 0, 0, // black (color is not actually used)
        0, 1, 1, // cyan
        0, 0, 1, // blue
        0, 0, 0, // black (color is not actually used)
        1, 0, 1, // purple
    ];

    const indices = [
        1, 2, 0, 2, 3, 0,
        7, 6, 1, 0, 7, 1,
        1, 6, 2, 6, 5, 2,
        3, 2, 4, 2, 5, 4,
        6, 7, 5, 7, 4, 5,
        0, 3, 7, 3, 4, 7,
    ];

    return loadModel(coords, colors, indices);
}

function loadModelFromJSON(filename) {
    return fetch(filename)
        .then((r) => r.json())
        .then((json) => {
            const coords = json["vertices"];
            const colors = json["colors"];
            const indices = json["indices"];

            return loadModel(coords, colors, indices, false);
        });
}

function parseWavefrontOBJ(text) {
    let lines = text.split(/\n/);

    lines = filterEmptyStrings(lines);
    
    lines = lines.map(line => line.split(/\s/));
    lines = lines.map(tokens => filterEmptyStrings(tokens));
    lines = lines.filter(tokens => tokens.length !== 0);
    
    // filters comments
    lines = lines.filter(tokens => tokens[0] !== "#");

    const vertexPositions = [];
    const vertexNormals = [];
    const vertexUVs = [];
    const newVertexPositions = [];
    const newVertexNormals = [];
    const newVertexUVs = [];
    const vertexMappings = [];
    const indices = []; // relative to vertex mappings

    const tokensToNumbers = tokens => tokens.map(t => Number(t));
    const pushAllNums = (arr, nums) => {
        for (let i = 0; i < nums.length; ++i) {
            arr.push(nums[i]);
        }
    };

    lines.forEach((tokens) => {
        const firstToken = tokens.shift();

        if (firstToken === "v") {
            if (tokens.length !== 3) {
                throw new Error("Invalid length.");
            }

            const nums = tokensToNumbers(tokens);
            pushAllNums(vertexPositions, nums);
        } else if (firstToken === "vt") {
            if (tokens.length !== 2) {
                throw new Error("Invalid length.");
            }

            const nums = tokensToNumbers(tokens);
            pushAllNums(vertexUVs, nums);
        } else if (firstToken === "vn") {
            if (tokens.length !== 3) {
                throw new Error("Invalid length.");
            }
            
            const nums = tokensToNumbers(tokens);
            pushAllNums(vertexNormals, nums);
        } else if (firstToken === "f") {
            if (tokens.length !== 3) {
                throw new Error("Invalid length.");
            }
            
            for (let i = 0; i < tokens.length; ++i) {
                const token = tokens[i];

                let index = vertexMappings.indexOf(token);
                if (index === -1) {
                    vertexMappings.push(token);
                    index = vertexMappings.length - 1;
                }

                indices.push(index);
            }
        } else if (firstToken === "mtllib") {
            // TODO
        } else if (firstToken === "usemtl") {
            // TODO
        } else if (firstToken === "o") {
            // TODO
        } else if (firstToken === "s") {
            // TODO
        } else {
            throw new Error("Invalid token: " + firstToken);
        }


    });

    const pushNumsFromArray = (arr1, arr2, i, n) => {
        for (let j = 0; j < n; ++j) {
            arr1.push(arr2[(i * n) + j]);
        }
    }

    for (let i = 0; i < vertexMappings.length; ++i) {
        const mapping = vertexMappings[i];
        let [vi, vti, vni] = mapping.split(/\//).map(x => Number(x) - 1);

        pushNumsFromArray(newVertexPositions, vertexPositions, vi, 3);
        pushNumsFromArray(newVertexUVs, vertexUVs, vti, 2);
        pushNumsFromArray(newVertexNormals, vertexNormals, vni, 3);
    }

    //console.log("vertexPositions: ", vertexPositions);
    // console.log("vertexNormals: ", vertexNormals);
    // console.log("vertexUVs: ", vertexUVs);
    // console.log("newVertexPositions: ", newVertexPositions);
    // console.log("newVertexNormals: ", newVertexNormals);
    // console.log("newVertexUVs: ", newVertexUVs);
    // console.log("vertexMappings: ", vertexMappings);
    // console.log("indices: ", indices);

    return loadModel(newVertexPositions, null, indices);
}

function filterEmptyStrings(arr) {
    return arr.filter(x => x.match(/.+/) !== null);
}

function loadModelFromWavefrontOBJ(filename) {
    return fetch(filename)
        .then((r) => r.text())
        .then((text) => parseWavefrontOBJ(text));
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

function stringToColor(str) {
    return Float32Array.of(
        parseInt(str.substr(1, 2), 16) / 255.0,
        parseInt(str.substr(3, 2), 16) / 255.0,
        parseInt(str.substr(5, 2), 16) / 255.0
    );
}
