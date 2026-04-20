(function cyberpunkOverdrive() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = document.getElementById('cyberpunkLayer');
  const sections = Array.from(document.querySelectorAll('section.story-section[data-cyber-theme]'));
  if (!layer || !sections.length) return;

  const paletteByTheme = {
    'neon-core': ['rgba(94,234,212,0.8)', 'rgba(96,165,250,0.7)', 'rgba(167,139,250,0.7)'],
    'teal-grid': ['rgba(45,212,191,0.8)', 'rgba(20,184,166,0.7)', 'rgba(125,211,252,0.6)'],
    'violet-circuit': ['rgba(167,139,250,0.8)', 'rgba(139,92,246,0.8)', 'rgba(96,165,250,0.6)'],
    'amber-flow': ['rgba(251,191,36,0.85)', 'rgba(251,146,60,0.8)', 'rgba(244,114,182,0.65)'],
    'matrix-tech': ['rgba(16,185,129,0.85)', 'rgba(45,212,191,0.75)', 'rgba(59,130,246,0.6)'],
    'pink-wave': ['rgba(244,114,182,0.84)', 'rgba(236,72,153,0.72)', 'rgba(167,139,250,0.64)'],
    'blue-data': ['rgba(125,211,252,0.82)', 'rgba(96,165,250,0.78)', 'rgba(94,234,212,0.58)'],
    'quantum-finish': ['rgba(129,140,248,0.84)', 'rgba(94,234,212,0.75)', 'rgba(244,114,182,0.58)'],
  };

  const effects = [];

  function buildSectionEffect(section, index) {
    const effect = document.createElement('div');
    effect.className = 'cyberpunk-section-fx';
    effect.dataset.sectionId = section.id;

    const starsCanvas = document.createElement('canvas');
    starsCanvas.className = 'cyberpunk-stars';

    const grid = document.createElement('div');
    grid.className = `cyberpunk-grid cp-grid-${String((index + 1) * 37).padStart(3, '0')}`;
    grid.style.opacity = '0.24';
    grid.style.backgroundPosition = `${index * 18}px ${index * -12}px`;
    grid.style.animation = `lineSweep ${18 + index * 2}s linear infinite`;

    const dronesLayer = document.createElement('div');
    dronesLayer.className = 'cyberpunk-drones';

    effect.append(starsCanvas, grid, dronesLayer);

    if (index % 2 === 0) {
      const circuit = document.createElement('div');
      circuit.className = 'cyberpunk-circuit';
      circuit.style.left = `${4 + index * 3}%`;
      circuit.style.top = `${10 + index * 4}%`;
      circuit.style.opacity = '0.35';
      effect.appendChild(circuit);
    }

    layer.appendChild(effect);

    const drones = createDrones(dronesLayer, section, index);

    const state = {
      section,
      effect,
      starsCanvas,
      ctx: starsCanvas.getContext('2d'),
      stars: [],
      drones,
      theme: section.dataset.cyberTheme || 'neon-core',
      active: false,
      scrollTop: 0,
      height: 0,
      top: 0,
    };

    resetStars(state, index);
    effects.push(state);
  }

  function createDrones(container, section, index) {
    const drones = [];
    const count = Math.max(2, 3 + (index % 3));
    for (let i = 0; i < count; i += 1) {
      const drone = document.createElement('div');
      drone.className = `cyberpunk-drone cp-robot-shadow-${String((index * 11 + i + 1) % 120 || 1).padStart(3, '0')}`;
      const size = 32 + ((index * 13 + i * 9) % 24);
      drone.style.width = `${size}px`;
      drone.style.height = `${size}px`;
      drone.style.left = `${10 + ((index * 17 + i * 21) % 78)}%`;
      drone.style.top = `${12 + ((index * 11 + i * 27) % 74)}%`;
      drone.style.animation = reduceMotion ? 'none' : `droneFloat ${8 + i * 2 + index}s ease-in-out infinite`;
      drone.style.opacity = `${0.35 + (i % 3) * 0.2}`;
      container.appendChild(drone);

      drones.push({
        el: drone,
        seedX: Math.random() * 200,
        seedY: Math.random() * 200,
        speed: 0.0002 + Math.random() * 0.00035,
      });
    }

    if (section.id === 'hero' || section.id === 'tehnologii') {
      const robot = document.createElement('div');
      robot.className = 'cyberpunk-robot-sigil';
      robot.style.position = 'absolute';
      robot.style.right = '6%';
      robot.style.bottom = '10%';
      robot.style.width = '190px';
      robot.style.height = '190px';
      robot.style.opacity = '0.22';
      robot.style.backgroundImage = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 260 260\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"%235eead4\"/><stop offset=\"1\" stop-color=\"%23a78bfa\"/></linearGradient></defs><circle cx=\"130\" cy=\"130\" r=\"118\" fill=\"none\" stroke=\"url(%23g)\" stroke-width=\"4\"/><rect x=\"70\" y=\"76\" width=\"120\" height=\"110\" rx=\"24\" fill=\"none\" stroke=\"url(%23g)\" stroke-width=\"6\"/><circle cx=\"104\" cy=\"118\" r=\"12\" fill=\"%235eead4\"/><circle cx=\"156\" cy=\"118\" r=\"12\" fill=\"%23a78bfa\"/><path d=\"M96 154h68\" stroke=\"url(%23g)\" stroke-width=\"8\" stroke-linecap=\"round\"/></svg>')";
      robot.style.backgroundSize = 'contain';
      robot.style.backgroundRepeat = 'no-repeat';
      robot.style.filter = 'drop-shadow(0 0 24px rgba(94,234,212,.4))';
      container.appendChild(robot);
    }

    return drones;
  }

  function resetStars(state, index) {
    const { starsCanvas, section } = state;
    const rect = section.getBoundingClientRect();
    const width = Math.max(320, Math.floor(window.innerWidth));
    const height = Math.max(420, Math.floor(rect.height + window.innerHeight * 0.1));
    starsCanvas.width = width;
    starsCanvas.height = height;

    const starCount = Math.min(220, Math.max(80, Math.floor(width / 8 + index * 6)));
    state.stars = Array.from({ length: starCount }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: Math.random(),
      radius: 0.4 + Math.random() * 1.8,
      drift: -0.22 + Math.random() * 0.44,
      speed: 0.05 + Math.random() * 0.35,
      blink: Math.random() * Math.PI * 2,
      lane: i % 4,
    }));
  }

  function updatePositions() {
    effects.forEach((state) => {
      const rect = state.section.getBoundingClientRect();
      state.top = rect.top + window.scrollY;
      state.height = rect.height;
      state.effect.style.top = `${state.top - window.innerHeight * 0.05}px`;
      state.effect.style.height = `${Math.max(window.innerHeight * 1.1, state.height + window.innerHeight * 0.18)}px`;
    });
  }

  function drawStars(state, timestamp) {
    const { ctx, starsCanvas, stars, theme } = state;
    if (!ctx) return;
    const palette = paletteByTheme[theme] || paletteByTheme['neon-core'];

    ctx.clearRect(0, 0, starsCanvas.width, starsCanvas.height);

    stars.forEach((star, idx) => {
      star.y += star.speed;
      star.x += Math.sin(timestamp * 0.0002 + star.blink) * 0.12 + star.drift * 0.04;

      if (star.y > starsCanvas.height + 2) {
        star.y = -4;
        star.x = Math.random() * starsCanvas.width;
      }
      if (star.x < -4) star.x = starsCanvas.width + 4;
      if (star.x > starsCanvas.width + 4) star.x = -4;

      const twinkle = 0.35 + (Math.sin(timestamp * 0.0014 + star.blink) + 1) * 0.25;
      const alpha = twinkle * (0.35 + star.z * 0.65);

      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = palette[idx % palette.length].replace(/0\.[0-9]+\)/, `${Math.min(0.95, alpha).toFixed(2)})`);
      ctx.fill();

      if (star.lane === 0 && idx % 6 === 0) {
        ctx.beginPath();
        ctx.moveTo(star.x - 16, star.y);
        ctx.lineTo(star.x + 16, star.y);
        ctx.strokeStyle = palette[(idx + 1) % palette.length].replace(/0\.[0-9]+\)/, `${(alpha * 0.25).toFixed(2)})`);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }

  function updateDrones(state, timestamp) {
    state.drones.forEach((drone, idx) => {
      if (!drone.el) return;
      const x = Math.sin(timestamp * drone.speed + drone.seedX + idx) * (16 + idx * 3);
      const y = Math.cos(timestamp * drone.speed * 1.15 + drone.seedY + idx) * (11 + idx * 2);
      drone.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    });
  }

  function updateActiveState() {
    const viewportMiddle = window.scrollY + window.innerHeight * 0.45;
    effects.forEach((state) => {
      const active = viewportMiddle >= state.top && viewportMiddle <= state.top + state.height;
      if (active !== state.active) {
        state.active = active;
        state.effect.classList.toggle('is-active', active);
      }

      const sectionCenter = state.top + state.height / 2;
      const distance = Math.abs(viewportMiddle - sectionCenter);
      const ratio = Math.max(0.12, 1 - distance / (window.innerHeight * 0.9));
      state.effect.style.opacity = `${(0.2 + ratio * 0.85).toFixed(3)}`;
      state.effect.style.transform = `translateY(${((window.scrollY - state.top) * 0.08).toFixed(2)}px)`;
    });
  }

  let raf = null;
  function frame(timestamp) {
    updateActiveState();
    if (!reduceMotion) {
      effects.forEach((state) => {
        drawStars(state, timestamp);
        updateDrones(state, timestamp);
      });
    }
    raf = requestAnimationFrame(frame);
  }

  sections.forEach(buildSectionEffect);
  updatePositions();

  const resizeObserver = new ResizeObserver(() => {
    updatePositions();
    effects.forEach((state, idx) => resetStars(state, idx));
  });

  sections.forEach((section) => resizeObserver.observe(section));
  window.addEventListener('resize', () => {
    updatePositions();
    effects.forEach((state, idx) => resetStars(state, idx));
  });

  window.addEventListener('scroll', updateActiveState, { passive: true });
  window.addEventListener('beforeunload', () => {
    if (raf) cancelAnimationFrame(raf);
    resizeObserver.disconnect();
  }, { once: true });

  // Decorative helpers for thematic objects in each section.
  // Keeps the style scalable while preserving distinct visual identities.
  const thematicObjects = [
    { id: 'hero', cls: 'cp-orb-041', x: 8, y: 14 },
    { id: 'hero', cls: 'cp-orb-121', x: 82, y: 22 },
    { id: 'servicii', cls: 'cp-line-077', x: 12, y: 34 },
    { id: 'servicii', cls: 'cp-line-144', x: 74, y: 58 },
    { id: 'portfolio', cls: 'cp-orb-199', x: 18, y: 70 },
    { id: 'portfolio', cls: 'cp-line-222', x: 62, y: 40 },
    { id: 'proces', cls: 'cp-orb-255', x: 86, y: 64 },
    { id: 'proces', cls: 'cp-line-205', x: 20, y: 28 },
    { id: 'tehnologii', cls: 'cp-orb-300', x: 8, y: 48 },
    { id: 'tehnologii', cls: 'cp-line-238', x: 68, y: 18 },
    { id: 'testimoniale', cls: 'cp-orb-096', x: 80, y: 30 },
    { id: 'testimoniale', cls: 'cp-line-051', x: 26, y: 72 },
    { id: 'faq', cls: 'cp-orb-311', x: 11, y: 26 },
    { id: 'faq', cls: 'cp-line-117', x: 76, y: 68 },
    { id: 'cta', cls: 'cp-orb-287', x: 84, y: 22 },
    { id: 'cta', cls: 'cp-line-175', x: 18, y: 76 },
  ];

  thematicObjects.forEach((obj) => {
    const state = effects.find((item) => item.section.id === obj.id);
    if (!state) return;
    const node = document.createElement('span');
    node.className = obj.cls;
    node.style.left = `${obj.x}%`;
    node.style.top = `${obj.y}%`;
    node.style.opacity = '0.42';
    state.effect.appendChild(node);
  });

  // Build small tech glyph groups to give each section unique background objects.
  function createGlyph(sectionId, left, top, tone = '#5eead4') {
    const state = effects.find((item) => item.section.id === sectionId);
    if (!state) return;
    const glyph = document.createElement('div');
    glyph.style.position = 'absolute';
    glyph.style.left = `${left}%`;
    glyph.style.top = `${top}%`;
    glyph.style.width = '76px';
    glyph.style.height = '76px';
    glyph.style.border = `1px solid ${tone}`;
    glyph.style.borderRadius = '22px';
    glyph.style.opacity = '0.3';
    glyph.style.boxShadow = `0 0 20px ${tone}44 inset`;
    glyph.style.transform = 'rotate(18deg)';

    const core = document.createElement('div');
    core.style.position = 'absolute';
    core.style.left = '50%';
    core.style.top = '50%';
    core.style.width = '18px';
    core.style.height = '18px';
    core.style.marginLeft = '-9px';
    core.style.marginTop = '-9px';
    core.style.borderRadius = '50%';
    core.style.background = tone;
    core.style.boxShadow = `0 0 14px ${tone}`;
    glyph.appendChild(core);

    state.effect.appendChild(glyph);
  }

  createGlyph('hero', 14, 62, '#5eead4');
  createGlyph('servicii', 84, 24, '#2dd4bf');
  createGlyph('portfolio', 12, 28, '#a78bfa');
  createGlyph('proces', 84, 60, '#fbbf24');
  createGlyph('tehnologii', 50, 16, '#34d399');
  createGlyph('testimoniale', 10, 50, '#f472b6');
  createGlyph('faq', 85, 20, '#7dd3fc');
  createGlyph('cta', 16, 24, '#818cf8');

  // start animation loop as last step
  raf = requestAnimationFrame(frame);
})();
