// ========== Configuration & Constants ==========
window.MTECH_CONFIG = {
  // Zoom settings
  ZOOM: {
    FOV_BASE: 58,
    FOV_ZOOM: 45,
    TIGHTNESS: 1.04,
    SPEED_IN: 2.4,
    SPEED_OUT: 8.0,
    SNAP_OUT_EPS: 0.06,
    ENTER_THRESHOLD: 0.92,
    EXIT_THRESHOLD: 0.965
  },

  // Timeline thresholds (0-1)
  TIMELINE: {
    SEEN_20: 0.2,
    SEEN_60: 0.6,
    ZOOM_ENTER: 0.92,
    ZOOM_EXIT: 0.965,
    HANDOVER_START: 0.9,
    PORTAL_ENTER: 0.96,
    PORTAL_LEAVE: 0.945,
    SHOW_PORTAL_AT: 0.96,
    SHOW_PORTAL_ZOOM: 0.9,
    COMPILE_SNAP_AT: 0.9
  },

  // Portal settings
  PORTAL: {
    SCREEN_INNER_SCALE: 0.985,
    SCREEN_INNER_OFFSET_Z: 0.002,
    HANDOVER_MIN_MS: 900,
    HANDOVER_TAIL_MS: 320
  },

  // Input sensitivity
  INPUT: {
    WHEEL_TO_T: 1 / 1200,
    TOUCH_TO_T: 1 / 6000,
    KEYSTEP_T: 0.02
  },

  // Mouse look settings
  LOOK: {
    dead: 0.03,
    power: 1.2,
    smooth: 8,
    yaw: { normal: 0.22, zoom: 0.09 },
    pitch: { normal: 0.12, zoom: 0.06 }
  },

  // Laptop animation
  LAPTOP: {
    DROP_MULT: 0.3,
    ANGLE_CLOSED: 86,
    ANGLE_OPEN: -40,
    LANDING_Y: -0.75
  },

  // Electric Border
  EB: {
    enabled: false,
    quality: 1,
    minFrameMs: 16,
    runners: new Set(),
    booted: false
  },

  // Code compilation text
  CODE: [
    "/* MTECH DIGITAL — GPU init */",
    "const renderer = new WebGLRenderer({ antialias: true, alpha: true })",
    "renderer.setSize(innerWidth, innerHeight)",
    "renderer.setPixelRatio(Math.min(2, devicePixelRatio))",
    "document.body.appendChild(renderer.domElement)",
    "",
    "// Load materials & shaders",
    "const material = new ShaderMaterial({",
    "  vertexShader:   load('shaders/vert.glsl'),",
    "  fragmentShader: load('shaders/frag.glsl'),",
    "  uniforms: { uTime: { value: 0 } }",
    "})",
    "",
    "// Build scene objects...",
    "const mesh = new Mesh(new SphereGeometry(2, 64, 64), material)",
    "scene.add(mesh)",
    "",
    "// GPU pipeline ready.",
    "// Compiling shaders...",
  ].join("\n")
};

window.MTECH_UTILS = window.MTECH_UTILS || {
  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  easeInOut: (t) => t*t*(3-2*t),
  smooth: (cur, target, dt, speed) => cur + (target - cur) * (1 - Math.exp(-speed * dt)),
  // and any other helpers you use
};

window.MTECH_CONFIG = window.MTECH_CONFIG || {
  ZOOM: {
    FOV_BASE: 58,
    FOV_ZOOM: 38,
    SPEED_IN: 8,
    SPEED_OUT: 7,
    TIGHTNESS: 0.98,
    SNAP_OUT_EPS: 0.012,
  },
  LAPTOP: {
    LANDING_Y: -1.1,
    DROP_MULT: 1.0,
    ANGLE_CLOSED: 12,
    ANGLE_OPEN: 115,
  },
  LOOK: {
    dead: 0.03, power: 1.12, smooth: 10,
    yaw:   { normal: 1.8,  zoom: 0.42 },
    pitch: { normal: 1.0,  zoom: 0.32 },
  },
  INPUT: {
    WHEEL_TO_T: 0.0004,
    TOUCH_TO_T: 0.0012,
    KEYSTEP_T:  0.02,
  },
  TIMELINE: {
    ZOOM_ENTER: 0.22,
    SEEN_20:    0.20,
    SEEN_60:    0.60,
    COMPILE_SNAP_AT: 0.65,
    SHOW_PORTAL_AT:  0.90,
    PORTAL_LEAVE:    0.35,
  },
  PORTAL: {
    SCREEN_INNER_SCALE: 1.02,
    SCREEN_INNER_OFFSET_Z: 0.01,
    HANDOVER_MIN_MS: 1200,
    HANDOVER_TAIL_MS: 500,
  },
  CODE: `// your animated code string here\nconst hello="world";\n...`
};


// Global state access
window.getEB = () => window.MTECH_CONFIG.EB;

// Device detection
window.IS_COARSE = matchMedia("(pointer: coarse)").matches;

console.log('[MTECH] Config loaded');