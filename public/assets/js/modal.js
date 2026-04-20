// /assets/js/modal.js
let modalRoot, backdropEl, dialogEl, titleEl, bodyEl, closeBtn;
let lastFocused = null;
const FOCUSABLE = 'a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
let __bodyFreeze = { active: false, y: 0 };
let __freeze = { on:false, y:0 };

function freezeBody() {
  if (__freeze.on) return;
  // recalculează lățimea barei de scroll și compensează layout-ul
  const pr = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.paddingRight = pr > 0 ? pr + 'px' : '';

  __freeze.y = window.scrollY || 0;
  const b = document.body;
  b.style.position = 'fixed';
  b.style.top = `-${__freeze.y}px`;
  b.style.left = '0';
  b.style.right = '0';
  b.style.width = '100%';
  b.style.overflow = 'hidden';
  b.classList.add('lock-scroll','modal-open');
  __freeze.on = true;
}

function unfreezeBody() {
  if (!__freeze.on) return;
  const y = __freeze.y || 0;
  const b = document.body;
  b.style.position = '';
  b.style.top = '';
  b.style.left = '';
  b.style.right = '';
  b.style.width = '';
  b.style.overflow = '';
  b.classList.remove('lock-scroll','modal-open');
  b.style.paddingRight = ''; // scoate compensația
  __freeze.on = false;
  window.scrollTo({ top: y, behavior: 'auto' });
}




function lockBodyScroll() {
  // lățimea barei de scroll: cât „micșorează” innerWidth față de layout
  const pr = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.paddingRight = pr + 'px';
  document.body.classList.add('lock-scroll', 'modal-open');
}

function unlockBodyScroll() {
  document.body.classList.remove('lock-scroll', 'modal-open');
  document.body.style.paddingRight = '';
}

export function initModal(){
  backdropEl = document.createElement('div');
  backdropEl.className = 'mtk-modal-backdrop';
  backdropEl.setAttribute('aria-hidden', 'true');

  modalRoot = document.createElement('div');
  modalRoot.className = 'mtk-modal';
  modalRoot.setAttribute('role','dialog');
  modalRoot.setAttribute('aria-modal','true');
  modalRoot.setAttribute('aria-hidden','true');
  modalRoot.innerHTML = `
    <div class="mtk-dialog" tabindex="-1">
      <div class="mtk-head">
        <h3 class="mtk-title" id="mtk-modal-title">Detalii</h3>
        <button class="mtk-close" type="button" aria-label="Închide (Esc)">✕</button>
      </div>
      <div class="mtk-body" id="mtk-modal-body"></div>
    </div>
  `;

  dialogEl = modalRoot.querySelector('.mtk-dialog');
  titleEl  = modalRoot.querySelector('#mtk-modal-title');
  bodyEl   = modalRoot.querySelector('#mtk-modal-body');
  closeBtn = modalRoot.querySelector('.mtk-close');

  document.body.appendChild(backdropEl);
  document.body.appendChild(modalRoot);

  backdropEl.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  window.addEventListener('keydown', (e)=>{
    if (modalIsOpen() && e.key === 'Escape') closeModal();
    if (modalIsOpen() && e.key === 'Tab') trapFocus(e);
  });
}

export function attachModalTriggers(rootEl = document) {
  const sel = '[data-modal-src]';
  // un singur listener global; dacă îl chemi de 2 ori, îl lași să fie idempotent
  document.removeEventListener('__mtk_modal_click', document.__mtkModalHandler);
  if (document.__mtkModalHandler) {
    document.removeEventListener('click', document.__mtkModalHandler, { capture: true });
  }
  document.__mtkModalHandler = async function (e) {
    // caută în composedPath primul element cu atribut, dar care aparține rootEl
    const path = (e.composedPath && e.composedPath()) || [];
    let btn = path.find(n => n instanceof Element && n.matches?.(sel)) || null;
    if (!btn || (rootEl && !rootEl.contains(btn))) return;

    e.preventDefault();

    await openModal({
      title: btn.getAttribute('data-modal-title') || 'Detalii',
      src: btn.getAttribute('data-modal-src')
    });
  };
document.addEventListener('click', document.__mtkModalHandler, { capture: true });
}

export async function openModal({ title = 'Detalii', src } = {}){
  if (!src) return;

  lastFocused = document.activeElement;
freezeBody();

  try {
   if (document.body.classList.contains('portal-open')) {
     window.setCSS3DPointer?.(false);
    }
  } catch {}

  titleEl.textContent = title;
  bodyEl.innerHTML = '<p>Se încarcă…</p>';

  try{
    const res = await fetch(src, { cache: 'no-store' });
    const html = await res.text();
    bodyEl.innerHTML = html;
  }catch(err){
    bodyEl.innerHTML = `<p style="color:#f66">Nu s-a putut încărca conținutul.</p>`;
  }

  backdropEl.classList.add('is-open');
  modalRoot.classList.add('is-open');
  modalRoot.setAttribute('aria-hidden','false');
  backdropEl.setAttribute('aria-hidden','false');

  setTimeout(()=> dialogEl.focus(), 0);
}

export function closeModal(){
  if (!modalIsOpen()) return;

  modalRoot.classList.remove('is-open');
  backdropEl.classList.remove('is-open');
  modalRoot.setAttribute('aria-hidden','true');
  backdropEl.setAttribute('aria-hidden','true');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      unfreezeBody();
    });
  });

  try {
    // Repornește hit-test-ul DOAR dacă portalul e din nou în scenă
    if (document.body.classList.contains('portal-open')) {
      window.setCSS3DPointer?.(true);
    }
  } catch {}

   if (lastFocused && typeof lastFocused.focus === 'function') {
     lastFocused.focus();
   }
}

function modalIsOpen(){ return modalRoot?.classList.contains('is-open'); }

function trapFocus(e){
  const nodes = dialogEl.querySelectorAll(FOCUSABLE);
  if (!nodes.length) return;
  const focusables = Array.from(nodes);
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first){
    last.focus(); e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === last){
    first.focus(); e.preventDefault();
  }
}
