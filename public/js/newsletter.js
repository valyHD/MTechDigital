// ========== Newsletter Form Handler ==========
(function setupNewsletter() {
  const form = document.getElementById('mc-news');
  const input = document.getElementById('mc-email');
  const msg = document.getElementById('mc-news-msg');
  
  if (!form || !input || !msg) {
    console.warn('[MTECH] Newsletter form not found');
    return;
  }

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = (input.value || '').trim();
    
    if (!isValidEmail(email)) {
      msg.style.color = '#ffb3b3';
      msg.textContent = 'Te rog introdu o adresă de email validă.';
      return;
    }

    msg.style.color = '';
    msg.textContent = 'Se înregistrează...';

    // Save locally (works offline)
    try {
      const key = 'mtech_news_subs_v1';
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      if (!list.includes(email)) {
        list.push(email);
        localStorage.setItem(key, JSON.stringify(list));
      }
    } catch (err) {
      console.warn('[MTECH] localStorage error:', err);
    }

    // Try push to server (fire-and-forget)
    try {
      if (navigator.sendBeacon) {
        const url = '/subscribe';
        const payload = JSON.stringify({ email, ts: Date.now() });
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      } else if (window.fetch) {
        fetch('/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('[MTECH] Server push error:', err);
    }

    setTimeout(() => {
      msg.style.color = '#a8f4ff';
      msg.textContent = 'Mulțumim — te vom anunța pe ' + email;
      form.reset();
    }, 500);
  }, { passive: false });

  // Update year in footer
  const yEl = document.getElementById('year');
  if (yEl) yEl.textContent = new Date().getFullYear();

  console.log('[MTECH] Newsletter handler initialized');
})();