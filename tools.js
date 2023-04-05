// Various useful functions - feel free to add additional functions to this file (or other files)
/* exported calc_normals, createVao, loadTexture, loadCubemapTexture */


/**
 * Creates a VAO containing the attributes and indices provided.
 *
 * The attributes argument is an array of 3-element arrays with attribute
 * location, data for the attribute, and number of values per vertex. For
 * example:
 *     [
 *       [gl.program.aPosition, coords, 3],
 *       [gl.program.aNormal, normals, 3],
 *     ]
 * The data values can be regular arrays or typed arrays. 
 *
 * The indices argument is an array or typed array for the indices.
 */
function createVao(gl, attributes, indices) {
    coords = Float32Array.from(coords);

    // Create and bind VAO
    let vao = gl.createVertexArray(), buf;
    gl.bindVertexArray(vao);

    // Load the data into the GPU and associate with shader
	for (let [attribute, data, count] of attributes) {
		if (data.constructor !== Float64Array) {
			data = Float64Array.from(data);
		}
		buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		gl.vertexAttribPointer(attribute, count, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(attribute);
	}

    // Load the index data into the GPU
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
	if (indices.constructor !== Uint16Array) {
		indices = Uint16Array.from(indices);
	}
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    // Return the VAO handle
    return vao;
}


/**
 * Load a texture onto the GPU. The image must be power-of-two sized image using RGBA with uint8
 * values. The image will be flipped vertically and will support mipmapping.
 */
function loadTexture(gl, img, idx) {
	if (typeof idx === "undefined") { idx = 0; }

	let texture = gl.createTexture(); // create a texture resource on the GPU
	gl.activeTexture(gl['TEXTURE'+idx]); // set the current texture that all following commands will apply to
	gl.bindTexture(gl.TEXTURE_2D, texture); // assign our texture resource as the current texture

	// Load the image data into the texture
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

	// Setup options for downsampling and upsampling the image data
	gl.generateMipmap(gl.TEXTURE_2D);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

	// Cleanup and return
	gl.bindTexture(gl.TEXTURE_2D, null);
	return texture;
}


/**
 * Load a texture onto the GPU as a cube-map texture. The images must be power-of-two sized image
 * using RGBA with uint8 values.
 */
function loadCubemapTexture(gl, xp, xn, yp, yn, zp, zn, idx) {
	if (typeof idx === "undefined") { idx = 0; }

	let texture = gl.createTexture(); // create a texture resource on the GPU
	gl.activeTexture(gl['TEXTURE'+idx]); // set the current texture that all following commands will apply to
	gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture); // assign our texture resource as the current texture

	// Load the image data into the texture
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
	gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, xp);
	gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, xn);
	gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, yp);
	gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, yn);
	gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, zp);
	gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, zn);

	// Setup options for downsampling and upsampling the image data
	gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	
	// Cleanup and return
	gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
	return texture;
}


/**
 * Calculates the normals for the vertices given an array of vertices and array of indices to look
 * up into. The triangles are full triangles and not triangle strips.
 *
 * Arguments:
 *    coords - a Float32Array with 3 values per vertex
 *    indices - a regular or typed array
 *    is_tri_strip - defaults to true which means the indices represent a triangle strip
 * Returns:
 *    Float32Array of the normals with 3 values per vertex
 */
function calc_normals(coords, indices, is_tri_strip) {
	const vec3 = glMatrix.vec3;

    if (is_tri_strip !== true && is_tri_strip !== false) { is_tri_strip = true; }
    
    // Start with all vertex normals as <0,0,0>
    let normals = new Float32Array(coords.length);

    // Get temporary variables
    let [N_face, V, U] = [vec3.create(), vec3.create(), vec3.create()];

    // Calculate the face normals for each triangle then add them to the vertices
    let inc = is_tri_strip ? 1 : 3; // triangle strips only go up by 1 index per triangle
    for (let i = 0; i < indices.length - 2; i += inc) {
        // Get the indices of the triangle and then get pointers its coords and normals
        let j = indices[i]*3, k = indices[i+1]*3, l = indices[i+2]*3;
        let A = coords.subarray(j, j+3), B = coords.subarray(k, k+3), C = coords.subarray(l, l+3);
        let NA = normals.subarray(j, j+3), NB = normals.subarray(k, k+3), NC = normals.subarray(l, l+3);

        // Compute normal for the A, B, C triangle and save to N_face (will need to use V and U as temporaries as well)
        vec3.cross(N_face, vec3.subtract(V, A, B), vec3.subtract(U, C, A));
        if (is_tri_strip && (i%2) !== 0) { // every other triangle in a strip is actually reversed
            vec3.negate(N_face, N_face);
        }

        // Add N_face to the 3 normals of the triangle: NA, NB, and NC
        vec3.add(NA, N_face, NA); // NA += N_face
        vec3.add(NB, N_face, NB);
        vec3.add(NC, N_face, NC);
    }

    // Normalize the normals
    for (let i = 0; i < normals.length; i+=3) {
        let N = normals.subarray(i, i+3);
        vec3.normalize(N, N);
    }

    // Return the computed normals
    return normals;
}
