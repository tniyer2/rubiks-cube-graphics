
import { calcNormals } from "./tools.js";

/**
 * Loads a model into GPU with the coordinates and indices provided.
 * Other data can optionally passed through options.
 */
function loadModel(gl, coords, indices, options) {
    if (typeof options === "undefined") {
        options = {};
    } else if (typeof options !== "object") {
        throw new Error("Invalid argumenmt.");
    }
    const DEFAULTS = { colors: null, texCoords: null, normals: null, useStrips: false };
    options = Object.assign(DEFAULTS, options);

    const useStrips = options.useStrips === true;

    // Create and bind VAO.
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    
    // Load vertex positions into GPU.
    coords = Float32Array.from(coords);
    loadArrayBuffer(gl, coords, gl.program.aPosition, 3, gl.FLOAT);

    // Load vertex normals into GPU.
    let normals;
    if (options.normals !== null) {
        normals = Float32Array.from(options.normals);
    } else {
        normals = calcNormals(coords, indices, useStrips);
    }
    loadArrayBuffer(gl, normals, gl.program.aNormal, 3, gl.FLOAT);

    // Load vertex colors into GPU.
    let colors = options.colors;
    if (colors === null) {
        const GREEN = [0, 1, 0];
        colors = Array(coords.length / 3).fill().flatMap(() => GREEN);
    }
    colors = Float32Array.from(colors);
    loadArrayBuffer(gl, colors, gl.program.aColor, 3, gl.FLOAT);

    // Load the index data into the GPU.
    indices = Uint16Array.from(indices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

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
 * Creates and loads an array buffer into the GPU,
 * attaches it to a location and enables it.
 * data - an array of components to be uploaded to the buffer.
 * location - the location the buffer should attach to.
 * numComponents - the number of components per attribute.
 * numType - the type of the component.
 */
function loadArrayBuffer(gl, data, location, numComponents, componentType) {
    const buf = gl.createBuffer();
    
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(location, numComponents, componentType, false, 0, 0);
    gl.enableVertexAttribArray(location);

    return buf;
}

function loadCubeModel(gl) {
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

    return loadModel(gl, coords, indices, { colors });
}

function loadModelFromWavefrontOBJ(gl, filename, options) {
    return fetch(filename)
        .then((r) => r.text())
        .then((text) => _loadModelFromWavefrontOBJ(gl, text, options));
}

function _loadModelFromWavefrontOBJ(gl, text, options) {
    if (typeof options === "undefined") {
        options = {};
    } else if (typeof options !== "object") {
        throw new Error("Invalid argumenmt.");
    }
    const DEFAULTS = { colors: null, unpackColors: false };
    options = Object.assign(DEFAULTS, options);

    const unpackColors = options.unpackColors === true;

    // Parse tokens from the wavefront obj text.
    let lines;
    {
        const filterEmptyStrings = a => a.filter(x => x.match(/.+/) !== null);

        // Split into lines
        lines = text.split(/\n/);
        lines = filterEmptyStrings(lines);
        
        // Split each line into tokens
        lines = lines.map(line => line.split(/\s/));
        lines = lines.map(tokens => filterEmptyStrings(tokens));
        lines = lines.filter(tokens => tokens.length !== 0);
        
        // filter comments out
        lines = lines.filter(tokens => tokens[0] !== "#");
    }

    const packedPositions = [];
    const packedNormals = [];
    const packedTexCoords = [];

    const positions = [];
    const normals = [];
    const texCoords = [];

    let colors;
    if (unpackColors) {
        colors = [];
    } else if (options.colors !== null) {
        colors = options.colors;
    } else {
        colors = null;
    }

    const vertexMappings = [];
    const indices = []; // relative to vertex mappings

    const stringsToFloats = a => a.map(s => Number(s));

    // Pushes every element in b onto a.
    const pushArray = (a, b) => {
        for (let i = 0; i < b.length; ++i) {
            a.push(b[i]);
        }
    };

    // Pushes a slice of b onto a.
    const pushSliceOfArray = (a, b, startIndex, numComponents) => {
        for (let i = 0; i < numComponents; ++i) {
            const j = (startIndex * numComponents) + i;
            a.push(b[j]);
        }
    }

    // Load data from each line.
    for (const tokens of lines) {
        const firstToken = tokens.shift();

        if (firstToken === "v") { // position
            if (tokens.length !== 3) {
                throw new Error("Invalid length.");
            }

            pushArray(packedPositions, stringsToFloats(tokens));
        } else if (firstToken === "vt") { // texture coords
            if (tokens.length !== 2) {
                throw new Error("Invalid length.");
            }

            pushArray(packedTexCoords, stringsToFloats(tokens));
        } else if (firstToken === "vn") { // normals
            if (tokens.length !== 3) {
                throw new Error("Invalid length.");
            }
            
            pushArray(packedNormals, stringsToFloats(tokens));
        } else if (firstToken === "f") {
            if (tokens.length !== 3) {
                throw new Error("Invalid length.");
            }
            
            for (const mapping of tokens) {
                let i = vertexMappings.indexOf(mapping);
                if (i === -1) {
                    vertexMappings.push(mapping);
                    i = vertexMappings.length - 1;
                }

                indices.push(i);
            }
        } else if (firstToken === "mtllib") { // load .mtl material file
            // TODO
        } else if (firstToken === "usemtl") { // use material for this object
            // TODO
        } else if (firstToken === "o") { // ?
            // TODO
        } else if (firstToken === "s") { // ?
            // TODO
        } else {
            throw new Error("Invalid token: " + firstToken);
        }
    }

    // Unpack vertex attributes based on the mapping.
    for (let mapping of vertexMappings) {
        mapping = mapping.split(/\//);
        mapping = mapping.map(x => Number(x) - 1);
        let [posI, texCoordI, normalI] = mapping;

        pushSliceOfArray(positions, packedPositions, posI, 3);
        pushSliceOfArray(texCoords, packedTexCoords, texCoordI, 2);
        pushSliceOfArray(normals, packedNormals, normalI, 3);

        if (unpackColors) {
            pushSliceOfArray(colors, options.colors, posI, 3);
        }
    }

    return loadModel(gl, positions, indices, { normals, colors });
}

export { loadCubeModel, loadModelFromWavefrontOBJ };
