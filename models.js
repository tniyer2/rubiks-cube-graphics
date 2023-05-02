
import { makeFilledArray, concat, concatSlice, initOptions } from "./utils.js";
import { calcNormals } from "./tools.js";

/**
 * Loads a model into GPU with the coordinates and indices provided.
 * Other data can optionally be passed through options.
 */
function loadModel(gl, coords, indices, options) {
    const DEFAULTS = {
        colors: null,
        defaultColor: [1, 1, 1], // White
        texCoords: null,
        normals: null,
        useStrips: false,
        keepCoordsInMemory: false
    };
    options = initOptions(options, DEFAULTS);

    const useStrips = options.useStrips === true;
    const keepCoordsInMemory = options.keepCoordsInMemory === true;

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
        colors = makeFilledArray(coords.length / 3, options.defaultColor);
        colors = colors.flat();
    }
    colors = Float32Array.from(colors);
    loadArrayBuffer(gl, colors, gl.program.aColor, 3, gl.FLOAT);

    // Load texture coordinates into GPU.
    let texCoords = options.texCoords;
    if (texCoords !== null) {
        texCoords = Float32Array.from(texCoords);
        loadArrayBuffer(gl, texCoords, gl.program.aTexCoord, 2, gl.FLOAT);
    }

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

    const model = { vao, count, mode };

    if (keepCoordsInMemory) {
        model.coords = coords;
    }

    return model;
}

/**
 * Creates and loads an array buffer into the GPU and
 * attaches it to a location and enables it.
 * data          - a typed array to be uploaded to the buffer.
 * location      - the location the buffer should attach to.
 * numComponents - the number of components per attribute.
 * componentType - the type of the component. (matches type of data)
 */
function loadArrayBuffer(gl, data, location, numComponents, componentType) {
    const buf = gl.createBuffer();
    
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(location, numComponents, componentType, false, 0, 0);
    gl.enableVertexAttribArray(location);

    return buf;
}

function loadModelFromWavefrontOBJ(gl, filename, options) {
    return fetch(filename)
        .then((r) => r.text())
        .then((text) => _loadModelFromWavefrontOBJ(gl, text, options));
}

function _loadModelFromWavefrontOBJ(gl, text, options) {
    const DEFAULTS = {
        colors: null,
        unpackColors: false
    };
    options = initOptions(options, DEFAULTS);

    const unpackColors = options.unpackColors === true;

    const lines = parseText(text);

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

    // Load data from each line.
    for (const tokens of lines) {
        const firstToken = tokens.shift();

        if (firstToken === "v") { // position
            if (tokens.length !== 3) {
                throw new Error("Invalid length.");
            }

            concat(packedPositions, stringsToFloats(tokens));
        } else if (firstToken === "vt") { // texture coords
            if (tokens.length !== 2) {
                throw new Error("Invalid length.");
            }

            concat(packedTexCoords, stringsToFloats(tokens));
        } else if (firstToken === "vn") { // normals
            if (tokens.length !== 3) {
                throw new Error("Invalid length.");
            }
            
            concat(packedNormals, stringsToFloats(tokens));
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
        } else if (firstToken === "mtllib") {
            // pass
        } else if (firstToken === "usemtl") {
            // pass
        } else if (firstToken === "o") {
            // pass
        } else if (firstToken === "s") {
            // pass
        } else {
            throw new Error("Invalid token: " + firstToken);
        }
    }

    // Unpack vertex attributes based on the mapping.
    for (let mapping of vertexMappings) {
        mapping = mapping.split(/\//);
        // Each index starts from 1.
        mapping = mapping.map(x => Number(x) - 1);

        // Get indexes in mapping.
        const [posI, texCoordI, normalI] = mapping;

        concatSlice(positions, packedPositions, posI * 3, 3);
        concatSlice(texCoords, packedTexCoords, texCoordI * 2, 2);
        concatSlice(normals, packedNormals, normalI * 3, 3);

        if (unpackColors) {
            concatSlice(colors, options.colors, posI * 3, 3);
        }
    }

    const m = loadModel(gl, positions, indices, { normals, colors, texCoords });

    return m;
}

/**
 * Returns an array of lines with
 * each line being an array of tokens parsed
 * from the text.
 */
function parseText(text) {
    const filterEmptyStrings = a => a.filter(x => x.match(/.+/) !== null);

    let lines;

    // Split into lines
    lines = text.split(/\n/);
    lines = filterEmptyStrings(lines);
    
    // Split each line into tokens
    lines = lines.map(line => line.split(/\s/));
    lines = lines.map(tokens => filterEmptyStrings(tokens));
    lines = lines.filter(tokens => tokens.length !== 0);
    
    // filter comments out
    lines = lines.filter(tokens => tokens[0] !== "#");

    return lines;
}

export { loadModelFromWavefrontOBJ };
