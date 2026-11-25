// ALIFE 2.0 — WebGL2 body renderer.
//
// Same method as the CPU renderer in alife2-render.js (capsule distance field,
// exact union inside a chain, smooth union between chains, thickness as a
// height field), evaluated per pixel on the GPU in two passes:
//   1. field  : distance, local radius, thickness, body-fixed coordinates, tissue amounts, muscle activity
//   2. shade  : organs drawn in body coordinates under a lit translucent skin
// Organs are not sprites: the gut is a tube along the axis, muscle is striated
// fibre along the body wall that brightens on the contracting side, gonad and
// stores are cells, the nerve is a cord. Each appears where, and as much as,
// the tissue genes put it.
// One context is shared by every body on the page; each body is drawn into a
// corner of it (supersampled when small) and copied out.
// The CPU renderer remains the reference for the skin and the fallback.
(function (G) {
  'use strict';
  const A = G.ALIFE2 = G.ALIFE2 || {};
  const MAXS = 192, ROWS = 5;
  const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
  const FIELD = `#version 300 es
precision highp float;
uniform sampler2D uSeg; uniform int uN; uniform vec2 uRes;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1; layout(location=2) out vec4 o2; layout(location=3) out vec4 o3;
void merge(inout float S, inout float R, inout float Z, inout vec4 T, inout vec4 Q, inout vec4 P, float gs, float gr, float gz, vec4 gt, vec4 gq, vec4 gp){
  if (gs > 1e8) return;
  if (S > 1e8) { S = gs; R = gr; Z = gz; T = gt; Q = gq; P = gp; return; }
  float k = 0.55 * min(R, gr) + 1.2, m = clamp(0.5 + 0.5 * (gs - S) / k, 0., 1.);
  S = mix(gs, S, m) - k * m * (1. - m); R = mix(gr, R, m); Z = mix(gz, Z, m);
  T = vec4(mix(gt.xy, T.xy, m), m < 0.5 ? gt.zw : T.zw); Q = mix(gq, Q, m); P = mix(gp, P, m);
}
void main(){
  vec2 q = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float S = 1e9, R = 1., Z = 1.; vec4 T = vec4(0.), Q = vec4(0.), P = vec4(0.);
  float gs = 1e9, gr = 1., gz = 1., cur = -1.; vec4 gt = vec4(0.), gq = vec4(0.), gp = vec4(0.);
  for (int i = 0; i < ${MAXS}; i++) {
    if (i >= uN) break;
    vec4 a = texelFetch(uSeg, ivec2(i, 0), 0), b = texelFetch(uSeg, ivec2(i, 1), 0), c = texelFetch(uSeg, ivec2(i, 2), 0);
    if (c.z != cur) { merge(S, R, Z, T, Q, P, gs, gr, gz, gt, gq, gp); cur = c.z; gs = 1e9; }
    vec2 e = a.zw - a.xy, d = q - a.xy; float L2 = max(dot(e, e), 1e-9), L = sqrt(L2), tr = dot(d, e) / L2, t = clamp(tr, 0., 1.);
    float r = mix(b.x, b.y, t), s = length(d - t * e) - r;
    if (s < gs) { gs = s; gr = r; gz = mix(b.z, b.w, t); gt = vec4(c.x, c.y, c.w + tr * L, (d.x * e.y - d.y * e.x) / L); gq = texelFetch(uSeg, ivec2(i, 3), 0); gp = texelFetch(uSeg, ivec2(i, 4), 0); }
  }
  merge(S, R, Z, T, Q, P, gs, gr, gz, gt, gq, gp);
  float u = clamp(-S / R, 0., 1.);
  o0 = vec4(S, R, Z, S > 0.5 ? 0. : Z * sqrt(u * (2. - u)));
  o1 = T; o2 = Q; o3 = P;
}`;
  const SHADE = `#version 300 es
precision highp float;
uniform sampler2D t0, t1, t2, t3; uniform vec3 uBody, uRim, uArm, uDeep; uniform float uOrgans;
out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 x){ vec2 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
// cells: distance to the nearest of a jittered lattice of points, and that cell's random value
vec2 cells(vec2 x){ vec2 i = floor(x), f = fract(x); float d = 9., id = 0.;
  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) { vec2 g = vec2(float(a), float(b)), o = vec2(hash(i + g), hash(i + g + 7.3)); float r = length(g + o - f); if (r < d) { d = r; id = hash(i + g + 3.1); } }
  return vec2(d, id); }
float Hh(ivec2 c){ return texelFetch(t0, c, 0).w; }
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 f = texelFetch(t0, c, 0); float s = f.x;
  if (s > 0.5) { o = vec4(0.); return; }
  vec4 T = texelFetch(t1, c, 0), Q = texelFetch(t2, c, 0), P = texelFetch(t3, c, 0);
  float a = T.x, k = T.y, U = T.z, V = T.w, R = max(f.y, 0.5), Z = f.z, H = f.w;
  float cov = clamp(0.5 - s, 0., 1.);
  float nx = (Hh(c + ivec2(-1, 0)) - Hh(c + ivec2(1, 0))) * 0.3 + (Hh(c + ivec2(-2, 0)) - Hh(c + ivec2(2, 0))) * 0.1;
  float ny = (Hh(c + ivec2(0, 1)) - Hh(c + ivec2(0, -1))) * 0.3 + (Hh(c + ivec2(0, 2)) - Hh(c + ivec2(0, -2))) * 0.1;
  vec3 n = normalize(vec3(nx, ny, 1.));
  vec3 L = normalize(vec3(-0.42, -0.58, 0.70)), L2 = normalize(vec3(0.6, 0.5, 0.35)), Hv = normalize(L + vec3(0, 0, 1));
  float diff = max(0., dot(n, L)), fill = max(0., dot(n, L2)), back = max(0., -dot(n.xy, L.xy) * 0.6 + n.z * 0.2);
  float sp = pow(max(0., dot(n, Hv)), 30. + 60. * a) * (0.6 + 0.7 * a) + pow(max(0., dot(n, normalize(L2 + vec3(0, 0, 1)))), 40.) * 0.25;
  float rim = pow(1. - n.z, 2.2), thick = H / (Z + 1e-6), e = -s;

  // ---- organs, in body coordinates: v across the body (-1..1), w along it in body widths
  float v = V / R, av = abs(v), w = U / R;
  vec3 org = vec3(0.); float oa = 0.;
  if (uOrgans > 0.5) {
    float inside = smoothstep(0.05, 0.45, thick);
    // muscle: fibres along the body wall with cross striation; the contracting side is brighter and thicker
    float on = max(0., sign(v) * P.x), band = smoothstep(0.40, 0.52, av) * (1. - smoothstep(0.80 + 0.06 * on, 0.93, av));
    float fibre = 0.55 + 0.45 * sin(av * 52.), stria = 0.72 + 0.28 * sin(w * 9.5 * (1. + 0.35 * on));
    float ma = clamp(Q.y * 1.6, 0., 1.) * band * fibre * stria * (0.30 + 0.70 * on);
    org = vec3(0.98, 0.34, 0.32) * (0.55 + 0.75 * on); oa = ma * 0.85;
    // gonad and stores: cells packed between gut and wall
    vec2 gc = cells(vec2(U, V) / max(2.2, R * 0.16)); float mid = smoothstep(0.16, 0.30, av) * (1. - smoothstep(0.50, 0.62, av));
    float go = step(1. - clamp(Q.w * 1.3, 0., 1.), gc.y) * (1. - smoothstep(0.30, 0.42, gc.x)) * mid;
    org = mix(org, vec3(1.0, 0.60, 0.80) * (1.15 - gc.x), go); oa = max(oa, go * 0.8);
    vec2 sc = cells(vec2(U, V) / max(2.6, R * 0.20) + 17.); float st = step(1. - clamp(P.y * 0.9, 0., 1.), sc.y) * (1. - smoothstep(0.26, 0.36, sc.x)) * (1. - smoothstep(0.62, 0.75, av));
    org = mix(org, vec3(1.0, 0.92, 0.62) * (1.2 - sc.x), st * 0.8); oa = max(oa, st * 0.7);
    // gut: a tube along the axis, pinched into chambers, with a wall and granular contents
    float gw = clamp(Q.x, 0., 1.) * 0.44 * (0.80 + 0.22 * sin(w * 2.3)), gz = (1. - smoothstep(gw * 0.82, gw, av)) * step(0.03, Q.x);
    float wall = smoothstep(gw * 0.55, gw * 0.95, av), grn = cells(vec2(U, V) / max(1.6, R * 0.10) + 31.).x;
    vec3 gcol = mix(vec3(1.0, 0.62, 0.22), vec3(0.93, 0.80, 0.34), wall) * (0.70 + 0.5 * noise(vec2(U, V) * 0.5)) * (0.75 + 0.45 * smoothstep(0.1, 0.5, grn));
    org = mix(org, gcol, gz); oa = max(oa, gz * 0.9);
    // nerve: a cord along the axis with a ganglion in every stretch of body, a brain where there is much
    float cord = 1. - smoothstep(0.035, 0.075, abs(v - 0.02)), gang = (1. - smoothstep(0.08, 0.16, length(vec2(fract(w * 0.9) - 0.5, v * 1.3))));
    float brain = (1. - smoothstep(0.25, 0.42, av)) * smoothstep(0.55, 0.8, Q.z) * (0.6 + 0.4 * noise(vec2(U, V) * 0.7));
    float ne = clamp(Q.z * 1.8, 0., 1.) * max(cord, gang * 0.9); ne = max(ne, brain * 0.8);
    org = mix(org, vec3(0.76, 0.56, 1.0) * (0.9 + 0.5 * gang), ne); oa = max(oa, ne * 0.85);
    oa *= inside;
  }

  // ---- skin
  float gr = noise(vec2(U, V) * 0.42), mid2 = noise(vec2(U, V) * 0.9 + 3.), fine = noise(vec2(U, V) * 1.9 + 9.);
  float ring = 0.5 + 0.5 * sin(U * 6.283 / max(2.6, R * 0.16));
  float tex = 0.70 + 0.34 * gr + 0.14 * mid2 + 0.12 * fine + (0.10 + 0.14 * a) * ring * thick;
  float small = R < 9. ? 0.45 + 0.06 * R : 1.;
  float cut = small * exp(-(e - 0.9) * (e - 0.9) * 0.9), gap = small * exp(-(e - 3.2) * (e - 3.2) * 0.35);
  float speck = smoothstep(0.80, 0.95, fine) * thick * 0.5;
  vec3 film = 0.5 + 0.5 * cos(6.283 * (vec3(0., 0.33, 0.67) + n.z * 1.4 + U * 0.004 + gr * 0.25));
  vec3 base = mix(uBody, uArm, a);
  float edge = rim * 0.6 + cut * 0.4 + speck;
  vec3 col = base * (0.20 + 0.58 * diff + 0.12 * fill) * tex + uDeep * 0.20 * back + uRim * edge + film * rim * (0.22 + 0.25 * a) + sp;
  float al = (0.05 + 0.30 * k + 0.40 * a) * (0.35 + 0.65 * thick) * (0.65 + 0.7 * gr) * (1. - 0.45 * gap) + rim * 0.55 + cut * 0.42 + sp + speck * 0.6;
  al = min(al, 0.96) * cov;
  // organs are lit a little by the same light, and seen through the skin
  vec3 ocol = org * (0.72 + 0.38 * diff); float oal = oa * cov;
  o = vec4(col * al + ocol * oal * (1. - al), al + oal * (1. - al));
}`;

  class GpuSkin {
    constructor() {
      this.ok = false; this.w = 0; this.h = 0; this.region = [0, 0, 0, 0];
      try {
        this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(16, 16) : document.createElement('canvas');
        const gl = this.gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
        if (!gl || !gl.getExtension('EXT_color_buffer_float')) return;
        const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
        this.pField = prog(FIELD); this.pShade = prog(SHADE);
        const loc = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
        this.uF = loc(this.pField, ['uSeg', 'uN', 'uRes']); this.uS = loc(this.pShade, ['t0', 't1', 't2', 't3', 'uBody', 'uRim', 'uArm', 'uDeep', 'uOrgans']);
        const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        this.seg = gl.createTexture(); this.data = new Float32Array(MAXS * ROWS * 4);
        gl.bindTexture(gl.TEXTURE_2D, this.seg); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAXS, ROWS, 0, gl.RGBA, gl.FLOAT, this.data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        this.fbo = gl.createFramebuffer(); this.tex = [0, 1, 2, 3].map(() => gl.createTexture());
        this.ok = true;
      } catch (e) { this.error = String(e.message || e); this.ok = false; }
    }
    // the working surface only ever grows; each body uses its bottom-left corner
    reserve(w, h) {
      if (w <= this.w && h <= this.h) return;
      const gl = this.gl; this.w = Math.max(this.w, w, 256); this.h = Math.max(this.h, h, 256); this.canvas.width = this.w; this.canvas.height = this.h;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      this.tex.forEach((t, i) => {
        gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.w, this.h, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      });
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) this.ok = false;
    }
    // groups: arrays of pixel-space segments in draw order (from Renderer.layout).
    // Returns the canvas; the picture is in this.region = [sx, sy, w, h] of it.
    render(groups, w, h, colors, organs) {
      const gl = this.gl, d = this.data; this.reserve(w, h); if (!this.ok) return null;
      let n = 0;
      for (const grp of groups) for (const p of grp) {
        if (n >= MAXS) break;
        d.set([p.ax, p.ay, p.bx, p.by], n * 4); d.set([p.r0, p.r1, p.z0, p.z1], (MAXS + n) * 4); d.set([p.armor, p.skin, p.group, p.u0], (2 * MAXS + n) * 4);
        d.set([p.gut, p.muscle, p.nerve, p.gonad], (3 * MAXS + n) * 4); d.set([p.act, p.store, 0, 0], (4 * MAXS + n) * 4); n++;
      }
      gl.viewport(0, 0, w, h); gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, w, h); gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.seg); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAXS, ROWS, gl.RGBA, gl.FLOAT, d);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.useProgram(this.pField);
      gl.uniform1i(this.uF.uSeg, 0); gl.uniform1i(this.uF.uN, n); gl.uniform2f(this.uF.uRes, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(this.pShade);
      this.tex.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(this.uS['t' + i], i); });
      gl.uniform3fv(this.uS.uBody, colors.body); gl.uniform3fv(this.uS.uRim, colors.rim); gl.uniform3fv(this.uS.uArm, colors.arm); gl.uniform3fv(this.uS.uDeep, colors.deep); gl.uniform1f(this.uS.uOrgans, organs ? 1 : 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.region = [0, this.h - h, w, h];
      return this.canvas;
    }
  }
  let one = null;
  const shared = () => one || (one = new GpuSkin());

  A.gpu = { GpuSkin, shared, MAXS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
