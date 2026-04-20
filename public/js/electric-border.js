// ========== Electric Border FX System ==========

class ElectricBorderFX {
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.ctx = this.c.getContext("2d");
    this.w = opts.width ?? 400;
    this.h = opts.height ?? 260;

    this.octaves = opts.octaves ?? 10;
    this.lacunarity = opts.lacunarity ?? 1.6;
    this.gain = opts.gain ?? 0.7;
    this.amp = opts.amplitude ?? 0.08;
    this.freq = opts.frequency ?? 8;
    this.baseFlat = opts.baseFlatness ?? 0.0;
    this.disp = opts.displacement ?? 50;
    this.speed = opts.speed ?? 1.2;
    this.offset = opts.borderOffset ?? 20;
    this.radius = opts.borderRadius ?? 16;
    this.lineWidth = opts.lineWidth ?? 1;
    this.color = opts.color ?? "#00e5ff";
    this.seed = opts.seed ?? 0;
    this.quality = opts.quality ?? 1;

    this.time = 0;
    this.last = 0;
    this.resize(this.w, this.h);
  }

  setQuality(q) {
    this.quality = Math.max(0.5, Math.min(1, q));
  }

  resize(w, h) {
    this.w = Math.max(100, Math.round(w));
    this.h = Math.max(60, Math.round(h));
    this.c.width = this.w;
    this.c.height = this.h;
  }

  rnd(x) {
    return (Math.sin(x * 12.9898) * 43758.5453) % 1;
  }

  noise2D(x, y) {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j;
    const a = this.rnd(i + j * 57 + this.seed * 101);
    const b = this.rnd(i + 1 + j * 57 + this.seed * 101);
    const c = this.rnd(i + (j + 1) * 57 + this.seed * 101);
    const d = this.rnd(i + 1 + (j + 1) * 57 + this.seed * 101);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + 
           c * (1 - ux) * uy + d * ux * uy;
  }

  octNoise(x, time) {
    let y = 0, a = this.amp, f = this.freq;
    for (let i = 0; i < this.octaves; i++) {
      let amp = i === 0 ? a * this.baseFlat : a;
      y += amp * this.noise2D(f * x, time * f * 0.3);
      f *= this.lacunarity;
      a *= this.gain;
    }
    return y;
  }

  roundedPerimeterPoint(t, left, top, w, h, r) {
    const sw = w - 2 * r, sh = h - 2 * r, arc = (Math.PI * r) / 2;
    const per = 2 * sw + 2 * sh + 4 * arc;
    let d = t * per, acc = 0;

    if (d <= acc + sw) {
      const p = (d - acc) / sw;
      return { x: left + r + p * sw, y: top };
    }
    acc += sw;
    if (d <= acc + arc) {
      const p = (d - acc) / arc;
      const a = -Math.PI / 2 + p * (Math.PI / 2);
      return { x: left + w - r + r * Math.cos(a), y: top + r + r * Math.sin(a) };
    }
    acc += arc;
    if (d <= acc + sh) {
      const p = (d - acc) / sh;
      return { x: left + w, y: top + r + p * sh };
    }
    acc += sh;
    if (d <= acc + arc) {
      const p = (d - acc) / arc;
      const a = 0 + p * (Math.PI / 2);
      return { x: left + w - r + r * Math.cos(a), y: top + h - r + r * Math.sin(a) };
    }
    acc += arc;
    if (d <= acc + sw) {
      const p = (d - acc) / sw;
      return { x: left + w - r - p * sw, y: top + h };
    }
    acc += sw;
    if (d <= acc + arc) {
      const p = (d - acc) / arc;
      const a = Math.PI / 2 + p * (Math.PI / 2);
      return { x: left + r + r * Math.cos(a), y: top + h - r + r * Math.sin(a) };
    }
    acc += arc;
    if (d <= acc + sh) {
      const p = (d - acc) / sh;
      return { x: left, y: top + h - r - p * sh };
    }
    const p = (d - acc - sh) / arc;
    const a = Math.PI + p * (Math.PI / 2);
    return { x: left + r + r * Math.cos(a), y: top + r + r * Math.sin(a) };
  }

  drawFrame(timeMs) {
    const ctx = this.ctx;
    const dt = this.last ? (timeMs - this.last) / 1000 : 0;
    this.last = timeMs;
    this.time += dt * this.speed;

    ctx.clearRect(0, 0, this.w, this.h);
    ctx.lineWidth = this.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = this.color;

    const left = this.offset, top = this.offset;
    const bw = this.w - 2 * this.offset, bh = this.h - 2 * this.offset;
    const r = Math.min(this.radius, Math.min(bw, bh) / 2);

    const approx = 2 * (bw + bh) + Math.PI * r * 2;
    const density = 2 + (1 - this.quality) * 5;
    const samples = Math.max(140, Math.floor(approx / density));

    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const p = this.roundedPerimeterPoint(t, left, top, bw, bh, r);
      const n1 = this.octNoise(t, this.time);
      const n2 = this.octNoise(t + 7.1, this.time);
      const x = p.x + n1 * this.disp;
      const y = p.y + n2 * this.disp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

// Start animation loop
if (!window.__EB) {
  window.__EB = window.MTECH_CONFIG.EB;
}

const EBRef = window.__EB;

if (!EBRef.__loopStarted) {
  EBRef.__loopStarted = true;
  (function __ebLoop(t) {
    requestAnimationFrame(__ebLoop);
    if (!EBRef.enabled && EBRef.runners.size === 0) return;
    if (t - (EBRef._last || 0) < EBRef.minFrameMs) return;
    EBRef._last = t;
    EBRef.runners.forEach((fx) => fx?.drawFrame?.(t));
  })();
}

// Export
window.ElectricBorderFX = ElectricBorderFX;

console.log('[MTECH] Electric Border FX loaded');