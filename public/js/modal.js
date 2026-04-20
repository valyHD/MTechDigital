// ========== Modal System ==========
let modalRoot, backdropEl, dialogEl, titleEl, bodyEl, closeBtn;
let lastFocused = null;

function freezeBody() {
  document.body.classList.add('lock-scroll', 'modal-open');
  document.body.style.overflow = 'hidden';
}

function unfreezeBody() {
  document.body.classList.remove('lock-scroll', 'modal-open');
  document.body.style.overflow = '';
}

export function initModal() {
  if (document.querySelector('.mtk-modal')) return;

  // Create modal structure
  modalRoot = document.createElement('div');
  modalRoot.className = 'mtk-modal';
  modalRoot.setAttribute('role', 'dialog');
  modalRoot.setAttribute('aria-modal', 'true');
  modalRoot.setAttribute('aria-hidden', 'true');

  dialogEl = document.createElement('div');
  dialogEl.className = 'mtk-dialog';
  dialogEl.tabIndex = -1;

  const header = document.createElement('div');
  header.className = 'mtk-modal-header';
  
  titleEl = document.createElement('h2');
  titleEl.id = 'mtk-modal-title';
  titleEl.textContent = 'Detalii';
  
  closeBtn = document.createElement('button');
  closeBtn.className = 'mtk-modal-close';
  closeBtn.setAttribute('aria-label', 'Închide');
  closeBtn.innerHTML = '×';
  
  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  bodyEl = document.createElement('div');
  bodyEl.className = 'mtk-modal-body';
  bodyEl.id = 'mtk-modal-body';

  dialogEl.appendChild(header);
  dialogEl.appendChild(bodyEl);
  modalRoot.appendChild(dialogEl);

  backdropEl = document.createElement('div');
  backdropEl.className = 'mtk-modal-backdrop';
  backdropEl.setAttribute('aria-hidden', 'true');

  document.body.appendChild(backdropEl);
  document.body.appendChild(modalRoot);

  // Event listeners
  closeBtn.addEventListener('click', closeModal);
  backdropEl.addEventListener('click', closeModal);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalRoot.classList.contains('is-open')) {
      closeModal();
    }
  });

  console.log('[MTECH] Modal system initialized');
}

export async function openModal({ title = 'Detalii', src } = {}) {
  if (!modalRoot) initModal();
  
  lastFocused = document.activeElement;
  freezeBody();

  try {
    if (document.body.classList.contains('portal-open')) {
      window.setCSS3DPointer?.(false);
    }
  } catch {}

  titleEl.textContent = title;
  bodyEl.innerHTML = '<p>Se încarcă…</p>';

  try {
    if (src) {
      const res = await fetch(src, { cache: 'no-store' });
      bodyEl.innerHTML = await res.text();
    }
  } catch {
    bodyEl.innerHTML = '<p style="color:#f66">Nu s-a putut încărca conținutul.</p>';
  }

  backdropEl.classList.add('is-open');
  modalRoot.classList.add('is-open');
  modalRoot.setAttribute('aria-hidden', 'false');
  backdropEl.setAttribute('aria-hidden', 'false');
  
  setTimeout(() => dialogEl.focus(), 0);
}

function closeModal() {
  if (!modalRoot) return;
  
  backdropEl.classList.remove('is-open');
  modalRoot.classList.remove('is-open');
  modalRoot.setAttribute('aria-hidden', 'true');
  backdropEl.setAttribute('aria-hidden', 'true');
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      unfreezeBody();
      if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      }
      lastFocused = null;
    });
  });
}

export function attachModalTriggers(rootEl = document) {
  const sel = '[data-modal-src]';
  
  const handler = (e) => {
    const path = (e.composedPath && e.composedPath()) || [];
    const btn = path.find(n => n instanceof Element && n.matches?.(sel));
    if (!btn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    openModal({
      title: btn.getAttribute('data-modal-title') || 'Detalii',
      src: btn.getAttribute('data-modal-src')
    });
  };

  rootEl.removeEventListener('click', rootEl.__modalHandler);
  rootEl.__modalHandler = handler;
  rootEl.addEventListener('click', handler, { capture: true });
}

// Global fallback for inline scripts
window.openModal = openModal;
window.closeModal = closeModal;
window.initModal = initModal;
window.freezeBody = freezeBody;
window.unfreezeBody = unfreezeBody;

// Auto-attach to document on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initModal();
    attachModalTriggers(document);
  });
} else {
  initModal();
  attachModalTriggers(document);
}

console.log('[MTECH] Modal handlers attached');