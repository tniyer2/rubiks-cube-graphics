
/**
 * Loads a model into GPU with the coordinates, colors, and indices provided.
 */
function loadModel(gl, coords, colors, indices, useStrips) {
    useStrips = useStrips === true;

    // Create and bind VAO
    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    
    // Load vertex positions into GPU
    coords = Float32Array.from(coords);
    loadArrayBuffer(gl, coords, gl.program.aPosition, 3, gl.FLOAT);

    // Load vertex normals into GPU
    const normals = calc_normals(coords, indices, useStrips)
    loadArrayBuffer(gl, normals, gl.program.aNormal, 3, gl.FLOAT);

    if (colors === null) {
        colors = Array(coords.length / 3).fill().flatMap(() => [0, 1, 0]);
    }
    
    // Load vertex colors into GPU
    loadArrayBuffer(gl, Float32Array.from(colors), gl.program.aColor, 3, gl.FLOAT);

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
function loadArrayBuffer(gl, values, location, numComponents, componentType) {
    const buf = gl.createBuffer();
    
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
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

    return loadModel(gl, coords, colors, indices);
}

function loadModelFromWavefrontOBJ(gl, filename) {
    return fetch(filename)
        .then((r) => r.text())
        .then((text) => parseWavefrontOBJ(gl, text));
}

function parseWavefrontOBJ(gl, text) {
    function filterEmptyStrings(arr) {
        return arr.filter(x => x.match(/.+/) !== null);
    }
    
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

    return loadModel(gl, newVertexPositions, null, indices);
}

export {
    loadCubeModel,
    loadModelFromWavefrontOBJ
};
