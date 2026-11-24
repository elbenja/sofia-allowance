// The goldendoodle from html/goldendoodle-avatar.html, moved into the app: the same sculpted, plush dog,
// framed head-and-shoulders, without the demo's buttons or orbit camera.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// host: the element the canvas fills. bg: the colour behind the dog (the canvas is opaque).
// onReady: called once the first frames are drawn.
export function mountDog(host, bg, onReady) {
// ---------- palette (from the character sheet) ----------
const C = {
  bg,
  fur: '#d87430', furTip: '#ffb97c', lid: '#d2853f',            // ginger plush: darker at the root, lighter at the tip
  nose: '#4a2513', eye: '#0d0b0c', mouth: '#5b2a1a', blush: '#ee7f6c',
};
const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.3 : 1;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = THREE.MathUtils.clamp;
const smoothstep = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AXIS_X = V3(1, 0, 0), AXIS_Y = V3(0, 1, 0), AXIS_Z = V3(0, 0, 1);

// ---------- renderer / scene ----------
// The drawing buffer is opaque. The plush writes partial alpha for its soft strand edges (alpha to coverage), and in a
// buffer that keeps alpha the page behind would shine through those pixels.
const glCanvas = document.createElement('canvas');
const gl = glCanvas.getContext('webgl2', { alpha: false, antialias: true });
if (!gl) throw new Error('WebGL2 is not available');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, context: gl, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(host.clientWidth, host.clientHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
host.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
scene.environmentIntensity = 0.4;

// The bottom edge of the host sits on the card, so the dog reads as peeking over it.
// The host's CSS sets the framing: --dog-ppu is the dog's size (pixels per world unit) and
// --dog-raise lifts the dog that many pixels, showing more of its body above the card.
// Whatever is left above the head is headroom for a jump.
const CAM_D = 9, BOTTOM_Y = 0.75; // the world height at the bottom edge, before any raise
const camera = new THREE.PerspectiveCamera(20, 1, 1, 40);
function fit() {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  const css = getComputedStyle(host);
  const ppu = parseFloat(css.getPropertyValue('--dog-ppu')) || h / 3;
  const raise = parseFloat(css.getPropertyValue('--dog-raise')) || 0;
  const view = h / ppu, lookY = BOTTOM_Y - raise / ppu + view / 2;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(view / 2 / CAM_D));
  camera.aspect = w / h;
  camera.position.set(0.5, lookY + 0.35, CAM_D);
  camera.lookAt(0, lookY, 0);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
fit();
const resizer = new ResizeObserver(fit);
resizer.observe(host);

const KEY_DIR = V3(2.5, 5, 4.5).normalize();
const key = new THREE.DirectionalLight('#fff7ee', 2.1);
key.position.copy(KEY_DIR).multiplyScalar(10);
const fill = new THREE.DirectionalLight('#e6edff', 0.6);
fill.position.set(-4, 2, 3);
const back = new THREE.DirectionalLight('#ffffff', 0.7);
back.position.set(-1, 3, -5);
scene.add(key, fill, back, new THREE.HemisphereLight('#ffffff', '#c3c6cc', 0.9));

// ---------- sculpting: every soft part is the zero surface of a distance field, so parts can melt into each other ----------
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
function ellipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz), k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 > 1e-6 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
// a rounded stick from a to b, its radius going from ra to rb
function capsule(x, y, z, ax, ay, az, bx, by, bz, ra, rb = ra) {
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const t = clamp(((x - ax) * ex + (y - ay) * ey + (z - az) * ez) / (ex * ex + ey * ey + ez * ez), 0, 1);
  return Math.hypot(x - ax - ex * t, y - ay - ey * t, z - az - ez * t) - lerp(ra, rb, t);
}
// a pillow: between a ball (p = 2) and a box (large p)
function superq(x, y, z, a, b, c, p) {
  const k = Math.pow(Math.pow(Math.abs(x / a), p) + Math.pow(Math.abs(y / b), p) + Math.pow(Math.abs(z / c), p), 1 / p);
  return (k - 1) * Math.min(a, b, c);
}
// a rounded elliptical disc: centre height y0, half height h, radii rx and rz, edge radius r
function barrel(x, y, z, y0, h, rx, rz, r) {
  const d2 = ellipsoid(x, 0, z, rx, 1, rz) + r, dy = Math.abs(y - y0) - h + r;
  return Math.hypot(Math.max(d2, 0), Math.max(dy, 0)) + Math.min(Math.max(d2, dy), 0) - r;
}
// Surface nets: one vertex in every grid cell the surface passes through, each then pulled onto the surface.
// `shade` is the field of everything nearby. Probing it bakes soft shadow into the vertex colours: how open the
// spot is (dark in folds and where parts touch) and how much light from `sky`, above and in front, reaches it.
// `paint(x, y, z)` can darken a spot more (1 = untouched). `extra.nap(x, y, z)` sets the fur length at a spot (1 = full)
// and `extra.band(x, y, z)` gives the coordinate that stripes are laid along; both are only used by the materials that ask.
const SKY = V3(0, 0.9, 0.436);
function sculpt(field, lo, hi, cell, shade = field, paint = null, sky = SKY, extra = {}) {
  const nx = Math.ceil((hi[0] - lo[0]) / cell) + 1, ny = Math.ceil((hi[1] - lo[1]) / cell) + 1, nz = Math.ceil((hi[2] - lo[2]) / cell) + 1;
  const at = (i, j, k) => i + nx * (j + ny * k);
  const val = new Float32Array(nx * ny * nz), vertOf = new Int32Array(nx * ny * nz).fill(-1), pos = [], idx = [];
  for (let k = 0, n = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    val[n++] = field(lo[0] + i * cell, lo[1] + j * cell, lo[2] + k * cell);

  const corner = new Float32Array(8); // corner c sits at (c & 1, c >> 1 & 1, c >> 2)
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    for (let c = 0; c < 8; c++) corner[c] = val[at(i + (c & 1), j + (c >> 1 & 1), k + (c >> 2))];
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      if ((corner[a] < 0) === (corner[b] < 0)) continue;
      const t = corner[a] / (corner[a] - corner[b]);
      sx += lerp(a & 1, b & 1, t); sy += lerp(a >> 1 & 1, b >> 1 & 1, t); sz += lerp(a >> 2, b >> 2, t); n++;
    }
    if (!n) continue;
    vertOf[at(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * cell, lo[1] + (j + sy / n) * cell, lo[2] + (k + sz / n) * cell);
  }
  // every grid edge the surface crosses is shared by four cells: join their vertices, facing outward
  const STEP = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = val[at(i, j, k)];
    for (let a = 0; a < 3; a++) {
      const v1 = val[at(i + STEP[a][0], j + STEP[a][1], k + STEP[a][2])];
      if ((v0 < 0) === (v1 < 0)) continue;
      const b = STEP[(a + 1) % 3], c = STEP[(a + 2) % 3];
      const q0 = vertOf[at(i, j, k)], q1 = vertOf[at(i - b[0], j - b[1], k - b[2])];
      const q2 = vertOf[at(i - b[0] - c[0], j - b[1] - c[1], k - b[2] - c[2])], q3 = vertOf[at(i - c[0], j - c[1], k - c[2])];
      if (v0 < 0) idx.push(q0, q1, q2, q0, q2, q3); else idx.push(q0, q2, q1, q0, q3, q2);
    }
  }

  const E = 0.012, count = pos.length / 3, nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const shadow = new Float32Array(count * 3), band = extra.band ? new Float32Array(count) : null;
  for (let v = 0; v < count; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = field(x + E, y, z) - field(x - E, y, z), gy = field(x, y + E, z) - field(x, y - E, z), gz = field(x, y, z + E) - field(x, y, z - E);
    const g2 = gx * gx + gy * gy + gz * gz || 1, s = -field(x, y, z) * 2 * E / g2, m = 1 / Math.sqrt(g2);
    x += gx * s; y += gy * s; z += gz * s; // one Newton step along the gradient
    gx *= m; gy *= m; gz *= m;
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    nor[v * 3] = gx; nor[v * 3 + 1] = gy; nor[v * 3 + 2] = gz;
    let open = 0, lit = 0;
    for (const [reach, weight] of [[0.06, 0.35], [0.14, 0.35], [0.28, 0.2], [0.5, 0.1]])
      open += weight * clamp(shade(x + gx * reach, y + gy * reach, z + gz * reach) / reach, 0, 1);
    open *= clamp(1 + shade(x, y, z) / 0.03, 0, 1); // buried inside another part: fully covered
    const facing = gx * sky.x + gy * sky.y + gz * sky.z; // surfaces turned away are already dark
    if (facing > 0.1) for (const [reach, weight] of [[0.15, 0.3], [0.4, 0.4], [0.8, 0.3]])
      lit += weight * clamp(shade(x + sky.x * reach, y + sky.y * reach, z + sky.z * reach) / (reach * facing), 0, 1);
    lit = lerp(1, lit, smoothstep(facing, 0.1, 0.4));
    col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = lerp(0.55, 1, lit) * lerp(0.45, 1, open * open) * (paint ? paint(x, y, z) : 1);
    shadow[v * 3] = open; shadow[v * 3 + 1] = lit; shadow[v * 3 + 2] = extra.nap ? extra.nap(x, y, z) : 1;
    if (band) band[v] = extra.band(x, y, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('shadow', new THREE.BufferAttribute(shadow, 3));
  if (band) g.setAttribute('band', new THREE.BufferAttribute(band, 1));
  g.setIndex(idx);
  return g;
}
// the same part for the other side of the body
function mirrored(geo) {
  const g = geo.clone(), p = g.attributes.position, n = g.attributes.normal, i = g.index.array;
  for (let v = 0; v < p.count; v++) { p.setX(v, -p.getX(v)); n.setX(v, -n.getX(v)); }
  for (let t = 0; t < i.length; t += 3) { const a = i[t]; i[t] = i[t + 1]; i[t + 1] = a; }
  return g;
}
// A rigid frame for a part that is sculpted in its own space: p = origin + R * local.
function frame(origin, euler) {
  const q = new THREE.Quaternion().setFromEuler(euler), m = new THREE.Matrix4().makeRotationFromQuaternion(q).elements, o = origin;
  return {
    origin, q,
    toLocal: (x, y, z) => { x -= o.x; y -= o.y; z -= o.z; return [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z]; },
    toWorld: (x, y, z) => [o.x + m[0] * x + m[4] * y + m[8] * z, o.y + m[1] * x + m[5] * y + m[9] * z, o.z + m[2] * x + m[6] * y + m[10] * z],
    dir: (x, y, z) => V3(m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z), // a world direction, seen from inside
    place: obj => { obj.position.copy(o); obj.quaternion.copy(q); return obj; },
  };
}
// ---------- plush ----------
// Shell texturing: the mesh is drawn in layers pushed out along the normal, and strands are cut out of each layer on a 3D grid.
// The whole dog is plush: head, ears, body, arms, feet and tail share one short, dense, velvety coat. Only the nose, eyes
// and mouth are smooth. Open the page with ?clay to see the bare sculpted volumes in a matte grey instead.
const CLAY = false;
const shared = { uTime: { value: 0 }, uKey: { value: KEY_DIR }, uBounce: { value: 0 } };

const plushVert = /* glsl */`
  uniform float uLayer, uLength, uGravity, uTime, uBounce, uCell, uCurl;
  uniform vec3 uAmb;   // light that reaches everything, extra from the sky above, extra from the key light
  uniform vec2 uFloor; // how dark a fold gets, and a spot the sky cannot see
  uniform vec3 uKey;
  attribute vec3 shadow; // baked: x = how open the spot is (0 deep in a fold), y = light from above that reaches it, z = strand length here
  varying vec3 vGrid, vObj;
  varying float vLight, vRim, vBack;
  // tilted grid, so strands never line up with the model's axes
  const mat3 TILT = mat3(.8, .36, -.48, -.6, .48, -.64, 0., .8, .6);
  void main() {
    float h = uLayer;
    float len = uLength * shadow.z * mix(0.3, 1.0, smoothstep(0.0, 0.55, shadow.x)); // pressed flat under whatever sits on it
    vec4 wp = modelMatrix * vec4(position + normal * len * h, 1.0);
    float k = h * h * len;
    wp.y -= k * (uGravity + uBounce);                 // the outer layers droop a little
    wp.x += k * 0.2 * sin(uTime * 1.7 + wp.y * 3.0);

    // strands curve a little along a slow field, which reads as soft tufts
    vec3 P = position + vec3(sin(position.y * 9. + position.z * 5.), sin(position.z * 8. + position.x * 7.), sin(position.x * 10. + position.y * 6.)) * h * h * uCell * uCurl;
    vGrid = TILT * P / uCell;
    vObj = position;

    vec3 N = normalize(mat3(modelMatrix) * normal);
    vec3 V = normalize(cameraPosition - wp.xyz);
    float wrap = max(dot(N, uKey) * 0.55 + 0.45, 0.0);
    float shade = mix(uFloor.y, 1.0, shadow.y) * mix(uFloor.x, 1.0, shadow.x * shadow.x);
    vLight = (uAmb.x + uAmb.z * wrap + uAmb.y * (N.y * 0.5 + 0.5)) * shade;
    float edge = 1.0 - max(dot(N, V), 0.0);
    vRim = pow(edge, 2.2);
    // back light: behind, above and a little to the viewer's left, from wherever it is seen
    vec2 c = normalize(cameraPosition.xz);
    vec3 B = normalize(vec3(-c.x - 0.4 * c.y, 0.8, -c.y + 0.4 * c.x));
    vBack = pow(edge, 1.5) * smoothstep(-0.2, 0.6, dot(N, B));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const plushFrag = /* glsl */`
  uniform float uLayer, uBack, uRimK, uThick, uTaper, uRoot;
  uniform vec3 uColor, uTip, uShade, uBlushC;
  uniform vec4 uBlush;       // x (mirrored), y, radius, amount: on the front only
  uniform vec4 uCrease;      // a soft vertical crease down the middle of the front: half width, from y, to y, amount
  varying vec3 vGrid, vObj;
  varying float vLight, vRim, vBack;

  vec3 hash33(vec3 p) {
    p = fract(p * vec3(.1031, .1030, .0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }

  void main() {
    float h = uLayer;
    vec3 rnd = hash33(floor(vGrid) + 40.0);
    float sl = mix(0.5, 1.0, rnd.x);
    float a = 1.0;
    if (h > 0.0) {
      if (h > sl) discard;
      float d = length(fract(vGrid) - 0.5 - (rnd - 0.5) * 0.55);
      float th = uThick * (1.0 - pow(h / sl, uTaper));
      float aa = min(fwidth(d), 0.35);
      a = 1.0 - smoothstep(th - aa, th + aa, d);
      if (a < 0.02) discard;
    }

    vec3 base = uColor, tip = uTip;
    if (uBlush.w > 0.0 && vObj.z > 0.0) {
      float d = length(vec2(abs(vObj.x) - uBlush.x, (vObj.y - uBlush.y) * 1.25));
      float k = uBlush.w * (1.0 - smoothstep(uBlush.z * 0.2, uBlush.z, d));
      base = mix(base, uBlushC, k); tip = mix(tip, mix(uBlushC, vec3(1.0), 0.3), k);
    }

    float hn = clamp(h / sl, 0.0, 1.0);
    vec3 col = mix(base, tip, smoothstep(0.0, 0.8, hn)) * mix(0.94, 1.06, rnd.y);
    // roots sit in the shade of the strands around them; tips catch the rim and the light from behind
    float light = vLight * mix(uRoot, 1.0, hn * (2.0 - hn));
    if (uCrease.w > 0.0 && vObj.z > 0.0) {
      float k = (1.0 - smoothstep(0.0, uCrease.x, abs(vObj.x))) * smoothstep(uCrease.y - 0.03, uCrease.y + 0.05, vObj.y) * (1.0 - smoothstep(uCrease.z - 0.05, uCrease.z + 0.03, vObj.y));
      light *= 1.0 - uCrease.w * k;
    }
    vec3 glow = mix(tip, vec3(1.0, 0.96, 0.88), 0.5) * (0.3 + 0.7 * hn);
    vec3 lit = col * pow(vec3(light), uShade) + (uRimK * vRim + uBack * vBack) * glow;

    gl_FragColor = vec4(lit, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const furGroups = [];
function plush(geo, o) {
  const group = new THREE.Group();
  const own = {
    uLength: { value: o.length }, uCell: { value: o.cell ?? 0.0135 },
    uColor: { value: new THREE.Color(o.color ?? C.fur) }, uTip: { value: new THREE.Color(o.tip ?? C.furTip) },
    uGravity: { value: o.gravity ?? 0.25 }, uCurl: { value: o.curl ?? 2.6 },
    uShade: { value: o.shade ?? V3(0.82, 1.0, 1.22) }, // red falls off slowest in shadow, so folds stay warm
    uAmb: { value: o.amb ?? V3(0.55, 0.62, 0.12) }, uFloor: { value: o.floor ?? new THREE.Vector2(0.56, 0.5) },
    uBack: { value: o.back ?? 0.26 }, uRimK: { value: o.rim ?? 0.07 },
    uThick: { value: o.thick ?? 0.95 }, uTaper: { value: o.taper ?? 2.6 }, uRoot: { value: o.root ?? 0.8 },
    uBlush: { value: o.blush ?? new THREE.Vector4(0, 0, 1, 0) }, uBlushC: { value: new THREE.Color(C.blush) },
    uCrease: { value: o.crease ?? new THREE.Vector4(0, 0, 0, 0) },
  };
  group.userData.uniforms = own;
  if (CLAY) { group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#c9c5c0', roughness: 0.95, vertexColors: true }))); return group; }
  for (let i = 0; i < o.layers; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, ...own, uLayer: { value: i / (o.layers - 1) } },
      vertexShader: plushVert, fragmentShader: plushFrag, alphaToCoverage: true,
    });
    group.add(new THREE.Mesh(geo, mat));
  }
  furGroups.push(group);
  return group;
}
// ---------- rig: root > hips > chest (the body, with the arms, the tail and the head on it). The feet stand on the floor on their own ----------
// Everything is modelled in standing-pose coordinates: y up from the floor, z toward the viewer, the dog's left at +x.
// A joint pivots at a point given in those coordinates, and whatever is added to its `.bind` is authored in them too.
const rig = new THREE.Group();
scene.add(rig);
function joint(parent, pivot) {
  const g = new THREE.Group();
  g.position.copy(pivot);
  (parent.bind ?? parent).add(g);
  g.bind = new THREE.Group();
  g.bind.position.copy(pivot).negate();
  g.add(g.bind);
  g.pivot = pivot;
  return g;
}
const HIP_Y = 0.42, WAIST_Y = 0.5, NECK_Y = 1.32;
const hips = joint(rig, V3(0, HIP_Y, 0));
const chest = joint(hips, V3(0, WAIST_Y, 0));
const head = joint(chest, V3(0, NECK_Y, 0));
rig.name = 'Goldendoodle'; chest.name = 'Body'; head.name = 'HeadPivot';

// meshes whose vertices are rewritten every frame
function dynamicMesh(parent, vertexCount, index, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
  g.setIndex(index);
  const m = new THREE.Mesh(g, material);
  m.frustumCulled = false;
  parent.add(m);
  return m;
}

// ---------- the volumes, as distance fields ----------
// No part is a plain ball, egg or capsule. Each starts as a rounded pillow and is reshaped along its length by a profile:
// how wide and how deep it is changes smoothly with the height, separately for the front and the back.

// body: a pear. Narrow shoulders, fullest low down, a small belly pushed forward, the back a little flatter.
const BODY = V3(0, 0.64, 0);
function bodyField(x, y, z) {
  const dy = y - BODY.y, up = smoothstep(dy, 0, 0.75);                // 0 at the belly, 1 at the shoulders
  const belly = Math.exp(-(((dy + 0.04) / 0.32) ** 2));               // forward fullness, low on the front
  const front = smoothstep(z, -0.25, 0.25);
  const deep = lerp(0.6 * (1 - 0.04 * up), 0.62 * (1 + 0.09 * belly), front);
  // the part above the belly is 0.8 tall and the part below it 0.48
  const d = superq(x * (1 + 0.02 * up), dy > 0 ? dy * 0.6 : dy, (z * 0.62 / deep) * (1 + 0.1 * up), 0.68, 0.48, 0.62, 2.7);
  if (d > 0.6) return d;
  // each arm grows out of the body: the top of the resting arm is melted into the shoulder
  const p = ARM_FRAME.toLocal(Math.abs(x), y, z);
  return smin(d, smax(armField(p[0], p[1], p[2]) + 0.02, -p[1] - 0.28, 0.15), 0.15);
}

// head: widest low in the cheeks, narrower toward the crown and the chin, the forehead gently flattened,
// the back fuller in its lower half. The muzzle is part of the same surface.
const HEAD = V3(0, 1.68, -0.02), MUZZLE = V3(0, 1.58, 0.5);
function skullField(x, y, z) {
  const dy = y - HEAD.y, low = smoothstep(-dy, -0.05, 0.32), top = smoothstep(dy, 0.15, 0.85), front = smoothstep(z, -0.2, 0.3);
  const depth = 1 + 0.08 * top * front - 0.05 * low * (1 - front);
  // the cheek line is low: the crown is 0.9 above it and the chin 0.46 below
  return superq(x / (1 + 0.12 * low), dy > 0 ? dy * 0.511 : dy, (z - HEAD.z) * depth, 0.64, 0.46, 0.6, 2.5);
}
// muzzle: the whole lower face pushed forward. Broad, fullest up by the nose, drawn back and a little narrower toward the mouth and chin
function muzzleField(x, y, z) {
  const dy = y - MUZZLE.y, narrow = 1 + 0.12 * smoothstep(-dy, 0, 0.4);
  return superq(x * narrow, dy, z - MUZZLE.z - 0.25 * dy, 0.46, 0.4, 0.42, 2.5);
}
function headField(x, y, z) {
  let d = skullField(x, y, z);
  if (d > 0.7) return d;
  d = smin(d, muzzleField(x, y, z), 0.3);
  // philtrum: a shallow groove down the middle of the muzzle, from under the nose to the lip
  if (z > 0.5) d += 0.022 * Math.exp(-((x / 0.04) ** 2)) * smoothstep(y, 1.38, 1.5) * smoothstep(-y, -1.8, -1.68) * smoothstep(z, 0.5, 0.7);
  // each ear grows out of the head: the top of the ear is melted into the skull, so there is no seam where it joins
  const p = EARS[x > 0 ? 0 : 1].toLocal(x, y, z);
  return smin(d, smax(earField(x > 0 ? p[0] : -p[0], p[1], p[2]) + 0.02, -p[1] - 0.3, 0.1), 0.07);
}

// ears: fat teardrop lobes. Each joins the side of the crown just below its top, lies against the head and splays
// outward as it hangs, ending in a full round end at chin height. Ear space: the ear hangs down -y from where it
// joins the head, +x is outward, z is front to back. Seen from the side its outline is a teardrop: a small round top
// and a large round end. It is a puffy pillow inside that outline: thin at the root, thick below, with a round rim.
const EARS = [1, -1].map(sx => frame(V3(sx * 0.46, 2.43, -0.11), new THREE.Euler(0, -sx * 0.12, sx * 0.34)));
const EAR_L = 1.25, EAR_TOP = 0.23, EAR_END = 0.36;   // its length, and the radius of each end of the teardrop
function earField(x, y, z) { // the dog's left ear; the right one is its mirror image
  const t = clamp(-y / EAR_L, 0, 1);
  const h = clamp(-y, EAR_TOP, EAR_L - EAR_END), rad = lerp(EAR_TOP, EAR_END, (h - EAR_TOP) / (EAR_L - EAR_END - EAR_TOP));
  const edge = Math.max(1 + (Math.hypot(z, y + h) - rad) / 0.3, 0);   // 0 well inside the outline, 1 on it
  const thick = lerp(0.14, 0.22, smoothstep(t, 0.05, 0.7)), mid = 0.1 * t * (1 - t);   // its middle line bows outward a little
  return (Math.pow(Math.pow(Math.abs(x - mid) / thick, 2.1) + Math.pow(edge, 2.1), 1 / 2.1) - 1) * thick;
}
const earsInHead = (x, y, z) => { const i = x > 0 ? 0 : 1, p = EARS[i].toLocal(x, y, z); return earField(i ? -p[0] : p[0], p[1], p[2]); };

// arms: short flippers. Arm space: the shoulder is the origin and the arm hangs down -y. Narrow at the shoulder, fuller in the middle.
const SHOULDER = V3(0.63, 1.14, -0.08), ARM_REST = V3(0.79, 0.58, -0.07), ARM_REACH = 0.58; // the left shoulder, and where that hand hangs
const ARM_FRAME = frame(SHOULDER, new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, -1, 0), ARM_REST.clone().sub(SHOULDER).normalize())));
function armField(x, y, z) {
  const full = lerp(0.72, 1, smoothstep(-y / 0.64, 0, 0.55));
  return superq(x / full, y + 0.32, z / full, 0.14, 0.33, 0.21, 2.4);
}

// feet: a broad round foot with a flat bottom and a short thick leg that disappears into the body.
// Foot space: the ankle is the origin and the floor is at -ANKLE.
const HIP = V3(0.285, HIP_Y, 0.02), ANKLE = 0.15;
function footField(x, y, z) {
  let d = superq(x, y - 0.02, z - 0.02, 0.245, 0.19, 0.28, 2.8);
  d = smin(d, capsule(x, y, z, 0, 0, 0, 0, 0.24, -0.01, 0.2, 0.2), 0.1);
  return smax(d, -(y + ANKLE), 0.05);
}

// tail: one smooth curve from the lower back, out and up, thick at the base and tapering to a soft point.
// The field is the distance to that curve (found by a coarse search, then refined), less the thickness there.
const TAIL = [V3(0, 0.45, -0.46), V3(0, 0.369, -0.874), V3(0.036, 0.783, -0.991)];
const tailRadius = t => lerp(0.198, 0.081, Math.pow(t, 1.6));
function tailField(x, y, z) {
  const [a, b, c] = TAIL;
  const at = (t, k) => { const u = 1 - t; return u * u * a.getComponent(k) + 2 * t * u * b.getComponent(k) + t * t * c.getComponent(k); };
  let t = 0, best = 1e9;
  for (let i = 0; i <= 8; i++) { const d = Math.hypot(at(i / 8, 0) - x, at(i / 8, 1) - y, at(i / 8, 2) - z); if (d < best) { best = d; t = i / 8; } }
  const p = [x, y, z];
  for (let n = 0; n < 4; n++) { // Newton steps toward the nearest point on the curve
    let f = 0, df = 0;
    for (let k = 0; k < 3; k++) {
      const q = at(t, k) - p[k], d1 = 2 * (1 - t) * (b.getComponent(k) - a.getComponent(k)) + 2 * t * (c.getComponent(k) - b.getComponent(k)), d2 = 2 * (c.getComponent(k) - 2 * b.getComponent(k) + a.getComponent(k));
      f += q * d1; df += d1 * d1 + q * d2;
    }
    t = clamp(t - f / Math.max(df, 1e-4), 0, 1);
  }
  return Math.hypot(at(t, 0) - x, at(t, 1) - y, at(t, 2) - z) - tailRadius(t);
}
// ---------- head: one plush volume, with the ears on pivots and the smooth face parts sitting above the strands ----------
const EYE = { x: 0.146, y: 2.11 }, NOSE_Y = 1.87, MOUTH = { x: 0, y: 1.39 };
const headShade = (x, y, z) => Math.min(headField(x, y, z), earsInHead(x, y, z), bodyField(x, y, z));
// the plush is clipped short around the eyes, the nose and the mouth, so they sit cleanly
function headNap(x, y, z) {
  if (z < 0.2) return 1;
  const eye = Math.hypot(Math.abs(x) - EYE.x, y - EYE.y) / 0.13, nose = Math.hypot(x / 0.27, (y - NOSE_Y) / 0.21), mouth = Math.hypot(x / 0.3, (y - 1.35) / 0.15);
  const groove = y > 1.35 && y < NOSE_Y ? Math.abs(x) / 0.06 : 9;
  return lerp(0.3, 1, smoothstep(Math.min(eye, nose, mouth, groove), 0.7, 1.3));
}
// The coat: short, fine and a little combed down. Its light is soft and comes from above: tops are bright, undersides
// and folds go to a deep warm orange (red is kept, blue is lost), never toward grey or black.
const HEAD_FUR = 0.06, FUR = { length: HEAD_FUR, cell: 0.0105, gravity: 0.5, curl: 5, taper: 2.2, root: 0.9,
  amb: V3(0.42, 0.76, 0.2), floor: new THREE.Vector2(0.52, 0.58), shade: V3(0.6, 1.05, 1.8) };
const headFur = plush(sculpt(headField, [-0.86, 1.08, -0.84], [0.86, 2.74, 1.14], 0.034, headShade, null, SKY, { nap: headNap }),
  { ...FUR, layers: 16, blush: new THREE.Vector4(0.42, 1.74, 0.2, 0), crease: new THREE.Vector4(0.035, MOUTH.y, NOSE_Y - 0.12, 0.3) });
headFur.name = 'Head';
head.bind.add(headFur);

const earGeo = sculpt(earField, [-0.34, -1.45, -0.5], [0.4, 0.12, 0.5], 0.03,
  (x, y, z) => { const p = EARS[0].toWorld(x, y, z); return Math.min(earField(x, y, z), headField(...p), bodyField(...p)); }, null, EARS[0].dir(SKY.x, SKY.y, SKY.z));
const earGeoR = mirrored(earGeo);
const ears = EARS.map((f, i) => {
  const pivot = f.place(new THREE.Group()), flex = new THREE.Group();
  flex.add(plush(i ? earGeoR : earGeo, { ...FUR, layers: 12 }));
  pivot.add(flex);
  pivot.name = i ? 'RightEar' : 'LeftEar';
  head.bind.add(pivot);
  return { sx: i ? -1 : 1, flex };
});

// where the front of the face is, for anything that has to sit on it
const FACE = { x0: -0.62, y0: 1.24, d: 0.0125, nx: 100, ny: 96 };
FACE.z = new Float32Array(FACE.nx * FACE.ny);
for (let j = 0, n = 0; j < FACE.ny; j++) for (let i = 0; i < FACE.nx; i++, n++) {
  const x = FACE.x0 + i * FACE.d, y = FACE.y0 + j * FACE.d;
  let a = 0.1, b = 1.3;
  for (let s = 0; s < 18; s++) { const m = (a + b) / 2; if (headField(x, y, m) < 0) a = m; else b = m; }
  FACE.z[n] = a;
}
function faceZ(x, y) {
  const u = clamp((x - FACE.x0) / FACE.d, 0, FACE.nx - 1.001), v = clamp((y - FACE.y0) / FACE.d, 0, FACE.ny - 1.001), i = u | 0, j = v | 0, n = j * FACE.nx + i;
  const a = FACE.z[n] + (FACE.z[n + 1] - FACE.z[n]) * (u - i), b = FACE.z[n + FACE.nx] + (FACE.z[n + FACE.nx + 1] - FACE.z[n + FACE.nx]) * (u - i);
  return a + (b - a) * (v - j);
}
// the point on the face at (x, y), lifted off the surface along its normal (left in _fn)
const _fn = V3();
function onFace(x, y, lift, out = V3()) {
  const z = faceZ(x, y), E = 0.01;
  _fn.set(headField(x + E, y, z) - headField(x - E, y, z), headField(x, y + E, z) - headField(x, y - E, z), headField(x, y, z + E) - headField(x, y, z - E)).normalize();
  return out.set(x, y, z).addScaledVector(_fn, lift);
}

// nose: a dark-brown rounded triangle on top of the muzzle, matte with a soft highlight
{
  const g = new THREE.SphereGeometry(1, 32, 22), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setXYZ(i, p.getX(i) * (1 + 0.3 * y), y > 0 ? y * 0.82 : y, p.getZ(i)); } // wide and flatter on top, narrowing down
  g.computeVertexNormals();
  const nose = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: C.nose, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.45 }));
  nose.scale.set(0.18, 0.135, 0.12);
  onFace(0, NOSE_Y, 0.03, nose.position);
  nose.rotation.x = -0.32;
  nose.name = 'Nose';
  head.bind.add(nose);
}

// eyes: small glossy black beads, close together, each with a tiny white glint. A happy or winking eye is a small arc instead.
// Each bead has a ginger lid that can roll down over it and slant: half shut for sleepy, slanted in for cross, out for sad.
const eyeMat = new THREE.MeshPhysicalMaterial({ color: C.eye, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
const flatInk = new THREE.MeshBasicMaterial({ color: C.eye });
const lidMat = new THREE.MeshStandardMaterial({ color: C.lid, roughness: 1 });
const lidGeo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const eyes = [-1, 1].map(s => { // the eye on the viewer's left first
  const g = new THREE.Group();
  onFace(s * EYE.x, EYE.y, 0.02, g.position);
  g.quaternion.setFromUnitVectors(AXIS_Z, _fn);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), eyeMat);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  glint.position.set(-0.3, 0.38, 0.84);
  bead.add(glint);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 20, Math.PI), flatInk);
  arc.position.set(0, -0.02, 0.03);
  const lid = new THREE.Mesh(lidGeo, lidMat);
  lid.rotation.order = 'ZXY';
  g.add(bead, arc, lid);
  g.name = s < 0 ? 'RightEye' : 'LeftEye';
  head.bind.add(g);
  return { s, bead, arc, lid };
});
// shapes: 'bead' | 'arc' for each eye; open: 0..1 for each eye; p: the pose (eye = how tall, eyeW = how wide, lid = how far the lid is down, eyeTilt: + is a scowl)
function updateEyes(shapes, open, p) {
  eyes.forEach((e, i) => {
    const arc = shapes[i] === 'arc';
    e.bead.visible = !arc; e.arc.visible = arc;
    e.bead.scale.set(0.061 * p.eyeW, 0.067 * Math.max(p.eye * open[i], 0.08), 0.042);
    e.lid.visible = !arc && p.lid > 0.03;
    e.lid.scale.set(0.068 * p.eyeW, 0.074 * p.eye, 0.05);
    e.lid.rotation.set(-Math.PI / 2 + 2.5 * p.lid, 0, e.s * p.eyeTilt);
    e.arc.scale.set(1, Math.max(open[i], 0.15), 1);
  });
}

// mouth: a thin ribbon low on the muzzle that can be a line, a smile, a frown or an open shape
const MOUTH_N = 36;
const mouthIdx = [];
for (let i = 0; i < MOUTH_N; i++) { const a = i * 2; mouthIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
const mouth = dynamicMesh(head.bind, (MOUTH_N + 1) * 2, mouthIdx, new THREE.MeshBasicMaterial({ color: C.mouth, side: THREE.DoubleSide }));
mouth.name = 'Mouth';
const _mv = V3();
// p: mW half width, mC curve (+ is a smile), mT half thickness, mO how far it opens, mS skew
function updateMouth(p) {
  const pos = mouth.geometry.attributes.position, lift = HEAD_FUR * 0.4 + 0.25 * p.mO; // an open mouth stands further off the fur
  for (let i = 0; i <= MOUTH_N; i++) {
    const s = -Math.cos((Math.PI * i) / MOUTH_N), x = MOUTH.x + p.mW * s, round = Math.sqrt(Math.max(1 - s * s, 0));
    const end = Math.abs(p.mW * s) > p.mW - p.mT ? Math.sqrt(Math.max(1 - ((Math.abs(p.mW * s) - (p.mW - p.mT)) / p.mT) ** 2, 0)) : 1;
    const c = MOUTH.y + p.mC * (s * s - 0.4) + p.mS * s;
    onFace(x, c - p.mT * end - p.mO * round, lift, _mv); pos.setXYZ(i * 2, _mv.x, _mv.y, _mv.z);
    onFace(x, c + p.mT * end + p.mO * 0.2 * round, lift, _mv); pos.setXYZ(i * 2 + 1, _mv.x, _mv.y, _mv.z);
  }
  pos.needsUpdate = true;
}
// ---------- body and tail: plush, on the chest joint ----------
const bodyShade = (x, y, z) => Math.min(bodyField(x, y, z), headField(x, y, z), tailField(x, y, z));
chest.bind.add(plush(sculpt(bodyField, [-0.86, 0.06, -0.82], [0.86, 1.56, 0.88], 0.034, bodyShade), { ...FUR, layers: 16 }));

// the tail is one piece that wags from its root
const tailShade = (x, y, z) => Math.min(tailField(x, y, z), bodyField(x, y, z));
const tail = joint(chest, TAIL[0]);
tail.name = 'TailPivot';
tail.bind.add(plush(sculpt(tailField, [-0.36, 0.08, -1.46], [0.42, 1.22, -0.14], 0.028, tailShade), { ...FUR, layers: 12 }));
// ---------- arms: one soft flipper each, with no elbow. It hangs from the shoulder and simply points at where the hand should be ----------
const DOWN = V3(0, -1, 0);
const armGeo = sculpt(armField, [-0.24, -0.7, -0.3], [0.24, 0.1, 0.3], 0.024);
const arms = [1, -1].map(sx => { // [0] is the dog's left arm
  const g = new THREE.Group();
  g.position.set(sx * SHOULDER.x, SHOULDER.y, SHOULDER.z);
  g.add(plush(armGeo, { ...FUR, layers: 12 }));
  g.name = sx > 0 ? 'LeftArmPivot' : 'RightArmPivot';
  chest.bind.add(g);
  return { sx, g };
});
// point an arm at `target` (in the chest's standing coordinates); it stretches or shortens a little to get there
const _aim = V3();
function aim(a, target) {
  const len = _aim.copy(target).sub(a.g.position).length();
  a.g.quaternion.setFromUnitVectors(DOWN, _aim.divideScalar(len));
  a.g.scale.y = clamp(len / ARM_REACH, 0.85, 1.12);
}

// ---------- feet: they stand on the floor in the rig's own space, and their short legs disappear into the body ----------
const footGeo = sculpt(footField, [-0.32, -0.2, -0.34], [0.32, 0.5, 0.36], 0.024,
  (x, y, z) => Math.min(footField(x, y, z), bodyField(x + HIP.x, y + ANKLE, z + HIP.z), y + ANKLE));
const footGeoR = mirrored(footGeo);
const legs = [1, -1].map(sx => { // [0] is the dog's left foot
  const foot = new THREE.Group();
  foot.add(plush(sx > 0 ? footGeo : footGeoR, { ...FUR, layers: 12 }));
  foot.name = sx > 0 ? 'LeftLeg' : 'RightLeg';
  rig.add(foot);
  return { sx, foot };
});
// ---------- contact shadows: one soft pool under the body and a tighter one under each foot ----------
const blobTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
})();
function blob(w, d, opacity) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blobTex, color: '#23262d', transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.004; m.renderOrder = -1; m.userData.opacity = opacity;
  scene.add(m);
  return m;
}
const bodyShadow = blob(3.0, 2.5, 0.26), footShadows = [blob(0.68, 0.8, 0.42), blob(0.68, 0.8, 0.42)];
// ---------- emotions: a pose (numbers the dog settles into) + a motion (what it keeps doing) ----------
const NEUTRAL = {
  mW: 0.15, mC: 0.01, mT: 0.0105,  mO: 0, mS: 0,                           // mouth: half width, curve (+ smile), thickness, open, skew
  eye: 1, eyeW: 1, lid: 0, eyeTilt: 0,                                     // eyes: how tall, how wide, lid down, lid slant: scowl (+) or worry (-)
  blush: 0,                                                                // pink in the cheeks
  ear: 0, earCock: 0, earBack: 0,                                          // ears: lifted away from the head, one more than the other, swept back
  wag: 1, tailLift: 0,                                                     // tail: how fast, how high
  lean: 0, pitch: 0, turn: 0, squash: 0, crouch: 0,                        // body
  headPitch: 0, headTilt: 0, headTurn: 0,
  hx: -ARM_REST.x, hy: ARM_REST.y, hz: ARM_REST.z,                                         // where the right hand is
  lx: ARM_REST.x, ly: ARM_REST.y, lz: ARM_REST.z,                                          // and the left
  pace: 1,                                                                 // how briskly the dog walks
};
const BEADS = ['bead', 'bead'], WINK = ['arc', 'bead'];                    // the eye on the viewer's left, then the other
const SHAPES = { happy: ['arc', 'arc'], wave: ['arc', 'arc'] };
const POSES = {
  happy:       { mW: 0.15, mC: 0.05, mO: 0.02, ear: 0.12, wag: 4.5, tailLift: 0.3, headPitch: -0.05, headTilt: 0.05, hx: -1.12, hy: 1.4, hz: 0.1 },
  euphoric:    { mW: 0.15, mC: 0.05, mO: 0.085, eye: 1.1, ear: 0.3, wag: 6, tailLift: 0.45, pitch: -0.04, headPitch: -0.1, hx: -1.05, hy: 1.6, hz: 0.05, lx: 1.05, ly: 1.6, lz: 0.05, pace: 1.35 },
  surprised:   { mW: 0.042, mC: 0, mO: 0.06, mT: 0.012, eye: 1.25, eyeW: 1.12, ear: 0.45, wag: 0.2, tailLift: 0.6, pitch: -0.06, headPitch: -0.05, squash: -0.03, hx: -1.12, hy: 1.12, hz: 0.2, lx: 1.12, ly: 1.12, lz: 0.2 },
  curious:     { mW: 0.1, mC: 0.004, eye: 1.08, ear: 0.1, earCock: 0.22, wag: 1.6, tailLift: 0.3, lean: 0.06, turn: 0.18, pitch: 0.04, headTilt: 0.26, headTurn: 0.1, hx: -0.78, hy: 0.95, hz: 0.42 },
  sleepy:      { mW: 0.1, mC: -0.004, lid: 0.6, eyeTilt: -0.1, wag: 0.3, tailLift: -0.4, lean: -0.04, pitch: 0.05, squash: 0.03, headPitch: 0.16, headTilt: -0.12, pace: 0.5 },
  sad:         { mW: 0.11, mC: -0.045, lid: 0.5, eyeTilt: -0.6, ear: -0.06, earBack: 0.1, wag: 0.2, tailLift: -0.7, pitch: 0.08, squash: 0.04, headPitch: 0.22, pace: 0.6 },
  embarrassed: { mW: 0.07, mC: 0.02, mS: 0.012, lid: 0.4, eyeTilt: -0.3, blush: 1, wag: 0.6, tailLift: -0.3, turn: 0.12, squash: 0.02, headTurn: 0.24, headPitch: 0.12, headTilt: 0.08, hx: -0.58, hy: 1.28, hz: 0.5, lx: 0.58, ly: 1.28, lz: 0.5 },
  angry:       { mW: 0.14, mC: -0.05, mT: 0.014, mO: 0.014, lid: 0.55, eyeTilt: 0.65, earBack: 0.5, ear: 0.08, wag: 0, tailLift: 0.5, pitch: 0.08, crouch: 0.02, headPitch: 0.04, hx: -0.98, hy: 0.74, hz: 0.16, lx: 0.98, ly: 0.74, lz: 0.16, pace: 1.3 },
  wave:        { mW: 0.15, mC: 0.05, mO: 0.03, ear: 0.15, wag: 4, tailLift: 0.3, headPitch: -0.04, headTilt: -0.12, hx: -1.28, hy: 1.6, hz: 0.34 }, // goodbye: the right paw up and out, clear of the ear
};
// ignored for a while: a look, a tapping foot
const IMPATIENT = { headTilt: 0.1, headTurn: -0.08, lid: 0.3, eyeTilt: 0.25, mC: -0.02, wag: 0.4, earCock: -0.1 };

// t = clock time, e = seconds since this emotion started
const MOTION0 = { hop: 0, lean: 0, pitch: 0, turn: 0, squash: 0, crouch: 0, headPitch: 0, headTilt: 0, headTurn: 0, hx: 0, hy: 0, hz: 0, lx: 0, ly: 0, lz: 0, lid: 0, mO: 0, ear: 0, footL: 0, footR: 0 };
const MOTIONS = {
  happy:       (t, a) => { const b = Math.abs(Math.sin(t * 5)); a.crouch = 0.03 * (1 - b); a.headTilt = 0.09 * Math.sin(t * 2.5); a.lean = 0.03 * Math.sin(t * 2.5); a.hx = 0.1 * Math.sin(t * 9); a.hy = 0.03 * Math.cos(t * 9); },
  euphoric:    (t, a) => { const s = Math.abs(Math.sin(t * 6)); a.hop = 0.3 * s; a.squash = 0.09 * (1 - s) ** 6; a.hy = 0.05 * Math.sin(t * 12); a.ly = 0.05 * Math.sin(t * 12 + 1.2); a.lean = 0.04 * Math.sin(t * 3); a.headTilt = 0.06 * Math.sin(t * 6); },
  surprised:   (t, a, e) => { a.hop = e < 0.4 ? 0.24 * Math.sin((Math.PI * e) / 0.4) : 0; a.lean = e < 1 ? 0.012 * Math.sin(e * 40) * (1 - e) : 0; },
  curious:     (t, a) => { a.lean = 0.05 * Math.sin(t * 0.85); a.headTilt = 0.06 * Math.sin(t * 0.85 + 0.6); a.headPitch = 0.02 * Math.sin(t * 1.7); a.ear = 0.1 * Math.max(0, Math.sin(t * 3.1)) ** 4; },
  sleepy:      (t, a) => { const n = (t * 0.3) % 1, y = (t / 7) % 1; a.headPitch = 0.18 * n * n; a.lid = 0.3 * n * n; a.lean = 0.02 * Math.sin(t * 0.6); a.squash = 0.016 * Math.sin(t * 1.2); a.mO = y < 0.24 ? 0.07 * Math.sin((Math.PI * y) / 0.24) ** 2 : 0; },
  sad:         (t, a) => { const sniff = Math.max(0, Math.sin(t * 1.6)) ** 12; a.squash = 0.014 * Math.sin(t * 0.9); a.headTurn = 0.05 * Math.sin(t * 0.7); a.headPitch = -0.05 * sniff; },
  embarrassed: (t, a) => { a.lean = 0.05 * Math.sin(t * 2); a.turn = 0.06 * Math.sin(t * 2); a.headTurn = 0.05 * Math.sin(t * 2 + 0.5); a.hx = 0.02 * Math.sin(t * 5); a.lx = -0.02 * Math.sin(t * 5); a.hy = 0.02 * Math.sin(t * 10); a.ly = 0.02 * Math.cos(t * 10); },
  angry:       (t, a) => { const bang = Math.sin(t * 6.5); a.lean = 0.014 * Math.sin(t * 42); a.turn = 0.012 * Math.sin(t * 37); a.hy = 0.03 * Math.sin(t * 13); a.ly = 0.03 * Math.sin(t * 13 + 1); a.footR = Math.max(0, -bang) * 0.3; },
  wave:        (t, a) => { const s = Math.sin(t * 9); a.hx = 0.18 * s; a.hy = 0.06 * s; a.lean = 0.025 * s; a.headTilt = 0.04 * Math.sin(t * 4.5); },
};
// ---------- interaction ----------
const clock = new THREE.Clock();
let current = null, enteredAt = 0, holdTimer = 0, restTimer = 0, pointerX = 0, pointerY = 0, winkUntil = -10;
const walk = { on: false, w: 0, phase: 0 };
const POGO = { t: -1, hop: 0.46, hops: 2, height: 0.36 };

function setEmotion(name) {
  if (name !== current) enteredAt = clock.elapsedTime;
  current = name;
}
// 'jump' is two hops and a wink; any other name is an emotion held for a moment.
function react(name, ms = 2600) {
  clearTimeout(holdTimer);
  if (name === 'jump') { setEmotion(null); if (POGO.t < 0) POGO.t = 0; return; }
  setEmotion(name in POSES ? name : null);
  holdTimer = setTimeout(() => setEmotion(null), ms);
}

// each tap gets the next reaction, so tapping again is worth it
const TAPS = ['jump', 'happy', 'surprised', 'curious', 'embarrassed'];
const canvas = renderer.domElement;
let down = null, taps = 0;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', e => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) react(TAPS[taps++ % TAPS.length]);
  down = null;
});

// The dog looks at the pointer anywhere on the page, measured from its own face.
// A finger has no hover, so after a touch the dog looks ahead again.
function follow(e) {
  const r = canvas.getBoundingClientRect();
  pointerX = clamp((e.clientX - (r.left + r.width / 2)) / (innerWidth * 0.4), -1, 1);
  pointerY = clamp((e.clientY - (r.top + r.height * 0.4)) / (innerHeight * 0.5), -1, 1);
  clearTimeout(restTimer);
  if (e.pointerType !== 'mouse') restTimer = setTimeout(() => { pointerX = pointerY = 0; }, 1800);
}
addEventListener('pointermove', follow);
addEventListener('pointerdown', follow);

// ---------- adaptive quality: fewer pixels, then fewer plush layers, when frames get slow ----------
const LEVELS = [
  { pr: Math.min(devicePixelRatio, 1.5), step: 1 },
  { pr: Math.min(devicePixelRatio, 1.2), step: 1 },
  { pr: 1, step: 1 },
  { pr: 1, step: 2 },
  { pr: 0.75, step: 2 },
  { pr: 0.6, step: 3 },
];
const quality = { level: 0, seconds: 0, frames: 0, lastFps: 0, misses: 0, locked: false };
function applyLevel(level) {
  quality.level = level;
  const { pr, step } = LEVELS[level];
  renderer.setPixelRatio(pr);
  renderer.setSize(host.clientWidth, host.clientHeight);
  for (const g of furGroups) g.children.forEach((m, i) => { m.visible = i % step === 0 || i === g.children.length - 1; });
}
function trackFrameRate(rawDt) {
  if (quality.locked) return;
  quality.seconds += rawDt; quality.frames++;
  if (quality.seconds < 1.2) return;
  const fps = quality.frames / quality.seconds;
  quality.seconds = quality.frames = 0;
  if (fps >= 26) return;
  // If shedding quality doesn't help, the browser is throttling us and the GPU isn't the
  // limit (background tab, embedded preview), so go back to full quality and stop adapting.
  if (quality.level > 0 && fps < quality.lastFps * 1.2) {
    if (++quality.misses >= 2) { quality.locked = true; applyLevel(0); return; }
  } else quality.misses = 0;
  quality.lastFps = fps;
  if (quality.level < LEVELS.length - 1) applyLevel(quality.level + 1);
}
const onVisibility = () => { clock.getDelta(); quality.seconds = quality.frames = 0; };
document.addEventListener('visibilitychange', onVisibility);
// ---------- animation ----------
const TAU = Math.PI * 2, ease = u => u * u * (3 - 2 * u);
const cur = { ...NEUTRAL };
const motion = { ...MOTION0 }, smooth = { ...MOTION0 };
const swing = { x: 0, v: 0 }, flop = { x: 0, v: 0 }; // follow-through from spinning / from hopping
const look = { x: 0, y: 0 };
const face = { shown: BEADS, next: null, swapAt: -10, key: '' }, SWAP = 0.18;
const twitch = { at: -10, next: 3, ear: 0 };
let prevRel = null, prevY = 0, prevVy = 0, nextBlink = 2, blinkAt = -10, frames = 0, impatience = 0, tailPhase = 0;
const _t = V3(), _a = V3();

// One foot's path through a walking cycle: on the floor sliding back, then lifted and carried forward.
const STEP = { y: 0, z: 0, pitch: 0 }, STANCE = 0.56;
function step(p) {
  const F = STEP;
  if (p < STANCE) { F.z = 1 - (2 * p) / STANCE; F.y = 0; F.pitch = 0; }
  else { const u = (p - STANCE) / (1 - STANCE); F.z = -1 + 2 * ease(u); F.y = Math.sin(Math.PI * u); F.pitch = Math.sin(TAU * u); } // toe down as it leaves, toe up as it lands
  return F;
}
const CADENCE = 1.6, STRIDE = 0.14, LIFT = 0.1; // cycles per second; half a step's length; how high a foot lifts

function tick() {
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.1), t = clock.elapsedTime;
  trackFrameRate(rawDt);
  shared.uTime.value = t;

  // getting bored: ramps in after being ignored while idle
  const ignored = false; // on a dashboard the dog never gets impatient
  impatience += ((ignored ? 1 : 0) - impatience) * Math.min(dt * 3, 1);

  // settle into the pose
  const pose = current ? POSES[current] : null;
  const k = 1 - Math.exp(-dt * 9);
  for (const key of Object.keys(cur)) {
    let target = NEUTRAL[key];
    if (pose) { if (key in pose) target = pose[key]; }
    else if (key in IMPATIENT) target = lerp(target, IMPATIENT[key], impatience);
    cur[key] += (target - cur[key]) * k;
  }

  // the emotion's ongoing motion (or, ignored: a tapping foot)
  for (const key of Object.keys(motion)) motion[key] = 0;
  if (current) MOTIONS[current](t, motion, t - enteredAt);
  else if (impatience > 0.01) {
    const gate = smoothstep(0.86 - ((t / 4.4) % 1), 0, 0.06); // ~3.8s on, a beat off
    motion.footR = Math.max(0, Math.sin(t * 9.5)) * 0.3 * impatience * gate;
    motion.lean = 0.02 * Math.sin(t * 1.75) * impatience;
  }
  const km = 1 - Math.exp(-dt * 22);
  for (const key of Object.keys(motion)) smooth[key] += (motion[key] * CALM - smooth[key]) * km;

  // walking: how far into it the dog is, and where in the cycle
  walk.w += ((walk.on ? 1 : 0) - walk.w) * (1 - Math.exp(-dt * 4));
  const w = ease(clamp(walk.w, 0, 1)), still = 1 - w;
  if (walk.w > 0.005) walk.phase = (walk.phase + dt * CADENCE * (0.55 + 0.45 * cur.pace)) % 1;
  const ph = walk.phase, s1 = Math.sin(TAU * ph), c1 = Math.cos(TAU * ph); // the left heel lands at 0, the right at 0.5

  // canvas tap: a couple of jumps, then a wink
  let pogoY = 0, pogoSquash = 0;
  if (POGO.t >= 0) {
    POGO.t += dt;
    const n = POGO.t / POGO.hop;
    if (n >= POGO.hops) { POGO.t = -1; winkUntil = t + 0.9; }
    else {
      const p = n % 1;
      pogoY = POGO.height * Math.sin(Math.PI * p) * CALM;
      pogoSquash = Math.max(0, 1 - Math.min(p, 1 - p) / 0.12) * 0.12 * CALM;
    }
  }
  const y = pogoY + smooth.hop;
  const air = clamp(y / 0.36, 0, 1);
  const vy = (y - prevY) / Math.max(dt, 1e-4), acc = (vy - prevVy) / Math.max(dt, 1e-4);
  prevY = y; prevVy = vy;
  shared.uBounce.value += (clamp(vy * 0.25, -0.8, 0.8) - shared.uBounce.value) * Math.min(dt * 12, 1);

  // the whole dog: jumps, and turns a little toward the pointer
  rig.position.y = y;
  rig.rotation.y += (pointerX * 0.45 - rig.rotation.y) * Math.min(dt * 3, 1);
  look.x += (pointerX - look.x) * Math.min(dt * 4, 1); look.y += (pointerY - look.y) * Math.min(dt * 4, 1);

  // hips: idle, the weight drifts from foot to foot; walking, they bob and waddle over the standing foot
  const breathe = Math.sin(t * (current === 'sleepy' ? 1.2 : 2.3));
  const shift = (0.6 * Math.sin(t * 0.43) + 0.4 * Math.sin(t * 0.29 + 1.3)) * CALM;
  const squash = cur.squash + smooth.squash + pogoSquash;
  const crouch = cur.crouch + smooth.crouch + squash * 0.6 + w * 0.01;
  const sway = 0.06 * w * s1 + 0.015 * still * shift;
  const hipRoll = 0.075 * w * s1 - 0.008 * still * shift;
  hips.position.set(sway, HIP_Y - crouch - 0.026 * w * Math.cos(2 * TAU * ph), 0.01 * w);
  hips.rotation.set(0.02 * w, -0.07 * w * c1, hipRoll);

  // chest (the whole body): leans, turns a little against the hips, breathes
  const chestLean = cur.lean + smooth.lean - 0.02 * w * s1 + still * (0.01 * Math.sin(t * 0.9) + 0.01 * shift);
  chest.rotation.set(cur.pitch + smooth.pitch + 0.04 * w, cur.turn + smooth.turn + 0.08 * w * c1, chestLean);
  chest.scale.set(1 + squash * 0.5 - breathe * 0.006, 1 - squash * 0.7 + breathe * 0.012 * CALM, 1 + squash * 0.5 + breathe * 0.008);

  // head: stays level and keeps looking ahead, with a little life of its own
  const wander = still * CALM * (current ? 0.3 : 1);
  head.rotation.set(
    cur.headPitch + smooth.headPitch - 0.03 * w + 0.22 * look.y + wander * 0.025 * Math.sin(t * 0.53 + 1) + 0.012 * w * Math.cos(2 * TAU * ph + 0.8),
    cur.headTurn + smooth.headTurn - 0.04 * w * c1 + 0.4 * look.x + wander * 0.07 * Math.sin(t * 0.37 + 2),
    cur.headTilt + smooth.headTilt - 0.7 * (hipRoll + chestLean) + wander * 0.02 * Math.sin(t * 0.61));

  // feet: each goes where the step puts it. They live in the rig's space, so the body can sway and bob over them.
  const stride = STRIDE * (0.6 + 0.4 * cur.pace);
  for (const l of legs) {
    const F = step((ph + (l.sx > 0 ? 0 : 0.5)) % 1), tap = l.sx > 0 ? smooth.footL : smooth.footR;
    l.foot.position.set(l.sx * (HIP.x + 0.01 * air), ANKLE + w * LIFT * F.y + 0.06 * tap + 0.05 * air, HIP.z + w * stride * F.z + 0.06 * tap);
    l.foot.rotation.set(0.3 * w * F.pitch - 0.7 * tap + 0.35 * air, l.sx * 0.1, 0, 'YXZ');
  }

  // arms: flippers that hang at the sides, swing with the walk and go where the emotion wants them
  for (const a of arms) {
    const left = a.sx > 0;
    _t.set((left ? cur.lx + smooth.lx : cur.hx + smooth.hx) + a.sx * 0.1 * air,
      (left ? cur.ly + smooth.ly : cur.hy + smooth.hy) + 0.008 * breathe + 0.22 * air + 0.02 * w * Math.abs(c1),
      (left ? cur.lz + smooth.lz : cur.hz + smooth.hz) - a.sx * 0.18 * w * c1 - 0.15 * swing.x);
    aim(a, _t);
  }

  // follow-through: spinning the view makes the tail and ears trail, jumping makes them bounce
  const rel = rig.rotation.y;
  if (prevRel === null) prevRel = rel;
  const dRel = Math.atan2(Math.sin(rel - prevRel), Math.cos(rel - prevRel));
  prevRel = rel;
  const omega = clamp(dRel / Math.max(dt, 1e-4), -8, 8);
  swing.v += (40 * (omega * 0.05 - swing.x) - 5 * swing.v) * dt;
  swing.x += swing.v * dt;
  flop.v += (-70 * flop.x - 7 * flop.v - clamp(acc, -200, 200) * 0.004) * dt;
  flop.x += flop.v * dt;

  // tail: an easy wag when idle, a fast one when happy, still when cross, and it swings against the hips when walking
  tailPhase += dt * 2.6 * (0.4 + 0.6 * cur.wag) * (1 + 0.4 * w);
  const wagAmp = (0.14 + 0.05 * Math.min(cur.wag, 6)) * Math.min(cur.wag + 0.15, 1) * CALM;
  tail.rotation.set(0.22 * cur.tailLift + 0.08 * flop.x + 0.03 * w * Math.sin(2 * TAU * ph), wagAmp * Math.sin(tailPhase) + 0.14 * w * Math.cos(TAU * ph) + 0.25 * swing.x, 0);

  // ears: heavy flaps. They lift away from the head with the mood, fly up in a jump, bounce with the walk, and one flicks now and then.
  if (t > twitch.next) { twitch.at = t; twitch.ear = Math.random() < 0.5 ? 0 : 1; twitch.next = t + 2.5 + Math.random() * 4; }
  const tw = (t - twitch.at) / 0.3, flick = tw < 1 && !current ? Math.sin(Math.PI * tw) ** 2 * CALM : 0;
  ears.forEach((e, i) => {
    const lift = cur.ear + smooth.ear + e.sx * cur.earCock + 0.3 * air + 1.1 * Math.max(flop.x, -0.04) + 0.03 * w * (1 + Math.sin(2 * TAU * ph + 1)) + (i === twitch.ear ? 0.09 * flick : 0);
    e.flex.rotation.set(0.5 * cur.earBack - 0.2 * flop.x + 0.03 * w * s1, 0, e.sx * 0.5 * Math.max(lift, -0.08) + 0.12 * swing.x);
  });

  // face: the eyes change shape through a quick blink, and blink on their own every few seconds
  const want = current && SHAPES[current] ? SHAPES[current] : t < winkUntil ? WINK : BEADS;
  if (!face.next && (want[0] !== face.shown[0] || want[1] !== face.shown[1])) { face.next = want; face.swapAt = t; }
  const su = (t - face.swapAt) / SWAP;
  if (face.next && su >= 0.5) { face.shown = face.next; face.next = null; }
  const gate = su < 1 ? Math.abs(1 - 2 * su) : 1;
  const blinkLen = current === 'sleepy' ? 0.5 : 0.14;
  if (t > nextBlink) { blinkAt = t; nextBlink = t + 2 + Math.random() * 3; }
  const bp = (t - blinkAt) / blinkLen, shut = bp < 1 ? Math.sin(Math.PI * bp) : 0;
  const open = s => gate * (s === 'bead' ? 1 - 0.94 * shut : 1);
  updateEyes(face.shown, [open(face.shown[0]), open(face.shown[1])], { eye: cur.eye, eyeW: cur.eyeW, lid: clamp(cur.lid + smooth.lid, 0, 1), eyeTilt: cur.eyeTilt });
  const r3 = v => Math.round(v * 500) / 500;
  const m = { mW: r3(cur.mW), mC: r3(cur.mC), mT: r3(cur.mT), mO: r3(clamp(cur.mO + smooth.mO, 0, 0.14)), mS: r3(cur.mS) };
  const mouthKey = JSON.stringify(m);
  if (mouthKey !== face.key) { face.key = mouthKey; updateMouth(m); }
  headFur.userData.uniforms.uBlush.value.w = 0.6 * clamp(cur.blush, 0, 1);

  // shadows
  bodyShadow.scale.setScalar(1 - air * 0.3);
  bodyShadow.material.opacity = bodyShadow.userData.opacity * (1 - air * 0.5);
  bodyShadow.position.x = rig.position.x + sway * 0.6;
  legs.forEach((l, i) => {
    const s = footShadows[i], lift = l.foot.getWorldPosition(_a).y - ANKLE;
    s.position.set(_a.x, 0.005, _a.z + 0.03); s.rotation.z = rig.rotation.y;
    s.material.opacity = s.userData.opacity * clamp(1 - lift / 0.3, 0, 1);
  });

  renderer.render(scene, camera);
  if (++frames === 3) onReady();
}

// draw only while the dog is on screen
const watcher = new IntersectionObserver(([entry]) => renderer.setAnimationLoop(entry.isIntersecting ? tick : null));
watcher.observe(host);

return {
  react,
  dispose() {
    watcher.disconnect();
    resizer.disconnect();
    renderer.setAnimationLoop(null);
    clearTimeout(holdTimer);
    clearTimeout(restTimer);
    removeEventListener('pointermove', follow);
    removeEventListener('pointerdown', follow);
    document.removeEventListener('visibilitychange', onVisibility);
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  },
};
}
