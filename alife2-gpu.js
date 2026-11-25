// ALIFE 2.0 — WebGL2 skin renderer.
//
// Same method as the CPU renderer in alife2-render.js (capsule distance field,
// exact union inside a chain, smooth union between chains, thickness as a
// height field), evaluated per pixel on the GPU in two passes:
//   1. field  : distance, local radius, thickness, tissue, body-fixed coords
//   2. shade  : normals from the height field, translucent lit skin
// The CPU renderer remains the reference and the fallback.
(function (G) {
  'use strict';
  const A = G.ALIFE2 = G.ALIFE2 || {};
  const MAXS = 192;
  const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
  const FIELD = `#version 300 es
precision highp float;
uniform sampler2D uSeg; uniform int uN; uniform vec2 uRes;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
void merge(inout float S, inout float R, inout float Z, inout vec4 T, float gs, float gr, float gz, vec4 gt){
  if (gs > 1e8) return;
  if (S > 1e8) { S = gs; R = gr; Z = gz; T = gt; return; }
  float k = 0.55 * min(R, gr) + 1.2, m = clamp(0.5 + 0.5 * (gs - S) / k, 0., 1.);
  S = mix(gs, S, m) - k * m * (1. - m); R = mix(gr, R, m); Z = mix(gz, Z, m);
  T = vec4(mix(gt.xy, T.xy, m), m < 0.5 ? gt.zw : T.zw);
}
void main(){
  vec2 q = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float S = 1e9, R = 1., Z = 1.; vec4 T = vec4(0.);
  float gs = 1e9, gr = 1., gz = 1., cur = -1.; vec4 gt = vec4(0.);
  for (int i = 0; i < ${MAXS}; i++) {
    if (i >= uN) break;
    vec4 a = texelFetch(uSeg, ivec2(i, 0), 0), b = texelFetch(uSeg, ivec2(i, 1), 0), c = texelFetch(uSeg, ivec2(i, 2), 0);
    if (c.z != cur) { merge(S, R, Z, T, gs, gr, gz, gt); cur = c.z; gs = 1e9; }
    vec2 e = a.zw - a.xy, d = q - a.xy; float L2 = max(dot(e, e), 1e-9), L = sqrt(L2), tr = dot(d, e) / L2, t = clamp(tr, 0., 1.);
    float r = mix(b.x, b.y, t), s = length(d - t * e) - r;
    if (s < gs) { gs = s; gr = r; gz = mix(b.z, b.w, t); gt = vec4(c.x, c.y, c.w + tr * L, (d.x * e.y - d.y * e.x) / L); }
  }
  merge(S, R, Z, T, gs, gr, gz, gt);
  float u = clamp(-S / R, 0., 1.);
  o0 = vec4(S, R, Z, S > 0.5 ? 0. : Z * sqrt(u * (2. - u)));
  o1 = T;
}`;
  const SHADE = `#version 300 es
precision highp float;
uniform sampler2D t0, t1; uniform vec3 uBody, uRim, uArm, uDeep;
out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 x){ vec2 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float Hh(ivec2 c){ return texelFetch(t0, c, 0).w; }
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 f = texelFetch(t0, c, 0); float s = f.x;
  if (s > 0.5) { o = vec4(0.); return; }
  vec4 T = texelFetch(t1, c, 0); float a = T.x, k = T.y, U = T.z, V = T.w, R = f.y, Z = f.z, H = f.w;
  float cov = clamp(0.5 - s, 0., 1.);
  // normal from the thickness field (canvas y is down, GL y is up); two scales to keep it smooth
  float nx = (Hh(c + ivec2(-1, 0)) - Hh(c + ivec2(1, 0))) * 0.3 + (Hh(c + ivec2(-2, 0)) - Hh(c + ivec2(2, 0))) * 0.1;
  float ny = (Hh(c + ivec2(0, 1)) - Hh(c + ivec2(0, -1))) * 0.3 + (Hh(c + ivec2(0, 2)) - Hh(c + ivec2(0, -2))) * 0.1;
  vec3 n = normalize(vec3(nx, ny, 1.));
  vec3 L = normalize(vec3(-0.42, -0.58, 0.70)), L2 = normalize(vec3(0.6, 0.5, 0.35)), Hv = normalize(L + vec3(0, 0, 1));
  float diff = max(0., dot(n, L)), fill = max(0., dot(n, L2)), back = max(0., -dot(n.xy, L.xy) * 0.6 + n.z * 0.2);
  float sp = pow(max(0., dot(n, Hv)), 30. + 60. * a) * (0.6 + 0.7 * a) + pow(max(0., dot(n, normalize(L2 + vec3(0, 0, 1)))), 40.) * 0.25;
  float rim = pow(1. - n.z, 2.2), thick = H / (Z + 1e-6), e = -s;
  // body-fixed texture: granules at three scales and fine rings around the body
  float gr = noise(vec2(U, V) * 0.42), mid = noise(vec2(U, V) * 0.9 + 3.), fine = noise(vec2(U, V) * 1.9 + 9.);
  float ring = 0.5 + 0.5 * sin(U * 6.283 / max(2.6, R * 0.16));
  float tex = 0.70 + 0.34 * gr + 0.14 * mid + 0.12 * fine + (0.10 + 0.14 * a) * ring * thick;
  float cut = exp(-(e - 0.9) * (e - 0.9) * 0.9), gap = exp(-(e - 3.2) * (e - 3.2) * 0.35);
  float speck = smoothstep(0.80, 0.95, fine) * thick * 0.5;
  // thin-film sheen on the cuticle, strongest at grazing angles
  vec3 film = 0.5 + 0.5 * cos(6.283 * (vec3(0., 0.33, 0.67) + n.z * 1.4 + U * 0.004 + gr * 0.25));
  vec3 base = mix(uBody, uArm, a);
  float edge = rim * 0.6 + cut * 0.4 + speck;
  vec3 col = base * (0.20 + 0.58 * diff + 0.12 * fill) * tex + uDeep * 0.20 * back + uRim * edge + film * rim * (0.22 + 0.25 * a) + sp;
  float al = (0.05 + 0.34 * k + 0.40 * a) * (0.35 + 0.65 * thick) * (0.65 + 0.7 * gr) * (1. - 0.45 * gap) + rim * 0.55 + cut * 0.42 + sp + speck * 0.6;
  al = min(al, 0.96) * cov;
  o = vec4(col * al, al);
}`;

  class GpuSkin {
    constructor() {
      this.ok = false;
      try {
        this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(16, 16) : document.createElement('canvas');
        const gl = this.gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
        if (!gl || !gl.getExtension('EXT_color_buffer_float')) return;
        const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
        this.pField = prog(FIELD); this.pShade = prog(SHADE);
        const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        this.seg = gl.createTexture(); this.data = new Float32Array(MAXS * 3 * 4);
        gl.bindTexture(gl.TEXTURE_2D, this.seg); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAXS, 3, 0, gl.RGBA, gl.FLOAT, this.data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        this.fbo = gl.createFramebuffer(); this.tex = [gl.createTexture(), gl.createTexture()]; this.w = 0; this.h = 0;
        this.ok = true;
      } catch (e) { this.error = String(e.message || e); this.ok = false; }
    }
    resize(w, h) {
      if (w === this.w && h === this.h) return;
      const gl = this.gl; this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      this.tex.forEach((t, i) => {
        gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      });
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) this.ok = false;
    }
    // groups: arrays of pixel-space segments in draw order (from Renderer.layout). Returns the skin canvas.
    render(groups, w, h, colors) {
      const gl = this.gl, d = this.data; this.resize(w, h); if (!this.ok) return null;
      let n = 0;
      for (const grp of groups) for (const p of grp) {
        if (n >= MAXS) break;
        d.set([p.ax, p.ay, p.bx, p.by], n * 4); d.set([p.r0, p.r1, p.z0, p.z1], (MAXS + n) * 4); d.set([p.armor, p.skin, p.group, p.u0], (2 * MAXS + n) * 4); n++;
      }
      gl.viewport(0, 0, w, h); gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.seg); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAXS, 3, gl.RGBA, gl.FLOAT, d);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.useProgram(this.pField);
      gl.uniform1i(gl.getUniformLocation(this.pField, 'uSeg'), 0); gl.uniform1i(gl.getUniformLocation(this.pField, 'uN'), n); gl.uniform2f(gl.getUniformLocation(this.pField, 'uRes'), w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(this.pShade);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[0]); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex[1]);
      gl.uniform1i(gl.getUniformLocation(this.pShade, 't0'), 0); gl.uniform1i(gl.getUniformLocation(this.pShade, 't1'), 1);
      for (const k of ['Body', 'Rim', 'Arm', 'Deep']) gl.uniform3fv(gl.getUniformLocation(this.pShade, 'u' + k), colors[k.toLowerCase()]);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
      return this.canvas;
    }
  }

  A.gpu = { GpuSkin, MAXS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
