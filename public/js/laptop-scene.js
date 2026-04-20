// ========== Main Laptop Scene - Three.js ==========
import * as THREE from "three";

import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CSS3DRenderer, CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js";

// modal.js is a global script → read the globals safely:
const initModal = window.initModal || (() => {});
const attachModalTriggers = window.attachModalTriggers || (() => {});


// ========== Get Config ==========
const CONFIG = window.MTECH_CONFIG;
const UTILS = window.MTECH_UTILS;
const { clamp, lerp, easeInOut, smooth } = UTILS;

// ========== Global State ==========
let camera, scene, renderer, cssRenderer;
let laptop, hinge, lid, deck, screenPlane, screenObj;
let screenDom, screenCanvas, ctx, screenTex;
let particles, floorGlow, sky;
let keyMeshes = {}, keyStates = new Map();

let zoomStartAt = 0;
let zoomAuto = false;
let zoomLocked = false;
let zoomTarget = 0;
let hasZoomTarget = false;
let zoomVal = 0;
let outBoost = 1;

let startCamPos = null;
let startCamQuat = null;
let targetPos = new THREE.Vector3();
let targetQuat = new THREE.Quaternion();

let phase = "drop";
let vy = 0;
let openT = 0;
let shakeT = 0;

let portalActive = false;
let suppressPortal = false;
let freezeUIUntilUnzoom = false;
let tFreezeMin = CONFIG.TIMELINE.SHOW_PORTAL_AT;

let virtualT = null;
let lastScrollDir = 0;
let prevCharsShown = 0;
let forceCode100 = false;

let handover = { active: false, start: 0, pct: 0 };
let handoverDone = false;
let handoverSuppressed = false;
let deferHidePortal = false;

let GATES = {
  lidOpen: false,
  seen20: false,
  seen60: false,
  compile100: false
};

const screenBasis = {
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  center: new THREE.Vector3(),
  q: new THREE.Quaternion()
};

const lookState = { tx: 0, ty: 0, x: 0, y: 0 };
let baseLookAnchor = new THREE.Vector3(0, 0.8, 0.5);
let anchorCaptured = false;
let _mouseLookActiveNow = false;

let css3dHover;
let __zoomPose = null;

// ========== DOM Elements ==========
const canvas = document.getElementById("webgl");
const copy20L = document.getElementById("copy20L");
const copy20R = document.getElementById("copy20R");
const copy60L = document.getElementById("copy60L");
const copy60R = document.getElementById("copy60R");
const heroIntro = document.querySelector(".hero-intro");
const topCta = document.getElementById("topCta");

// ========== Stage Management ==========
const STAGE_ID = "stage";
let __stageEl = document.getElementById(STAGE_ID);
let __stageWasLocked = false;
let __stagePrevMin = '';
let __stagePrevH = '';
let __savedScrollY = null;

function getStageEl() {
  return __stageEl || document.getElementById(STAGE_ID);
}

function stageBounds() {
  const el = getStageEl();
  if (!el) return { start: 0, end: 1, total: 1 };
  
  const start = el.offsetTop;
  const h = Math.max(
    el.scrollHeight || 0,
    el.offsetHeight || 0,
    el.getBoundingClientRect?.().height || 0
  );
  const rawEnd = start + Math.max(1, h - window.innerHeight);
  const end = Math.max(start + 1, rawEnd);
  
  return { start, end, total: Math.max(1, end - start) };
}

function getStageProgress() {
  const { start, end, total } = stageBounds();
  const y = Math.min(end, Math.max(start, window.scrollY));
  return (y - start) / total;
}

function setStageProgressT(t) {
  const { start, end } = stageBounds();
  const y = Math.round(lerp(start, end, clamp(t, 0, 1)));
  window.scrollTo({ top: y, behavior: "auto" });
}

function lockStageHeight(lock = true) {
  const el = getStageEl();
  if (!el) return;

  if (lock) {
    if (__stageWasLocked) return;
    const h = Math.max(
      el.scrollHeight || 0,
      el.offsetHeight || 0,
      el.getBoundingClientRect?.().height || 0
    );
    __stagePrevMin = el.style.minHeight || '';
    __stagePrevH = el.style.height || '';
    el.style.minHeight = h + 'px';
    el.style.height = h + 'px';
    __stageWasLocked = true;
  } else {
    const restore = () => {
      el.style.minHeight = __stagePrevMin;
      el.style.height = __stagePrevH;
      __stagePrevMin = '';
      __stagePrevH = '';
      __stageWasLocked = false;
    };
    restore();
    requestAnimationFrame(() => restore());
    setTimeout(restore, 250);
  }
}

function disableAnchoringTemp(ms = 240) {
  document.documentElement.style.overflowAnchor = 'none';
  document.body.style.overflowAnchor = 'none';
  setTimeout(() => {
    document.documentElement.style.removeProperty('overflow-anchor');
    document.body.style.removeProperty('overflow-anchor');
  }, ms);
}

// ========== Portal Management ==========
function showPortal() {
  portalActive = true;
  document.body.classList.add('portal-open');
  lockStageHeight(true);
  disableAnchoringTemp(300);
  
  screenObj.visible = true;
  screenDom.classList.add("show");
  screenDom.style.pointerEvents = "auto";
  
  setPortalGlassMode(true);
  setCSS3DPointer(true);
  css3dHover.enable();
  bootElectricBordersOnce();
  
  screenDom.scrollTop = 0;
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fitScreenDomSafe("showPortal");
    });
  });
  
  console.log('[MTECH] Portal opened');
}

function hidePortal(suppress = true) {
  const EB = window.getEB();
  if (EB) {
    EB.runners.clear();
    EB.enabled = false;
    document.querySelectorAll('canvas.eb-canvas').forEach(cv => {
      const ctx = cv.getContext?.('2d');
      ctx?.clearRect(0, 0, cv.width, cv.height);
    });
  }

  disableAnchoringTemp(300);
  
  portalActive = false;
  document.body.classList.remove("portal-open");
  
  screenObj.visible = false;
  screenDom.classList.remove("show");
  screenDom.style.pointerEvents = "none";
  
  if (suppress) suppressPortal = true;
  
  setPortalGlassMode(false);
  setCSS3DPointer(false);
  css3dHover.disable();
  
  console.log('[MTECH] Portal closed');
}

function setPortalGlassMode(on) {
  if (!screenDom) return;
  
  if (on) {
    screenDom.classList.add("glass");
  } else {
    screenDom.classList.remove("glass");
  }
}

// ========== CSS3D Pointer Management ==========
let __peManual = null;

function setCSS3DPointer(on) {
  if (!cssRenderer?.domElement) return;
  __peManual = on ? 'auto' : 'none';

  const root = cssRenderer.domElement;
  const val = __peManual;
  
  if (root.style.pointerEvents !== val) {
    root.style.pointerEvents = val;
    const cam = root.firstElementChild;
    if (cam) cam.style.pointerEvents = val;
    const obj = cam?.firstElementChild;
    if (obj) obj.style.pointerEvents = val;
  }
  
  if (screenDom) screenDom.style.pointerEvents = val;
  if (canvas) canvas.style.pointerEvents = on ? 'none' : 'auto';
}

window.setCSS3DPointer = setCSS3DPointer;

// ========== Screen Fitting ==========
let __fitBasisW = 0;
let __fitBasisH = 0;
let __fitLocked = false;
let __fitRAF = 0;
let __fitTimer = 0;

function resetFitBasis() {
  __fitBasisW = 0;
  __fitBasisH = 0;
  __fitLocked = false;
}

function captureFitBasis() {
  if (!screenObj?.visible) return;
  const w = screenDom?.offsetWidth | 0;
  const h = screenDom?.offsetHeight | 0;
  
  if (w > 200 && h > 150) {
    __fitBasisW = Math.max(__fitBasisW, w);
    __fitBasisH = Math.max(__fitBasisH, h);
    __fitLocked = true;
  }
}

function fitScreenDom() {
  const screenW = 7.8;
  const screenH = 5.5;
  const SCALE = CONFIG.PORTAL.SCREEN_INNER_SCALE;
  const OFFSET_Z = CONFIG.PORTAL.SCREEN_INNER_OFFSET_Z;
  
  const pxW = __fitBasisW || screenDom.scrollWidth || screenDom.offsetWidth || 1000;
  const pxH = __fitBasisH || screenDom.scrollHeight || screenDom.offsetHeight || 640;

  const s = Math.min(screenW / pxW, screenH / pxH) * SCALE;
  screenObj.scale.set(s, s, 1);
  screenObj.position.set(
    screenPlane.position.x,
    screenPlane.position.y,
    screenPlane.position.z + OFFSET_Z
  );
  screenObj.quaternion.copy(screenPlane.quaternion);
}

function fitScreenDomSafe(reason = "") {
  if (document.querySelector('.mtk-modal.is-open')) return;

  cancelAnimationFrame(__fitRAF);
  clearTimeout(__fitTimer);

  __fitRAF = requestAnimationFrame(() => {
    const hiddenOrZero =
      !screenObj?.visible ||
      screenDom.offsetWidth === 0 ||
      screenDom.offsetHeight === 0 ||
      getComputedStyle(cssRenderer.domElement).pointerEvents === 'none';

    if (hiddenOrZero) {
      __fitTimer = setTimeout(() => {
        fitScreenDom();
        refitZoomTargetNow();
      }, 150);
    } else {
      requestAnimationFrame(() => {
        captureFitBasis();
        fitScreenDom();
        __fitTimer = setTimeout(refitZoomTargetNow, 60);
      });
    }
    setCSS3DPointer(false);
  });
}

window.fitScreenDomSafe = fitScreenDomSafe;
window.resetFitBasis = resetFitBasis;

// ========== Zoom & Camera Management ==========
function computeScreenBasis() {
  screenPlane.updateWorldMatrix(true, true);
  screenPlane.getWorldQuaternion(screenBasis.q);
  screenPlane.getWorldPosition(screenBasis.center);
  
  screenBasis.right
    .set(1, 0, 0)
    .applyQuaternion(screenBasis.q)
    .normalize();
  screenBasis.up
    .set(0, 1, 0)
    .applyQuaternion(screenBasis.q)
    .normalize();
  screenBasis.normal
    .set(0, 0, 1)
    .applyQuaternion(screenBasis.q)
    .normalize();
}

function computeZoomTargetOnce() {
  const prevFov = camera.fov;
  camera.fov = CONFIG.ZOOM.FOV_ZOOM;
  camera.updateProjectionMatrix();

  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  
  screenPlane.updateWorldMatrix(true, true);
  screenPlane.getWorldPosition(worldPos);
  screenPlane.getWorldQuaternion(worldQuat);
  screenPlane.getWorldScale(worldScale);
  
  const screenCenterWorld = worldPos.clone();
  const normal = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(worldQuat)
    .normalize();
  
  const toCam = (startCamPos ?? camera.position).clone().sub(worldPos);
  if (toCam.dot(normal) < 0) normal.multiplyScalar(-1);

  const screenW = 7.8;
  const screenH = 5.5;
  const worldW = screenW * worldScale.x;
  const worldH = screenH * worldScale.y;
  
  const w = renderer.domElement.clientWidth || window.innerWidth || 1;
  const h = renderer.domElement.clientHeight || window.innerHeight || 1;
  const aspect = h > 0 ? w / h : camera.aspect;

  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distV = worldH / 2 / Math.tan(vFov / 2);
  const distH = worldW / 2 / Math.tan(hFov / 2);

  const fitDist = Math.max(distV, distH);
  let dist = fitDist + 0.02;
  dist *= CONFIG.ZOOM.TIGHTNESS;

  targetPos.copy(worldPos).addScaledVector(normal, dist);
  
  const lh = new THREE.Object3D();
  lh.up.set(0, 1, 0);
  lh.position.copy(targetPos);
  lh.lookAt(worldPos);
  targetQuat.copy(lh.quaternion);

  camera.fov = prevFov;
  camera.updateProjectionMatrix();
}

function refitZoomTargetNow() {
  const w = canvas?.clientWidth | 0;
  const h = canvas?.clientHeight | 0;
  
  if (!renderer || !camera || w < 10 || h < 10) {
    requestAnimationFrame(refitZoomTargetNow);
    return;
  }
  
  resizeRenderer();
  fitCamera();
  computeZoomTargetOnce();

  const inZoom = zoomLocked || (zoomAuto && zoomTarget === 1);
  if (inZoom) {
    camera.position.copy(targetPos);
    camera.quaternion.copy(targetQuat);
    camera.fov = CONFIG.ZOOM.FOV_ZOOM;
    camera.updateProjectionMatrix();
    camera.lookAt(screenBasis.center);
  }
}

window.refitZoomTargetNow = refitZoomTargetNow;

function hasReachedStartPose() {
  if (!startCamPos || !startCamQuat) return false;
  const posOk = camera.position.distanceToSquared(startCamPos) < 0.0025;
  const angOk = 1 - Math.abs(camera.quaternion.dot(startCamQuat)) < 1e-3;
  return posOk && angOk;
}

function zoomPrereqsMet() {
  return GATES.lidOpen && GATES.seen20 && GATES.seen60 && GATES.compile100;
}

function canBeginZoom() {
  return !zoomLocked && !zoomAuto && !handover.active && 
         !freezeUIUntilUnzoom && zoomPrereqsMet();
}

function portalAllowed() {
  return !portalActive && !suppressPortal && !freezeUIUntilUnzoom && 
         !zoomAuto && !handover.active;
}

function beginZoom(force = false) {
  if (zoomAuto || zoomLocked) return;
  
  suppressPortal = false;
  zoomStartAt = performance.now();
  zoomTarget = 1;
  zoomAuto = true;
  hasZoomTarget = false;
  zoomVal = 0;
  phase = "ready";
  
  startCamPos = camera.position.clone();
  startCamQuat = camera.quaternion.clone();

  resizeRenderer();
  fitCamera();
  computeZoomTargetOnce();
  hasZoomTarget = true;

  requestAnimationFrame(() => {
    computeZoomTargetOnce();
  });
  requestAnimationFrame(refitZoomTargetNow);

  if (force) lastScrollDir = 1;
  
  console.log('[MTECH] Zoom started');
}

function beginUnzoomFromPortal() {
  if (!portalActive) return;
  
  freezeUIUntilUnzoom = true;
  tFreezeMin = Math.max(CONFIG.TIMELINE.SHOW_PORTAL_AT, getStageProgress());

  suppressPortal = true;
  deferHidePortal = true;

  setCSS3DPointer(false);
  const root = cssRenderer?.domElement;
  if (root) root.style.opacity = "0";

  lastScrollDir = -1;
  zoomTarget = 0;
  zoomAuto = true;
  outBoost = 2.2;

  const base = virtualT ?? getStageProgress();
  setVirtualT(base - 0.02);
  
  console.log('[MTECH] Unzoom from portal started');
}

function setVirtualT(t) {
  virtualT = clamp(t, 0, 1);
  setStageProgressT(virtualT);
  if (virtualT <= 0.001) virtualT = null;

  if (!freezeUIUntilUnzoom && !zoomAuto && virtualT < CONFIG.TIMELINE.PORTAL_LEAVE) {
    suppressPortal = false;
  }
}

function nudgeT(deltaT) {
  const base = virtualT ?? getStageProgress();
  setVirtualT(base + deltaT);
  const tNow = virtualT ?? getStageProgress();
  
  if (canBeginZoom() && tNow >= CONFIG.TIMELINE.ZOOM_ENTER) {
    beginZoom();
  }
}

// ========== Handover Animation ==========
function startHandover() {
  if (handover.active || !zoomLocked || handoverDone) return;
  
  handover.active = true;
  handover.start = performance.now();
  handover.pct = 0;
  handoverDone = true;
  
  if (portalActive) hidePortal(true);
  
  console.log('[MTECH] Handover started');
}

function stopHandover() {
  handover.active = false;
  handover.pct = 0;
  console.log('[MTECH] Handover stopped');
}

// ========== Gate Management ==========
function lidFullyOpen() {
  return phase === "ready" && openT >= 1;
}

function updateGates(t) {
  GATES.lidOpen = lidFullyOpen();
  if (t >= CONFIG.TIMELINE.SEEN_20) GATES.seen20 = true;
  if (t >= CONFIG.TIMELINE.SEEN_60) GATES.seen60 = true;
  GATES.compile100 = t >= CONFIG.TIMELINE.SHOW_PORTAL_AT || !!forceCode100;
}

// ========== Mouse Look ==========
function applyDeadZone(v) {
  const a = Math.abs(v);
  if (a < CONFIG.LOOK.dead) return 0;
  const s = Math.sign(v);
  return s * Math.pow(a, CONFIG.LOOK.power);
}

function handleMouseLook(e) {
  const rect = canvas.getBoundingClientRect();
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  lookState.tx = applyDeadZone(nx);
  lookState.ty = applyDeadZone(ny);
}

if (!window.IS_COARSE) {
  window.addEventListener("mousemove", handleMouseLook, { passive: true });
  window.addEventListener("mouseleave", () => {
    lookState.tx = 0;
    lookState.ty = 0;
  }, { passive: true });
}

// ========== Hard Reset ==========
const INIT_CAM_POS = new THREE.Vector3();
const INIT_CAM_QUAT = new THREE.Quaternion();

function hardReset(reason = "") {
  console.log('[MTECH] Hard reset:', reason);
  
  zoomAuto = false;
  zoomLocked = false;
  zoomTarget = 0;
  hasZoomTarget = false;
  freezeUIUntilUnzoom = false;
  suppressPortal = false;
  outBoost = 1;
  handover.active = false;
  handover.pct = 0;
  forceCode100 = false;
  virtualT = null;
  lastScrollDir = 0;
  prevCharsShown = 0;

  try { hidePortal(true); } catch {}
  
  const EB = window.getEB?.();
  if (EB) {
    EB.runners.clear();
    EB.enabled = false;
    EB._last = 0;
  }

  if (camera) {
    camera.position.copy(INIT_CAM_POS);
    camera.quaternion.copy(INIT_CAM_QUAT);
    camera.fov = CONFIG.ZOOM.FOV_BASE;
    camera.updateProjectionMatrix();
  }
}

window.addEventListener("pageshow", (e) => {
  requestAnimationFrame(() => {
    if (e.persisted) hardReset("bfcache");
    try { setStageProgressT?.(0); } catch {}
    window.scrollTo(0, 0);
    refitZoomTargetNow();
  });
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    requestAnimationFrame(() => {
      if (!zoomLocked && !zoomAuto) {
        virtualT = null;
        lastScrollDir = 0;
        if (camera) {
          camera.fov = CONFIG.ZOOM.FOV_BASE;
          camera.updateProjectionMatrix();
        }
      }
      refitZoomTargetNow();
    });
  }
});

console.log('[MTECH] Zoom & Camera management loaded');

// ========== Three.js Scene Setup ==========
function initRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  
  console.log('[MTECH] WebGL renderer initialized');
}

function initCSS3DRenderer() {
  cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
  cssRenderer.domElement.classList.add("css3d-root");
  cssRenderer.domElement.style.position = "fixed";
  cssRenderer.domElement.style.inset = "0";
  cssRenderer.domElement.style.zIndex = "50";
  cssRenderer.domElement.style.pointerEvents = "none";
  cssRenderer.domElement.style.background = "transparent";
  
  document.body.appendChild(cssRenderer.domElement);
  
  (function manageCss3dHitTest() {
    const root = cssRenderer.domElement;
    function apply() {
      const on = document.body.classList.contains('portal-open');
      const val = on ? 'auto' : 'none';
      root.style.pointerEvents = val;
      const cam = root.firstElementChild;
      const obj = cam && cam.firstElementChild;
      if (cam) cam.style.pointerEvents = val;
      if (obj) obj.style.pointerEvents = val;
    }
    apply();
    new MutationObserver(apply).observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  })();
  
  console.log('[MTECH] CSS3D renderer initialized');
}

function resizeRenderer() {
  const w = canvas?.clientWidth || window.innerWidth;
  const h = canvas?.clientHeight || window.innerHeight;
  
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h, false);
  
  if (cssRenderer) cssRenderer.setSize(w, h);
  if (screenDom) fitScreenDomSafe('resizeRenderer');
}

function initScene() {
  scene = new THREE.Scene();
  
  camera = new THREE.PerspectiveCamera(
    CONFIG.ZOOM.FOV_BASE,
    canvas.clientWidth / canvas.clientHeight,
    0.05,
    200
  );
  
  camera.position.set(0, 5.5, 12.6);
  camera.lookAt(0, 2.8, 0.5);
  camera.up.set(0, 1, 0);
  
  INIT_CAM_POS.copy(camera.position);
  INIT_CAM_QUAT.copy(camera.quaternion);
  
  console.log('[MTECH] Scene and camera initialized');
}

function fitCamera() {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
}

function initLighting() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  pmrem.dispose();
  
  scene.add(new THREE.AmbientLight(0xffffff, 0.28));
  
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(-2.4, 6.0, 6.0);
  scene.add(key);
  
  const rim = new THREE.DirectionalLight(0xffffff, 0.55);
  rim.position.set(3.5, 4.5, -4.0);
  scene.add(rim);
  
  console.log('[MTECH] Lighting initialized');
}

function initSky() {
  const skyGeo = new THREE.SphereGeometry(80, 64, 64);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uC1: { value: new THREE.Color(0x081525) },
      uC2: { value: new THREE.Color(0x0a1b33) },
      uA1: { value: new THREE.Color(0x00e5ff) },
      uA2: { value: new THREE.Color(0xb85cff) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      varying vec3 vPos;
      uniform float uTime;
      uniform vec3 uC1, uC2, uA1, uA2;
      
      float hash(vec2 p){ 
        return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); 
      }
      
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        float a = hash(i);
        float b = hash(i+vec2(1,0));
        float c = hash(i+vec2(0,1));
        float d = hash(i+vec2(1,1));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
      }
      
      void main(){
        vec3 n = normalize(vPos);
        float g = smoothstep(-0.7, 0.9, n.y);
        vec3 base = mix(uC1, uC2, g);
        
        float t = uTime * 0.06;
        float band = noise(n.xz*1.4 + t) * 0.5 + noise(n.zy*2.0 - t*0.7)*0.5;
        band = smoothstep(0.82, 0.98, band);
        
        vec3 accent = mix(uA2, uA1, g);
        vec3 col = base + accent * band * 0.12;
        
        float r = length(n.xz);
        col *= 1.0 - smoothstep(0.95, 1.7, r) * 0.25;
        
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  
  sky = new THREE.Mesh(skyGeo, skyMat);
  sky.visible = false;
  scene.add(sky);
  
  window.skyMat = skyMat;
  
  console.log('[MTECH] Sky initialized');
}

function initFloorGlow() {
  function makeRadialTex(hex = 0x00e5ff) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const r = (hex >> 16) & 255;
    const gg = (hex >> 8) & 255;
    const b = hex & 255;
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 122);
    grd.addColorStop(0.0, `rgba(${r},${gg},${b},0.95)`);
    grd.addColorStop(0.55, `rgba(${r},${gg},${b},0.28)`);
    grd.addColorStop(1.0, `rgba(${r},${gg},${b},0.00)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  floorGlow = new THREE.Mesh(
    new THREE.CircleGeometry(34, 96),
    new THREE.MeshBasicMaterial({
      map: makeRadialTex(0x248fa2),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  
  floorGlow.rotation.set(-Math.PI / 2, 0, 0);
  floorGlow.position.set(0, -2.4, 0);
  floorGlow.renderOrder = -2;
  scene.add(floorGlow);
  
  console.log('[MTECH] Floor glow initialized');
}

console.log('[MTECH] Scene setup loaded');

// ========== Laptop Model Creation ==========
function makeBrushedTex({ w = 1024, h = 256, base = "#0f2846", sheen = "#1b3c63", 
                         dir = "x", repeatX = 2, repeatY = 1 } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  
  const grad = g.createLinearGradient(0, 0, dir === "x" ? w : 0, dir === "x" ? 0 : h);
  grad.addColorStop(0, base);
  grad.addColorStop(1, sheen);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  
  g.globalAlpha = 0.09;
  g.fillStyle = "#ffffff";
  const lines = Math.floor((dir === "x" ? h : w) * 0.45);
  
  for (let i = 0; i < lines; i++) {
    const t = i / (lines - 1);
    const a = 0.6 + Math.random() * 0.4;
    if (dir === "x") {
      const y = Math.floor(t * h);
      g.fillRect(0, y, w, 1);
      g.globalAlpha = 0.06 * a;
    } else {
      const x = Math.floor(t * w);
      g.fillRect(x, 0, 1, h);
      g.globalAlpha = 0.06 * a;
    }
  }
  
  g.globalAlpha = 1;
  const grd2 = g.createLinearGradient(0, 0, w, h);
  grd2.addColorStop(0.0, "rgba(255,255,255,0.00)");
  grd2.addColorStop(0.5, "rgba(255,255,255,0.03)");
  grd2.addColorStop(1.0, "rgba(0,0,0,0.00)");
  g.fillStyle = grd2;
  g.fillRect(0, 0, w, h);

  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatX, repeatY);
  map.colorSpace = THREE.SRGBColorSpace;

  const cb = document.createElement("canvas");
  cb.width = w;
  cb.height = h;
  const gb = cb.getContext("2d");
  gb.drawImage(c, 0, 0);
  gb.globalCompositeOperation = "saturation";
  gb.fillStyle = "#808080";
  gb.fillRect(0, 0, w, h);
  
  const bump = new THREE.CanvasTexture(cb);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(repeatX, repeatY);

  return { map, bump };
}

function makeSoftMat({ w = 1024, h = 1024, base = "#0b1f33", grain = "#143553", 
                       noise = 0.06, repeat = 1 } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, base);
  grd.addColorStop(1, grain);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  
  const n = Math.floor(w * h * noise * 0.15);
  const img = g.getImageData(0, 0, w, h);
  const data = img.data;
  
  for (let i = 0; i < n; i++) {
    const x = (Math.random() * w) | 0;
    const y = (Math.random() * h) | 0;
    const idx = (y * w + x) * 4;
    const v = 210 + ((Math.random() * 40) | 0);
    data[idx] = data[idx + 1] = data[idx + 2] = v;
    data[idx + 3] = 20;
  }
  
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  
  return tex;
}

function makeGridTex({ w = 512, h = 512, gap = 6, alpha = 0.08 } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  
  g.fillStyle = "rgba(255,255,255," + alpha + ")";
  for (let y = 1; y < h; y += gap) {
    for (let x = 1; x < w; x += gap) {
      g.fillRect(x, y, 1, 1);
    }
  }
  
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  
  return t;
}

function initLaptop() {
  laptop = new THREE.Group();
  scene.add(laptop);
  
  const landingY = CONFIG.LAPTOP.LANDING_Y;
  laptop.scale.set(1.05, 1.05, 1.05);
  laptop.position.set(0, 8.5, 0);
  laptop.rotation.x = THREE.MathUtils.degToRad(-2);

  const deckW = 8.5;
  const deckD = 5.32;
  const deckH = 0.31;
  const screenW = 7.8;
  const screenH = 5.5;
  const frame = 0.12;
  const frameDepth = 0.25;

  const gridTex = makeGridTex();
  
  const matDeck = new THREE.MeshStandardMaterial({
    color: 0x0d1e33,
    metalness: 0.75,
    roughness: 0.42,
    map: gridTex,
    envMapIntensity: 0.7,
  });

  const matFrameLid = new THREE.MeshStandardMaterial({
    color: 0x162e4b,
    metalness: 0.65,
    roughness: 0.42,
    envMapIntensity: 0.9,
  });

  deck = new THREE.Mesh(
    new THREE.BoxGeometry(deckW, deckH, deckD),
    matDeck
  );
  deck.position.y = landingY + deckH / 2;
  laptop.add(deck);

  hinge = new THREE.Group();
  hinge.position.set(0, landingY + deckH + 0.07, -deckD / 2 + 0.015);
  laptop.add(hinge);

  lid = new THREE.Group();
  hinge.add(lid);

  const frameOuter = new THREE.Mesh(
    new THREE.BoxGeometry(screenW + frame * 2, screenH + frame * 2, frameDepth),
    matFrameLid
  );
  frameOuter.position.set(0, screenH / 2 + frame, -frameDepth / 2);
  lid.add(frameOuter);

  initScreenCanvas();
  
  screenPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(screenW, screenH),
    new THREE.MeshBasicMaterial({
      map: screenTex,
      toneMapped: false,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
      colorWrite: true
    })
  );
  
  screenPlane.position.set(0, screenH / 2 + frame, frameDepth * 0.51);
  lid.add(screenPlane);

  hinge.rotation.x = THREE.MathUtils.degToRad(CONFIG.LAPTOP.ANGLE_CLOSED);

  console.log('[MTECH] Laptop model created');
}

function initScreenCanvas() {
  const DPR = Math.min(3, window.devicePixelRatio || 1);
  const CANVAS_H = 640;
  const CANVAS_W = Math.round(CANVAS_H * (7.8 / 5.5));
  
  screenCanvas = document.createElement("canvas");
  screenCanvas.width = CANVAS_W * DPR;
  screenCanvas.height = CANVAS_H * DPR;
  
  ctx = screenCanvas.getContext("2d");
  ctx.scale(DPR, DPR);

  screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
}

function simulateDrop(dt) {
  const gravity = -28 * CONFIG.LAPTOP.DROP_MULT;
  vy += gravity * dt;
  laptop.position.y += vy * dt;
  
  if (laptop.position.y <= CONFIG.LAPTOP.LANDING_Y) {
    laptop.position.y = CONFIG.LAPTOP.LANDING_Y;
    vy = 0;
    phase = "shake";
    shakeT = 1.0;
  }
}

function simulateShake(dt) {
  shakeT = Math.max(0, shakeT - dt * 1.7);
  const s = shakeT * shakeT;
  laptop.rotation.z = Math.sin(performance.now() * 0.04) * 0.04 * s;
  
  if (shakeT === 0) phase = "open";
}

function animateOpen(dt) {
  openT = Math.min(1, openT + dt * 0.9);
  const a = lerp(
    CONFIG.LAPTOP.ANGLE_CLOSED,
    CONFIG.LAPTOP.ANGLE_OPEN,
    UTILS.easeOut(openT)
  );
  hinge.rotation.x = THREE.MathUtils.degToRad(a);
  
  if (openT >= 1) {
    phase = "ready";
    if (!anchorCaptured) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      baseLookAnchor.copy(camera.position).addScaledVector(dir, 10);
      anchorCaptured = true;
    }
  }
}

function initKeyboard() {
  const keysGroup = new THREE.Group();
  laptop.add(keysGroup);
  
  const landingY = CONFIG.LAPTOP.LANDING_Y;
  const U = 0.37;
  const Hk = 0.17;
  const Dk = 0.63;
  const gapX = 0.095;
  const gapZ = 0.2;
  const startZ = 1.45;
  
  const rows = [
    [["ESC",1],["1",1],["2",1],["3",1],["4",1],["5",1],["6",1],["7",1],["8",1],["9",1],["0",1],["-",1],["=",1],["BACK",2]],
    [["TAB",1.5],["Q",1],["W",1],["E",1],["R",1],["T",1],["Y",1],["U",1],["I",1],["O",1],["P",1],["[",1],["]",1],["\\",1.5]],
    [["CAPS",1.75],["A",1],["S",1],["D",1],["F",1],["G",1],["H",1],["J",1],["K",1],["L",1],[";",1],["'",1],["ENTER",2.25]],
    [["SHIFT",2.25],["Z",1],["X",1],["C",1],["V",1],["B",1],["N",1],["M",1],[",",1],[".",1],["/",1],["SHF_R",2.5]],
    [["CTL",1.25],["ALT",1.25],["SPACE",6],["ALT_R",1.25],["CTL_R",1.25]]
  ];
  
  const keyMat = new THREE.MeshStandardMaterial({
    color: 0xa3cef1,
    metalness: 0.02,
    roughness: 0.94,
    envMapIntensity: 0.22
  });

  function rowTotalWidth(r) {
    const n = rows[r].length;
    const units = rows[r].reduce((s, [, u]) => s + u * U, 0);
    return units + gapX * Math.max(0, n - 1);
  }

  function addKeyAt(label, units, r, xCenter) {
    const keyWidth = U * units + gapX * (units - 1);
    const key = new THREE.Mesh(
      new THREE.BoxGeometry(keyWidth, Hk, Dk),
      keyMat.clone()
    );
    
    const z = startZ - (rows.length - 1 - r) * (Dk + gapZ);
    const y = landingY + 0.31 + 0.016;
    
    key.position.set(xCenter, y, z);
    key.userData.y0 = y;
    key.userData.label = label;
    
    keysGroup.add(key);
    keyMeshes[label] = key;
    
    return keyWidth;
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const total = rowTotalWidth(r);
    let cursor = -total / 2;
    
    for (let i = 0; i < row.length; i++) {
      const [lbl, u] = row[i];
      const w = addKeyAt(lbl, u, r, cursor + (U * u + gapX * (u - 1)) / 2);
      cursor += w + (i < row.length - 1 ? gapX : 0);
    }
  }
  
  console.log('[MTECH] Keyboard created');
}

function pressKey(label) {
  const key = keyMeshes[label];
  if (!key) return;
  
  let st = keyStates.get(key);
  if (!st) {
    st = { t: 0, phase: 1 };
    keyStates.set(key, st);
  } else {
    st.t = 0;
    st.phase = 1;
  }
}

function updateKeys(dt) {
  for (const [key, st] of keyStates) {
    if (st.phase !== 1) continue;
    st.t += dt;
    
    const pressDur = 0.07;
    const holdDur = 0.04;
    const releaseDur = 0.12;
    const depth = -0.028;
    
    let off = 0;
    if (st.t < pressDur) {
      const k = st.t / pressDur;
      off = depth * (k * k * (3 - 2 * k));
    } else if (st.t < pressDur + holdDur) {
      off = depth;
    } else if (st.t < pressDur + holdDur + releaseDur) {
      const k = (st.t - pressDur - holdDur) / releaseDur;
      off = depth * (1 - k * k * (3 - 2 * k));
    } else {
      key.position.y = key.userData.y0;
      keyStates.delete(key);
      continue;
    }
    
    key.position.y = key.userData.y0 + off;
  }
}

function charToKeyLabel(ch) {
  if (!ch) return null;
  if (ch === "\n") return "ENTER";
  if (ch === "\t") return "TAB";
  if (ch === " ") return "SPACE";
  if (/[a-z]/i.test(ch)) return ch.toUpperCase();
  if (/[0-9]/.test(ch)) return ch;
  
  const map = {
    "-": "-", "=": "=", "[": "[", "]": "]", "\\": "\\",
    ";": ";", "'": "'", ",": ",", ".": ".", "/": "/"
  };
  
  return map[ch] || null;
}

const fallbackKeys = ["A", "S", "D", "F", "J", "K", "L", ";"];

function randomFallbackKey() {
  for (let i = 0; i < fallbackKeys.length; i++) {
    const lbl = fallbackKeys[(Math.random() * fallbackKeys.length) | 0];
    if (keyMeshes[lbl]) return lbl;
  }
  return Object.keys(keyMeshes)[0];
}

console.log('[MTECH] Laptop module loaded');

// ========== Screen Drawing ==========
function drawScreen(chars, pct) {
  const DPR = Math.min(3, window.devicePixelRatio || 1);
  const w = screenCanvas.width / DPR;
  const h = screenCanvas.height / DPR;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.scale(DPR, DPR);

  const ZOOMED = zoomLocked || zoomAuto;
  const showBG = !portalActive;

  if (showBG) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b1f3a");
    g.addColorStop(0.6, "#0a1b33");
    g.addColorStop(1, "#08182c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  const displayPct = pct;
  const p = clamp(displayPct / 100, 0, 1);

  const progressH = Math.round(ZOOMED ? 48 : 66);
  const padX = Math.round(w * 0.06);
  const padY = Math.round(h * 0.08);
  const usableW = w - padX * 5;
  const usableH = h - padY * 5 - progressH;

  const BASE_TARGET_LINES = 3;
  let fs = Math.floor(usableH / BASE_TARGET_LINES);
  fs = Math.max(3, Math.min(24, fs));
  if (ZOOMED) fs = Math.round(fs * 0.82);

  const lh = Math.round(fs * 1.32);
  ctx.font = `800 ${fs}px ui-monospace,Consolas,Menlo,monospace`;
  ctx.fillStyle = "#00e5ff";
  ctx.textAlign = "left";

  const charW = ctx.measureText("M").width;
  const maxChars = Math.max(8, Math.floor(usableW / charW));

  const raw = CONFIG.CODE.slice(0, chars).split("\n");
  const wrapped = [];
  
  for (const line of raw) {
    if (line.length <= maxChars) {
      wrapped.push(line);
    } else {
      for (let i = 0; i < line.length; i += maxChars) {
        wrapped.push(line.slice(i, i + maxChars));
      }
    }
  }

  let y = padY + fs;
  for (const line of wrapped) {
    if (y > padY + usableH - fs) break;
    ctx.fillText(line, padX, y);
    y += lh;
  }

  if (freezeUIUntilUnzoom && zoomTarget === 0) {
    screenTex.needsUpdate = true;
    return;
  }

  const progTop = h - progressH + 10;
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fillRect(0, progTop, w, progressH);

  ctx.fillStyle = "#a8f4ff";
  ctx.font = `700 ${Math.round(fs * 0.75)}px ui-monospace,Consolas,monospace`;
  ctx.fillText("Compiling shaders", padX, progTop + 24);

  const barX = padX;
  const barY = progTop + 34;
  const barW = w - padX * 2;
  const barH = ZOOMED ? 12 : 14;
  
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.fillRect(barX, barY, barW, barH);

  const fillW = Math.round(barW * p);
  const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
  grad.addColorStop(0, "rgba(0,229,255,1)");
  grad.addColorStop(1, "rgba(104,227,255,0.9)");
  ctx.fillStyle = grad;
  ctx.fillRect(barX, barY, fillW, barH);

  ctx.fillStyle = "#cfffff";
  ctx.textAlign = "right";
  ctx.fillText(`${Math.floor(displayPct)}%`, barX + barW, progTop + 24);

  screenTex.needsUpdate = true;
}

function drawInterstitial(pct) {
  const DPR = Math.min(3, window.devicePixelRatio || 1);
  const w = screenCanvas.width / DPR;
  const h = screenCanvas.height / DPR;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.scale(DPR, DPR);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0b1f3a");
  g.addColorStop(0.6, "#0a1b33");
  g.addColorStop(1, "#08182c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const glassOn = portalActive;
  if (glassOn) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    screenTex.needsUpdate = true;
    return;
  }

  ctx.fillStyle = "#cfffff";
  ctx.font = `700 28px ui-sans-serif,system-ui`;
  ctx.textAlign = "center";
  ctx.fillText("Se pregătește pagina web…", w / 2, h * 0.42);

  const barW = Math.min(560, w * 0.7);
  const barH = 16;
  const barX = (w - barW) / 2;
  const barY = h * 0.5;
  
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.fillRect(barX, barY, barW, barH);

  const fillW = Math.round(barW * clamp(pct / 100, 0, 1));
  const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
  grad.addColorStop(0, "rgba(0,229,255,1)");
  grad.addColorStop(1, "rgba(104,227,255,0.9)");
  ctx.fillStyle = grad;
  ctx.fillRect(barX, barY, Math.max(2, fillW), barH);

  ctx.fillStyle = "#a8f4ff";
  ctx.font = `700 18px ui-monospace,Consolas,Menlo`;
  ctx.fillText(`${Math.round(pct)}%`, w / 2, barY + 42);

  screenTex.needsUpdate = true;
}

// ========== Portal DOM Content ==========
function initPortalContent() {
  screenDom = document.createElement("div");
  screenDom.className = "screen-site";
  window.screenDom = screenDom;
  
  initModal();

screenDom.innerHTML = getPortalContentHTML();
setupPortalInteractivity();

  screenObj = new CSS3DObject(screenDom);
  screenObj.visible = false;
  screenObj.position.copy(screenPlane.position);
  screenObj.quaternion.copy(screenPlane.quaternion);
  lid.add(screenObj);

  fitScreenDom();
  requestAnimationFrame(() => fitScreenDom());
  
  screenDom.style.pointerEvents = "auto";
  
  console.log('[MTECH] Portal content initialized');
}
function getPortalContentHTML() {
  return `
    <!-- Hero Section -->
    <div class="container hero-portal">
      <h1 class="portal-title">Platforma Ta de Management Inteligent</h1>
      <p class="portal-subtitle">Soluții enterprise pentru digitalizarea completă a afacerii tale</p>
    </div>

    <!-- Tehnologii Section -->
    <div class="container tech">
      <h2>Tehnologii de Vârf</h2>
      <p class="tagline">Stack-ul nostru tehnologic asigură performanță, scalabilitate și securitate maximă</p>
      
      <div class="grid grid-3">
        <div class="card c1 eb">
          <div class="card-icon">🤖</div>
          <h3>AI & Machine Learning</h3>
          <ul>
            <li>TensorFlow Lite pentru Android</li>
            <li>Google ML Kit pentru OCR</li>
            <li>Firebase ML pentru predicții</li>
            <li>Procesare avansată a documentelor</li>
          </ul>
        </div>
        
        <div class="card c2 eb">
          <div class="card-icon">🔥</div>
          <h3>Firebase Integration</h3>
          <ul>
            <li>Firestore pentru date în timp real</li>
            <li>Authentication & Security Rules</li>
            <li>Cloud Functions pentru logică business</li>
            <li>Cloud Storage pentru fișiere</li>
          </ul>
        </div>
        
        <div class="card c3 eb">
          <div class="card-icon">📱</div>
          <h3>Android Native</h3>
          <ul>
            <li>Kotlin pentru performanță maximă</li>
            <li>Jetpack Compose UI modern</li>
            <li>Material Design 3 guidelines</li>
            <li>Offline-first architecture</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Demo Section -->
    <div class="container demos">
      <h2>Demo Interactive</h2>
      <p class="tagline">Explorează capabilitățile platformei noastre</p>
      
      <div class="grid grid-2">
        <div class="card demo-card eb">
          <div class="demo-preview">
            <div class="demo-icon">📊</div>
          </div>
          <h3>Dashboard Analytics</h3>
          <p>Rapoarte în timp real cu vizualizări interactive și export complet</p>
          <a href="dezvoltatori.html" class="glass-btn js-no-modal">Vezi demo</a>
        </div>
        
        <div class="card demo-card eb">
          <div class="demo-preview">
            <div class="demo-icon">📋</div>
          </div>
          <h3>Document Scanner</h3>
          <p>OCR inteligent cu extragere automată de date și validare</p>
          <a href="dezvoltatori.html" class="glass-btn js-no-modal">Vezi demo</a>
        </div>
        
        <div class="card demo-card eb">
          <div class="demo-preview">
            <div class="demo-icon">👥</div>
          </div>
          <h3>Team Management</h3>
          <p>Organizare multi-nivel cu permisiuni granulare și audit trail</p>
          <a href="dezvoltatori.html" class="glass-btn js-no-modal">Vezi demo</a>
        </div>
        
        <div class="card demo-card eb">
          <div class="demo-preview">
            <div class="demo-icon">🔔</div>
          </div>
          <h3>Smart Notifications</h3>
          <p>Notificări contextuale cu prioritizare automată bazată pe AI</p>
          <a href="dezvoltatori.html" class="glass-btn js-no-modal">Vezi demo</a>
        </div>
      </div>
    </div>

    <!-- Pricing Plans -->
    <div class="container plans">
      <h2>Planuri Flexibile</h2>
      <p class="tagline">Alege soluția potrivită pentru afacerea ta</p>
      
      <div class="grid grid-3">
        <div class="card plan-card eb">
          <div class="plan-badge">Starter</div>
          <div class="plan-price">
            <span class="price">€49</span>
            <span class="period">/lună</span>
          </div>
          <ul class="plan-features">
            <li>✓ Până la 10 utilizatori</li>
            <li>✓ 5GB stocare cloud</li>
            <li>✓ Suport email</li>
            <li>✓ Actualizări lunare</li>
            <li>✓ API access basic</li>
          </ul>
          <a href="dezvoltatori.html" class="glass-btn js-no-modal">Începe acum</a>
        </div>
        
        <div class="card plan-card featured eb">
          <div class="plan-badge popular">Professional</div>
          <div class="plan-price">
            <span class="price">€149</span>
            <span class="period">/lună</span>
          </div>
          <ul class="plan-features">
            <li>✓ Utilizatori nelimitați</li>
            <li>✓ 50GB stocare cloud</li>
            <li>✓ Suport prioritar 24/7</li>
            <li>✓ Actualizări zilnice</li>
            <li>✓ API access avansat</li>
            <li>✓ Custom branding</li>
            <li>✓ Rapoarte avansate</li>
          </ul>
          <a href="dezvoltatori.html" class="glass-btn primary js-no-modal">Alege Professional</a>
        </div>
        
        <div class="card plan-card eb">
          <div class="plan-badge">Enterprise</div>
          <div class="plan-price">
            <span class="price">Custom</span>
          </div>
          <ul class="plan-features">
            <li>✓ Tot din Professional +</li>
            <li>✓ Stocare nelimitată</li>
            <li>✓ Dedicated account manager</li>
            <li>✓ SLA garantat 99.9%</li>
            <li>✓ On-premise deployment</li>
            <li>✓ Custom development</li>
            <li>✓ Training inclus</li>
          </ul>
          <a href="dezvoltatori.html" class="glass-btn js-no-modal">Contactează-ne</a>
        </div>
      </div>
    </div>

    <!-- Success Stories -->
    <div class="container stories">
      <h2>Povești de Succes</h2>
      <p class="tagline">Companii care au transformat procesele cu platforma noastră</p>
      
      <div class="grid grid-2">
        <div class="card story-card eb">
          <div class="story-logo">🏢</div>
          <h3>TechCorp Industries</h3>
          <p class="story-stat">-65% timp procesare documente</p>
          <p>Am automatizat complet procesul de onboarding clienți, reducând timpul de la 3 zile la doar 4 ore.</p>
          <a href="companii.html" class="glass-btn js-no-modal">Citește povestea</a>
        </div>
        
        <div class="card story-card eb">
          <div class="story-logo">🏪</div>
          <h3>RetailMax Chain</h3>
          <p class="story-stat">+120% productivitate echipă</p>
          <p>Digitalizarea inventarului în 50+ locații a dus la o creștere semnificativă a eficienței operaționale.</p>
          <a href="companii.html" class="glass-btn js-no-modal">Citește povestea</a>
        </div>
        
        <div class="card story-card eb">
          <div class="story-logo">🏥</div>
          <h3>MediCare Plus</h3>
          <p class="story-stat">100% conformitate GDPR</p>
          <p>Management securizat al documentelor medicale cu acces controlat și audit complet.</p>
          <a href="companii.html" class="glass-btn js-no-modal">Citește povestea</a>
        </div>
        
        <div class="card story-card eb">
          <div class="story-logo">🚚</div>
          <h3>LogiTrans Express</h3>
          <p class="story-stat">-40% costuri operaționale</p>
          <p>Optimizarea rutelor și automatizarea documentației au transformat eficiența flotei.</p>
          <a href="companii.html" class="glass-btn js-no-modal">Citește povestea</a>
        </div>
      </div>
    </div>
  `;
}

function setupPortalInteractivity() {
  screenDom.querySelectorAll('.section.demos .glass-btn').forEach(btn => {
    const a = document.createElement('a');
    a.className = btn.className + ' js-no-modal';
    a.textContent = btn.textContent || 'Vezi detalii';
    a.href = 'dezvoltatori.html';
    a.removeAttribute('data-modal-src');
    a.removeAttribute('data-modal-title');
    btn.replaceWith(a);
  });

  screenDom.querySelectorAll('.section.plans .glass-btn').forEach(btn => {
    const a = document.createElement('a');
    a.className = btn.className + ' js-no-modal';
    a.textContent = btn.textContent || 'Detalii';
    a.href = 'dezvoltatori.html';
    a.removeAttribute('data-modal-src');
    a.removeAttribute('data-modal-title');
    btn.replaceWith(a);
  });

  screenDom.querySelectorAll('.section.stories .glass-btn').forEach(btn => {
    const a = document.createElement('a');
    a.className = btn.className + ' js-no-modal';
    a.textContent = btn.textContent || 'Vezi detalii';
    a.href = 'companii.html';
    a.removeAttribute('data-modal-src');
    a.removeAttribute('data-modal-title');
    btn.replaceWith(a);
  });

  screenDom.querySelectorAll('a.js-no-modal').forEach(a => {
    const clone = a.cloneNode(true);
    a.replaceWith(clone);
  });

  screenDom.addEventListener('click', function(e) {
    const a = e.target.closest('a.js-no-modal[href]');
    if (!a) return;
    setTimeout(() => {
      if (document.activeElement === a) window.location.href = a.href;
    }, 0);
  }, true);

  attachModalTriggers(screenDom);
  
  console.log('[MTECH] Portal interactivity setup complete');
}

console.log('[MTECH] Screen & Portal content loaded');

// ========== Electric Border Integration ==========
function enhanceCardsWithElectricBorder(rootEl) {
  const EBRef = window.getEB();
  const cards = rootEl.querySelectorAll(".card");
  if (!cards.length) return;

  const blue = getComputedStyle(document.documentElement)
    .getPropertyValue("--neon-blue")?.trim() || "#00e5ff";
  const purpleHex = "#b85cff";

  const obs = new ResizeObserver((entries) => {
    for (const ent of entries) {
      const layers = ent.target.querySelector(":scope > .eb-layers");
      if (!layers) continue;
      
      const lr = layers.getBoundingClientRect();
      const w = Math.ceil(lr.width);
      const h = Math.ceil(lr.height);
      
      layers.querySelectorAll("canvas.eb-canvas")
        .forEach((cv) => cv.__fx?.resize(w, h));
    }
  });

  cards.forEach((card) => {
    if (getComputedStyle(card).position === "static") {
      card.style.position = "relative";
    }
    
    card.classList.add("eb");
    
    if (card.querySelector(":scope > .eb-layers")) return;

    const ebPad = parseInt(getComputedStyle(card).getPropertyValue("--eb-pad")) || 16;

    const layers = document.createElement("div");
    layers.className = "eb-layers";
    Object.assign(layers.style, {
      position: "absolute",
      inset: `-${ebPad}px`,
      zIndex: 2,
      pointerEvents: "none",
    });

    const cvBlue = document.createElement("canvas");
    cvBlue.className = "eb-canvas eb-blue";
    const cvPurple = document.createElement("canvas");
    cvPurple.className = "eb-canvas eb-purple";
    
    Object.assign(cvBlue.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });
    Object.assign(cvPurple.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });

    const g1 = document.createElement("div");
    g1.className = "eb-glow";
    const g2 = document.createElement("div");
    g2.className = "eb-glow2";
    
    layers.append(cvBlue, cvPurple, g1, g2);
    card.prepend(layers);

    const lr = layers.getBoundingClientRect();
    const w = Math.ceil(lr.width);
    const h = Math.ceil(lr.height);
    const br = parseFloat(getComputedStyle(card).borderRadius) || 16;

    const fxBlue = new window.ElectricBorderFX(cvBlue, {
      width: w,
      height: h,
      borderOffset: ebPad,
      borderRadius: br + 2,
      color: blue,
      lineWidth: 1,
      displacement: 42,
      frequency: 10,
      amplitude: 0.075,
      seed: 0,
      speed: 1.5,
      quality: EBRef.quality,
    });
    
    const fxPurple = new window.ElectricBorderFX(cvPurple, {
      width: w,
      height: h,
      borderOffset: ebPad,
      borderRadius: br + 2,
      color: purpleHex,
      lineWidth: 1,
      displacement: 36,
      frequency: 9,
      amplitude: 0.065,
      seed: 8,
      speed: 1.35,
      quality: EBRef.quality,
    });
    
    cvBlue.__fx = fxBlue;
    cvPurple.__fx = fxPurple;

    card.__ebStart = () => {
      EBRef.runners.add(fxBlue);
      EBRef.runners.add(fxPurple);
      card.classList.add("is-hover");
    };
    
    card.__ebStop = () => {
      EBRef.runners.delete(fxBlue);
      EBRef.runners.delete(fxPurple);
      fxBlue?.ctx?.clearRect(0, 0, fxBlue.c.width, fxBlue.c.height);
      fxPurple?.ctx?.clearRect(0, 0, fxPurple.c.width, fxPurple.c.height);
      card.classList.remove("is-hover");
    };
    
    card.addEventListener("pointerenter", card.__ebStart, { passive: true });
    card.addEventListener("pointerleave", card.__ebStop, { passive: true });

    fxBlue.drawFrame(performance.now());
    fxPurple.drawFrame(performance.now());
    obs.observe(card);
  });
}

let __ebBooted = false;

function bootElectricBordersOnce() {
  if (__ebBooted || !screenDom) return;
  __ebBooted = true;
  enhanceCardsWithElectricBorder(screenDom);
  console.log('[MTECH] Electric borders booted');
}

function createCss3dHoverManager(cssRenderer, portalEl) {
  let curHover = null;
  let onMove = null;
  let onLeave = null;
  let lastEvt = null;
  let rafId = 0;

  const clickableSel = 'a,button,.glass-btn,[role="button"],[onclick]';

  function pickClickableAt(x, y) {
    const stack = document.elementsFromPoint(x, y) || [];
    for (const el of stack) {
      if (!(el instanceof Element)) continue;
      if (!portalEl.contains(el)) continue;
      if (el.matches(clickableSel)) return el;
      const c = el.closest(clickableSel);
      if (c && portalEl.contains(c)) return c;
    }
    return null;
  }

  function enable() {
    const root = cssRenderer.domElement;
    
    const fixWrappers = () => {
      const cam = root.firstElementChild;
      if (cam) cam.style.pointerEvents = "inherit";
      const obj = cam && cam.firstElementChild;
      if (obj) obj.style.pointerEvents = "inherit";
    };
    
    root.style.pointerEvents = "auto";
    fixWrappers();
    
    new MutationObserver(fixWrappers).observe(root, {
      childList: true,
      subtree: true,
    });

    onMove = (e) => {
      lastEvt = e;
      if (rafId) return;
      
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (portalEl.offsetParent === null || !lastEvt) return;
        
        const hit = pickClickableAt(lastEvt.clientX, lastEvt.clientY);
        if (hit !== curHover) {
          if (curHover) curHover.classList.remove("is-hover");
          curHover = hit || null;
          root.style.cursor = curHover ? "pointer" : "auto";
          if (curHover && curHover.classList.contains("glass-btn")) {
            curHover.classList.add("is-hover");
          }
        }
      });
    };
    
    onLeave = () => {
      if (curHover) curHover.classList.remove("is-hover");
      curHover = null;
      root.style.cursor = "auto";
    };
    
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave, { passive: true });
  }

  function disable() {
    const root = cssRenderer.domElement;
    document.removeEventListener("pointermove", onMove || (() => {}));
    document.removeEventListener("pointerleave", onLeave || (() => {}));
    if (curHover) curHover.classList.remove("is-hover");
    curHover = null;
    root.style.cursor = "auto";
  }

  return { enable, disable };
}

(function EBHoverHTSetup() {
  let curCard = null;

  function pickCardAt(x, y) {
    if (!screenDom) return null;
    const stack = document.elementsFromPoint(x, y) || [];
    for (const el of stack) {
      if (!(el instanceof Element)) continue;
      if (!screenDom.contains(el)) continue;
      const card = el.closest(".card.eb");
      if (card && screenDom.contains(card)) return card;
    }
    return null;
  }

  function applyHover(card) {
    if (card === curCard) return;
    if (curCard?.__ebStop) curCard.__ebStop();
    curCard = card || null;
    if (curCard?.__ebStart) curCard.__ebStart();
  }

  function onMove(e) {
    if (!screenObj?.visible) {
      if (curCard?.__ebStop) curCard.__ebStop();
      curCard = null;
      return;
    }
    applyHover(pickCardAt(e.clientX, e.clientY));
  }

  function onLeave() {
    if (curCard?.__ebStop) curCard.__ebStop();
    curCard = null;
  }

  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave, { passive: true });

  if (screenDom) {
    screenDom.addEventListener("scroll", () => {
      if (!screenObj?.visible) return;
      const r = screenDom.getBoundingClientRect();
      applyHover(pickCardAt(r.left + r.width / 2, r.top + r.height / 2));
    }, { passive: true });
  }
})();

function snapshotZoomPose() {
  __zoomPose = {
    fov: camera.fov,
    pos: camera.position.clone(),
    quat: camera.quaternion.clone(),
    scale: screenObj?.scale?.x ?? 1
  };
}

if (window.__modalStateObs) {
  window.__modalStateObs.disconnect();
}

window.__modalStateObs = new MutationObserver(() => {
  const root = cssRenderer?.domElement;
  const open = !!document.querySelector('.mtk-modal.is-open');
  
  if (open) {
    __savedScrollY = window.scrollY;
    lockStageHeight(true);
    disableAnchoringTemp(400);
    if (root) {
      root.style.pointerEvents = 'none';
      root.style.opacity = '0';
    }
    captureFitBasis();
    return;
  }

  if (root) {
    root.style.opacity = '';
    root.style.pointerEvents = 'auto';
    root.style.zIndex = getComputedStyle(document.documentElement)
      .getPropertyValue('--portal-z') || '2147483400';
  }

  if (typeof window.unfreezeBody === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.unfreezeBody());
    });
  }

  requestAnimationFrame(() => {
    if (window.zoomLocked) {
      document.body.classList.add('portal-open');
    }
  });

  if (__zoomPose) {
    camera.fov = __zoomPose.fov;
    camera.position.copy(__zoomPose.pos);
    camera.quaternion.copy(__zoomPose.quat);
    camera.updateProjectionMatrix();
    if (screenObj) screenObj.scale.setScalar(__zoomPose.scale);
  }

  __fitLocked = false;
  resetFitBasis();
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      captureFitBasis();
      fitScreenDomSafe('modal-close');
      refitZoomTargetNow();
      
      if (__savedScrollY != null) {
        disableAnchoringTemp(300);
        window.scrollTo({ top: __savedScrollY, behavior: 'auto' });
        __savedScrollY = null;
      }
      
      lockStageHeight(false);
      disableAnchoringTemp(400);
    });
  });
});

const modalObserverTarget = document.body;
window.__modalStateObs.observe(modalObserverTarget, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class']
});

console.log('[MTECH] Electric borders & hover management loaded');

// ========== Input Event Handlers ==========
const ptInRect = (x, y, r) =>
  x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

const wheelDeltaPx = (e) =>
  e.deltaMode === 1 ? e.deltaY * 16 :
  e.deltaMode === 2 ? e.deltaY * innerHeight :
  e.deltaY;

const inPortalPath = (e) => {
  if (!screenDom) return false;
  const path = (e.composedPath && e.composedPath()) || [];
  return path.includes(screenDom) ||
    path.some(n => n === screenDom || (n instanceof Element && screenDom.contains(n)));
};

window.addEventListener("wheel", (e) => {
  if (e.target.closest(".top-cta")) return;
  
  if (!GATES.lidOpen) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const stage = getStageEl();
  if (!stage) return;
  
  const rStage = stage.getBoundingClientRect();
  const insideStage = ptInRect(e.clientX ?? -1, e.clientY ?? -1, rStage);
  if (!insideStage) return;

  let overPortal = false;
  if (portalActive && screenDom) {
    const r = screenDom.getBoundingClientRect();
    overPortal = ptInRect(e.clientX ?? -1, e.clientY ?? -1, r);
  }
  
  const inPortal = overPortal || inPortalPath(e);

  if (portalActive && inPortal) {
    const sc = screenDom;
    const dy = wheelDeltaPx(e);
    const atTop = sc.scrollTop <= 0;
    const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;

    if (dy < 0 && atTop) {
      e.preventDefault();
      e.stopPropagation();
      beginUnzoomFromPortal();
      return;
    }
    
    if (dy > 0 && atBottom) {
      e.preventDefault();
      e.stopPropagation();
      lastScrollDir = 1;
      suppressPortal = false;
      const mag = Math.max(12, Math.min(80, Math.abs(dy)));
      nudgeT(mag * CONFIG.INPUT.WHEEL_TO_T);
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    sc.scrollTop += dy;
    return;
  }

  if (handover.active && e.deltaY < 0) {
    e.preventDefault();
    e.stopPropagation();
    stopHandover();
    forceCode100 = true;
    handoverSuppressed = true;
    freezeUIUntilUnzoom = true;
    tFreezeMin = Math.max(CONFIG.TIMELINE.SHOW_PORTAL_AT, getStageProgress());
    hidePortal(true);
    lastScrollDir = -1;
    zoomTarget = 0;
    zoomAuto = true;
    outBoost = 2.2;
    const base = virtualT ?? getStageProgress();
    setVirtualT(base - 0.02);
    try {
      drawScreen(CONFIG.CODE.length, 100);
      screenTex.needsUpdate = true;
    } catch {}
    return;
  }
  
  if (handover.active && e.deltaY > 0) {
    e.preventDefault();
    e.stopPropagation();
    handover.start -= 120;
    return;
  }
  
  if (portalActive && e.deltaY < 0 && !inPortal) {
    e.preventDefault();
    e.stopPropagation();
    beginUnzoomFromPortal();
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  lastScrollDir = e.deltaY > 0 ? 1 : -1;
  nudgeT(e.deltaY * CONFIG.INPUT.WHEEL_TO_T);
  
  if (e.deltaY > 0 && !freezeUIUntilUnzoom && !zoomAuto) {
    suppressPortal = false;
  }
}, { passive: false, capture: true });

let touchStartY = 0;

window.addEventListener("touchstart", (e) => {
  touchStartY = e.touches?.[0]?.clientY ?? 0;
}, { passive: true });

window.addEventListener("touchmove", (e) => {
  if (!GATES.lidOpen) {
    e.preventDefault();
    return;
  }
  
  if (e.target && screenDom && screenDom.contains(e.target)) return;
  
  const y = e.touches?.[0]?.clientY ?? 0;
  const dy = y - touchStartY;
  lastScrollDir = dy < 0 ? 1 : -1;
  
  if (Math.abs(dy) > 0) {
    nudgeT(-dy * CONFIG.INPUT.TOUCH_TO_T);
  }
  
  if (dy < 0 && !freezeUIUntilUnzoom && !zoomAuto) {
    suppressPortal = false;
  }
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (!GATES.lidOpen) {
    e.preventDefault();
    return;
  }
  
  if (document.activeElement && screenDom && screenDom.contains(document.activeElement)) {
    return;
  }
  
  if (["ArrowUp", "PageUp", "Home"].includes(e.key)) {
    lastScrollDir = -1;
    nudgeT(-CONFIG.INPUT.KEYSTEP_T);
  } else if (["ArrowDown", "PageDown", "End"].includes(e.key)) {
    lastScrollDir = 1;
    nudgeT(CONFIG.INPUT.KEYSTEP_T);
    if (!freezeUIUntilUnzoom && !zoomAuto) {
      suppressPortal = false;
    }
  }
});

document.addEventListener("click", (e) => {
  if (e.target && screenDom && screenDom.contains(e.target)) return;
  if (e.target.closest(".top-cta")) return;

  const stage = getStageEl();
  if (!stage) return;
  
  const r = stage.getBoundingClientRect();
  const tEffNow = virtualT ?? getStageProgress();
  
  if (ptInRect(e.clientX ?? -1, e.clientY ?? -1, r)) {
    if (canBeginZoom() && tEffNow >= CONFIG.TIMELINE.ZOOM_ENTER) {
      beginZoom(true);
    }
  }
}, { capture: true });

document.addEventListener("touchend", (e) => {
  const stage = getStageEl();
  if (!stage) return;
  
  const t = e.changedTouches?.[0];
  if (!t) return;

  const r = stage.getBoundingClientRect();
  const tEff = virtualT ?? getStageProgress();
  
  if (ptInRect(t.clientX ?? -1, t.clientY ?? -1, r)) {
    if (canBeginZoom() && tEff >= CONFIG.TIMELINE.ZOOM_ENTER) {
      beginZoom(true);
    }
  }
}, { passive: true, capture: true });

if (topCta) {
  topCta.querySelectorAll(".glass-btn").forEach((btn) => {
    btn.addEventListener("mousemove", (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      e.currentTarget.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
    });
    btn.addEventListener("mouseleave", (e) => {
      e.currentTarget.style.removeProperty("--mx");
    });
  });
}

console.log('[MTECH] Input handlers attached');

// ========== Main Animation Loop ==========
const clock = new THREE.Clock();
const totalChars = CONFIG.CODE.length;
let prevTEff = 0;

function tick() {
  const dt = clock.getDelta();
  
  computeScreenBasis();
  
  if (window.skyMat) {
    window.skyMat.uniforms.uTime.value += dt;
  }

  const tReal = getStageProgress();
  const tEff = virtualT ?? tReal;
  const tUI = freezeUIUntilUnzoom ? Math.max(tEff, tFreezeMin) : tEff;
  
  updateGates(tUI);

  const __root = cssRenderer?.domElement;
  if (__root) {
    const hideCss3d = handover.active && !portalActive;
    __root.style.opacity = hideCss3d ? "0" : "1";
    const wantedPE = hideCss3d ? "none" : "auto";
    __root.style.pointerEvents = (__peManual == null) ? wantedPE : __peManual;
  }

  const EBRef = window.getEB();
  if (EBRef) {
    const shouldPortal = portalActive && zoomLocked && !handover.active && !zoomAuto;
    EBRef.enabled = shouldPortal || EBRef.runners.size > 0;
    
    const cameraBusy = zoomAuto || phase !== "ready" || handover.active;
    const wantedQ = cameraBusy ? 0.6 : 1.0;
    const wantedFPS = cameraBusy ? 33 : 16;
    
    if (EBRef.quality !== wantedQ) {
      EBRef.quality = wantedQ;
      EBRef.runners.forEach(fx => fx.setQuality && fx.setQuality(wantedQ));
    }
    EBRef.minFrameMs = wantedFPS;
  }

  if (phase === "drop") simulateDrop(dt);
  else if (phase === "shake") simulateShake(dt);
  else if (phase === "open") animateOpen(dt);

  if (zoomLocked && !handover.active && !handoverDone && !portalActive && 
      tUI >= CONFIG.TIMELINE.SHOW_PORTAL_AT) {
    startHandover();
  }

  if (portalActive && deferHidePortal && !zoomAuto && !zoomLocked) {
    hidePortal(true);
    if (__root) __root.style.opacity = "1";
    deferHidePortal = false;
  }

  const crossedUp = prevTEff < CONFIG.TIMELINE.ZOOM_ENTER && tEff >= CONFIG.TIMELINE.ZOOM_ENTER;
  if (canBeginZoom() && crossedUp) {
    beginZoom();
  }

  if (handover.active) {
    const elapsed = performance.now() - handover.start;
    handover.pct = clamp((elapsed / CONFIG.PORTAL.HANDOVER_MIN_MS) * 100, 0, 100);
    if (elapsed > CONFIG.PORTAL.HANDOVER_MIN_MS + CONFIG.PORTAL.HANDOVER_TAIL_MS) {
      handover.pct = 100;
    }
    drawInterstitial(handover.pct);
  }

  if (handover.active && handover.pct >= 100) {
    stopHandover();
    showPortal();
  }

  const comp = clamp(tUI / CONFIG.TIMELINE.COMPILE_SNAP_AT, 0, 1);
  if (!portalActive) {
    let charsToShow = null;
    let displayPct = null;
    
    if (!handover.active) {
      if (forceCode100 || tUI >= CONFIG.TIMELINE.SHOW_PORTAL_AT) {
        charsToShow = CONFIG.CODE.length;
        displayPct = 100;
      } else {
        displayPct = clamp((tUI / CONFIG.TIMELINE.SHOW_PORTAL_AT) * 100, 0, 100);
        charsToShow = Math.floor(totalChars * comp);
      }
      
      drawScreen(charsToShow, displayPct);
      
      if (displayPct === 100) prevCharsShown = totalChars;

      if (!portalActive && !handover.active) {
        const inZoom = zoomAuto || zoomLocked;
        if (inZoom && tUI >= CONFIG.TIMELINE.SHOW_PORTAL_AT && !handoverDone) {
          if (!zoomLocked) {
            zoomAuto = false;
            zoomLocked = true;
          }
          startHandover();
        }
      }

      if (displayPct < 100) {
        const MAX_STROKES = 12;
        if (charsToShow > prevCharsShown) {
          let diff = Math.min(charsToShow - prevCharsShown, MAX_STROKES);
          for (let i = charsToShow - diff + 1; i <= charsToShow; i++) {
            const ch = CONFIG.CODE[i - 1];
            pressKey(charToKeyLabel(ch) || randomFallbackKey());
          }
        } else if (charsToShow < prevCharsShown) {
          let diff = Math.min(prevCharsShown - charsToShow, MAX_STROKES);
          for (let i = 0; i < diff; i++) {
            pressKey("BACK");
          }
        }
        prevCharsShown = charsToShow;
      }
    }
  }

  if (zoomAuto || (zoomLocked && zoomTarget === 0)) {
    const baseIn = CONFIG.ZOOM.SPEED_IN;
    const baseOut = CONFIG.ZOOM.SPEED_OUT * outBoost;
    const kPrev = easeInOut(zoomVal);
    const speed = zoomTarget === 1 ? baseIn : baseOut + (1 - kPrev) * 24;

    if (zoomTarget === 1 && !hasZoomTarget) {
      camera.position.copy(startCamPos);
      camera.quaternion.copy(startCamQuat);
      camera.lookAt(screenBasis.center);
    } else {
      zoomVal = smooth(zoomVal, zoomTarget, dt, speed);
      const k = easeInOut(zoomVal);

      camera.fov = THREE.MathUtils.lerp(CONFIG.ZOOM.FOV_BASE, CONFIG.ZOOM.FOV_ZOOM, k);
      camera.updateProjectionMatrix();

      camera.position.copy(startCamPos).lerp(targetPos, k);
      camera.quaternion.copy(startCamQuat).slerp(targetQuat, k);
      camera.lookAt(screenBasis.center);

      if (zoomLocked && zoomTarget === 1 && !_mouseLookActiveNow) {
        const _ndc = screenBasis.center.clone().project(camera);
        if (Math.abs(_ndc.x) > 1e-4) {
          const camRight = new THREE.Vector3();
          camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
          camera.position.addScaledVector(camRight, -_ndc.x * 0.015);
        }
      }

      const closeEnough = zoomVal > 0.995 || 
        camera.position.distanceToSquared(targetPos) < 4e-4;

      if (zoomTarget === 1 && closeEnough) {
        camera.position.copy(targetPos);
        camera.quaternion.copy(targetQuat);
        camera.fov = CONFIG.ZOOM.FOV_ZOOM;
        camera.updateProjectionMatrix();
        camera.lookAt(screenBasis.center);
        
        zoomAuto = false;
        zoomLocked = true;
        screenDom.style.pointerEvents = "auto";
        
        if (!handover.active && !portalActive) {
          startHandover();
        }
        
        forceCode100 = false;
        baseLookAnchor.copy(screenBasis.center);
        anchorCaptured = true;
      }

      if (zoomAuto && zoomTarget === 1) {
        const elapsed = performance.now() - zoomStartAt;
        const nearEnough = k > 0.985 || 
          camera.position.distanceToSquared(targetPos) < 9e-4;
        
        if (elapsed > 1800 && nearEnough && !handover.active) {
          zoomAuto = false;
          zoomLocked = true;
          if (!portalActive) startHandover();
        }
      }

      if (zoomTarget === 0 && 
          (zoomVal <= CONFIG.ZOOM.SNAP_OUT_EPS || hasReachedStartPose())) {
        camera.position.copy(startCamPos);
        camera.quaternion.copy(startCamQuat);
        camera.fov = CONFIG.ZOOM.FOV_BASE;
        camera.updateProjectionMatrix();

        zoomAuto = false;
        zoomLocked = false;
        freezeUIUntilUnzoom = false;
        suppressPortal = false;
        outBoost = 1;
        handoverSuppressed = false;
        forceCode100 = false;
        hasZoomTarget = false;

        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        baseLookAnchor.copy(camera.position).addScaledVector(dir, 10);
        anchorCaptured = true;
        handoverDone = false;

        lockStageHeight(false);
        disableAnchoringTemp(300);
      }
    }
  }

  lookState.x = smooth(lookState.x, lookState.tx, dt, CONFIG.LOOK.smooth);
  lookState.y = smooth(lookState.y, lookState.ty, dt, CONFIG.LOOK.smooth);
  
  const inZoom = zoomLocked || zoomAuto;
  const maxYaw = inZoom ? CONFIG.LOOK.yaw.zoom : CONFIG.LOOK.yaw.normal;
  const maxPitch = inZoom ? CONFIG.LOOK.pitch.zoom : CONFIG.LOOK.pitch.normal;
  const Rright = inZoom ? 0.35 : 1.2;
  const Rup = inZoom ? 0.2 : 0.6;
  
  const offRight = screenBasis.right.clone()
    .multiplyScalar(lookState.x * (maxYaw / CONFIG.LOOK.yaw.normal) * Rright);
  const offUp = screenBasis.up.clone()
    .multiplyScalar(lookState.y * (maxPitch / CONFIG.LOOK.pitch.normal) * Rup);
  
  const anchor = inZoom ? screenBasis.center : baseLookAnchor;
  const desiredLookTarget = anchor.clone().add(offRight).add(offUp);
  
  _mouseLookActiveNow = Math.abs(lookState.x) > 0.001 || Math.abs(lookState.y) > 0.001;

  const allowSide = !zoomLocked && !zoomAuto && !freezeUIUntilUnzoom;
  const show2050 = allowSide && comp >= 0.2 && comp < 0.5;
  copy20L?.classList.toggle("show", show2050);
  copy20R?.classList.toggle("show", show2050);
  
  const show6090 = allowSide && comp >= 0.6 && comp < 0.9;
  copy60L?.classList.toggle("show", show6090);
  copy60R?.classList.toggle("show", show6090);
  
  const showHero = allowSide && comp < 0.9;
  heroIntro?.classList.toggle("is-hidden", !showHero);
  
  const showTopCta = allowSide;
  topCta?.classList.toggle("is-hidden", !showTopCta);

  updateKeys(dt);

  const wantLCD = !portalActive;
  if (screenPlane && screenPlane.visible !== wantLCD) {
    screenPlane.visible = wantLCD;
  }

  camera.lookAt(desiredLookTarget);

  renderer.render(scene, camera);
  cssRenderer.render(scene, camera);

  if (!portalActive && !document.body.classList.contains('modal-open')) {
    if (__stageWasLocked) {
      lockStageHeight(false);
    }
  }

  requestAnimationFrame(tick);
  prevTEff = tEff;
}

// ========== Initialize Everything ==========
function init() {
  console.log('[MTECH] Initializing scene...');
  
  initRenderer();
  initCSS3DRenderer();
  initScene();
  initLighting();
  initSky();
  initFloorGlow();
  initLaptop();
  initKeyboard();
  initPortalContent();
  
  css3dHover = createCss3dHoverManager(cssRenderer, screenDom);
  
  resizeRenderer();
  
  window.addEventListener("resize", () => {
    resizeRenderer();
    fitCamera();
    __fitLocked = false;
    resetFitBasis();
    fitScreenDomSafe("window-resize");
    
    if (zoomLocked || (zoomAuto && zoomTarget === 1)) {
      camera.fov = CONFIG.ZOOM.FOV_ZOOM;
    } else {
      camera.fov = CONFIG.ZOOM.FOV_BASE;
    }
    camera.updateProjectionMatrix();
    
    if (zoomLocked || (zoomAuto && zoomTarget === 1 && hasZoomTarget)) {
      computeZoomTargetOnce();
      camera.position.copy(targetPos);
      camera.quaternion.copy(targetQuat);
      camera.lookAt(screenBasis.center);
      if (zoomLocked) baseLookAnchor.copy(screenBasis.center);
    }
  });
  
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  
  console.log('[MTECH] Scene initialized, starting animation loop');
  tick();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('[MTECH] Laptop scene module loaded');