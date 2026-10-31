/**
 * WebGL 2D Quad Warp & Projection Mapping Engine
 * Supports arbitrary 4-point quadrilaterals with subdivided mesh for distortion-free warping.
 */
class WarpEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: true, preserveDrawingBuffer: true }) ||
              canvas.getContext('experimental-webgl');
    if (!this.gl) {
      alert('WebGL не поддерживается в вашем браузере!');
      throw new Error('WebGL not supported');
    }

    this.GRID_STEPS = 20; // 20x20 grid subdivision for smooth perspective
    this.textures = new Map(); // id -> WebGLTexture
    this.initShaders();
    this.initMeshBuffers();
  }

  initShaders() {
    const gl = this.gl;
    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      uniform vec2 u_resolution;
      varying vec2 v_texCoord;

      void main() {
        // Convert from pixel space [0, resolution] to clip space [-1, 1]
        vec2 zeroToOne = a_position / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        // Invert Y so 0 is at top
        gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform sampler2D u_image;
      uniform float u_opacity;
      uniform float u_brightness;
      uniform float u_contrast;
      uniform int u_flipH;
      uniform int u_flipV;
      varying vec2 v_texCoord;

      void main() {
        vec2 uv = v_texCoord;
        if (u_flipH == 1) uv.x = 1.0 - uv.x;
        if (u_flipV == 1) uv.y = 1.0 - uv.y;

        vec4 color = texture2D(u_image, uv);

        // Apply brightness
        color.rgb += u_brightness;

        // Apply contrast
        color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

        // Apply opacity
        color.a *= u_opacity;

        gl_FragColor = color;
      }
    `;

    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(program));
      return;
    }

    this.program = program;
    this.attribs = {
      position: gl.getAttribLocation(program, 'a_position'),
      texCoord: gl.getAttribLocation(program, 'a_texCoord')
    };
    this.uniforms = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      image: gl.getUniformLocation(program, 'u_image'),
      opacity: gl.getUniformLocation(program, 'u_opacity'),
      brightness: gl.getUniformLocation(program, 'u_brightness'),
      contrast: gl.getUniformLocation(program, 'u_contrast'),
      flipH: gl.getUniformLocation(program, 'u_flipH'),
      flipV: gl.getUniformLocation(program, 'u_flipV')
    };
  }

  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  initMeshBuffers() {
    const gl = this.gl;
    const steps = this.GRID_STEPS;
    const numVertices = (steps + 1) * (steps + 1);

    // Dynamic position buffer (updated per quad)
    this.posBuffer = gl.createBuffer();
    this.posData = new Float32Array(numVertices * 2);

    // Static UV buffer
    const uvData = new Float32Array(numVertices * 2);
    let uvIdx = 0;
    for (let j = 0; j <= steps; j++) {
      const v = j / steps;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        uvData[uvIdx++] = u;
        uvData[uvIdx++] = v;
      }
    }
    this.uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uvData, gl.STATIC_DRAW);

    // Index buffer for grid triangles
    const indices = [];
    for (let j = 0; j < steps; j++) {
      for (let i = 0; i < steps; i++) {
        const p0 = j * (steps + 1) + i;
        const p1 = p0 + 1;
        const p2 = (j + 1) * (steps + 1) + i;
        const p3 = p2 + 1;

        // Two triangles per cell: (p0, p1, p2) and (p1, p3, p2)
        indices.push(p0, p1, p2);
        indices.push(p1, p3, p2);
      }
    }
    this.indexCount = indices.length;
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  }

  updateMeshPositions(corners) {
    // corners: [TL, TR, BR, BL] -> each is {x, y}
    const [p0, p1, p2, p3] = corners;
    const steps = this.GRID_STEPS;
    let idx = 0;

    for (let j = 0; j <= steps; j++) {
      const v = j / steps;
      const invV = 1.0 - v;

      // Top edge point at u
      // Bottom edge point at u
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const invU = 1.0 - u;

        // Bilinear interpolation across 4 corner points
        const x = invU * invV * p0.x +
                  u    * invV * p1.x +
                  u    * v    * p2.x +
                  invU * v    * p3.x;

        const y = invU * invV * p0.y +
                  u    * invV * p1.y +
                  u    * v    * p2.y +
                  invU * v    * p3.y;

        this.posData[idx++] = x;
        this.posData[idx++] = y;
      }
    }

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.posData, gl.DYNAMIC_DRAW);
  }

  getOrCreateTexture(id) {
    if (this.textures.has(id)) {
      return this.textures.get(id);
    }
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.textures.set(id, tex);
    return tex;
  }

  uploadTextureSource(id, sourceElement) {
    if (!sourceElement) return;
    const gl = this.gl;
    const tex = this.getOrCreateTexture(id);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceElement);
    } catch (e) {
      // Ignore if video/source is not ready yet
    }
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  render(surfaces, sourcesMap) {
    const gl = this.gl;
    this.resize(this.canvas.clientWidth, this.canvas.clientHeight);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);

    for (const surface of surfaces) {
      if (!surface.enabled) continue;

      // Blend mode
      if (surface.blendMode === 'add') {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      } else if (surface.blendMode === 'screen') {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
      } else {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }

      // Update texture if source is provided
      const source = sourcesMap.get(surface.id);
      if (source) {
        this.uploadTextureSource(surface.id, source);
      }

      const tex = this.getOrCreateTexture(surface.id);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(this.uniforms.image, 0);

      // Uniforms
      gl.uniform1f(this.uniforms.opacity, surface.opacity !== undefined ? surface.opacity : 1.0);
      gl.uniform1f(this.uniforms.brightness, surface.brightness || 0.0);
      gl.uniform1f(this.uniforms.contrast, surface.contrast !== undefined ? surface.contrast : 1.0);
      gl.uniform1i(this.uniforms.flipH, surface.flipH ? 1 : 0);
      gl.uniform1i(this.uniforms.flipV, surface.flipV ? 1 : 0);

      // Compute warped mesh points
      this.updateMeshPositions(surface.corners);

      // Bind position buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
      gl.enableVertexAttribArray(this.attribs.position);
      gl.vertexAttribPointer(this.attribs.position, 2, gl.FLOAT, false, 0, 0);

      // Bind UV buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
      gl.enableVertexAttribArray(this.attribs.texCoord);
      gl.vertexAttribPointer(this.attribs.texCoord, 2, gl.FLOAT, false, 0, 0);

      // Draw mesh
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    }
  }

  deleteTexture(id) {
    if (this.textures.has(id)) {
      this.gl.deleteTexture(this.textures.get(id));
      this.textures.delete(id);
    }
  }
}

window.WarpEngine = WarpEngine;
