// ========== Advanced Particles System ==========
(function bootAdvancedParticles() {
  const root = document.getElementById('advanced-particles');
  if (!root) return;

  const COUNT = 120;
  const colors = ['blue', 'purple', 'white'];

  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'adv-particle ' + colors[(Math.random() * colors.length) | 0];

    const size = 3 + Math.random() * 7;
    const left = Math.random() * 100;
    const drift = (Math.random() * 120 - 60) + 'px';
    const dur = 12 + Math.random() * 22;
    const delay = -Math.random() * dur;

    el.style.width = el.style.height = size + 'px';
    el.style.left = left + 'vw';
    el.style.setProperty('--drift', drift);
    el.style.animationDuration = dur + 's';
    el.style.animationDelay = delay + 's';

    root.appendChild(el);
  }

  console.log('[MTECH] Particles initialized:', COUNT);
})();

// Add loaded class after content renders
document.addEventListener('DOMContentLoaded', () => {
  const screenSite = document.querySelector('.screen-site');
  if (screenSite) {
    screenSite.classList.add('loading');
    setTimeout(() => {
      screenSite.classList.remove('loading');
      screenSite.classList.add('loaded');
    }, 100);
  }
});