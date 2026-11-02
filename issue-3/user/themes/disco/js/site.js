/* ==== Touch detection (legacy-safe) ==== */
var isTouch = window.DocumentTouch && document instanceof DocumentTouch;

/* ==== Header on scroll ==== */
function scrollHeader() {
  var zvalue = $(document).scrollTop();
  if (zvalue > 75) $("#header").addClass("scrolled");
  else $("#header").removeClass("scrolled");
}

/* ==== Parallax background ==== */
function parallaxBackground() {
  $('.parallax').css('background-positionY', ($(window).scrollTop() * 0.3) + 'px');
}

/* --- helper: mobile SOLO per viewport --- */
function isMobileViewport() {
  return (window.matchMedia && window.matchMedia('(max-width: 767px)').matches);
}

/* ===========================
   jQuery ready
=========================== */
jQuery(document).ready(function($){
  scrollHeader();

  if (!isTouch){
    $(document).scroll(function() {
      scrollHeader();
      parallaxBackground();
    });
  }

  $(document).on('touchmove', function() {
    scrollHeader();
  });

  $('#to-start').click(function(){
    var start_y = $('#start').position().top;
    var header_offset = 45;
    window.scroll({ top: start_y - header_offset, left: 0, behavior: 'smooth' });
    return false;
  });

  $('#to-top').click(function(){
    window.scroll({ top: 0, left: 0, behavior: 'smooth' });
    return false;
  });

  $(".tree").treemenu({delay:300});
});

/* ===========================
   z-index manager per finestre & overlay
=========================== */
let FIN_Z = 1000; // base z-index per .finestra

function bringToFront(win) {
  // porta la finestra in primo piano e l’overlay un gradino sotto
  FIN_Z += 2;
  win.style.zIndex = String(FIN_Z);
  const ov = ensureOverlay();
  ov.style.zIndex = String(FIN_Z - 1);
}

/* ===========================
   Overlay per click-fuori (con click-through)
=========================== */
const OVERLAY_ID = 'finestra-overlay';

function hasOpenWindow() {
  return !!document.querySelector('.finestra.open, .finestra.active');
}

function ensureOverlay() {
  let ov = document.getElementById(OVERLAY_ID);
  if (!ov) {
    ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    Object.assign(ov.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.001)', // invisibile, intercetta click
      display: 'none',
      zIndex: '1', // verrà rialzato da bringToFront()
      cursor: 'default',
      pointerEvents: 'auto'
    });
    document.body.appendChild(ov);

    // click sull’overlay:
    // 1) se sotto c'è un [data-open], simula il suo click (apri altra finestra)
    // 2) altrimenti chiudi la finestra in primo piano
    ov.addEventListener('mousedown', (e) => {
      if (ov.style.pointerEvents === 'none') return; // quando menu mobile è aperto, non gestiamo
      e.preventDefault();

      // --- CLICK-THROUGH: trova l’elemento sotto l’overlay ---
      const prev = ov.style.pointerEvents;
      ov.style.pointerEvents = 'none'; // lascia "passare" il raycast
      const under = document.elementFromPoint(e.clientX, e.clientY);
      ov.style.pointerEvents = prev || 'auto';

      const trigger = under && under.closest && under.closest('[data-open]');
      if (trigger) {
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return;
      }

      // --- Niente trigger sotto: chiudi la top window ---
      const topOpen = document.querySelector('.finestra.open.active') || document.querySelector('.finestra.open');
      if (topOpen && !topOpen.classList.contains('is-dragging')) {
        const closeBtn = topOpen.querySelector('[data-close], .modal__close, .close, .js-close, [aria-label="Chiudi"]');
        if (closeBtn) closeBtn.click();
        else {
          topOpen.classList.remove('open','active','is-dragging');
          // mantieni posizione (no reset --dx/--dy)
        }
      }
    });
  }
  return ov;
}

function setOverlayClickable(enabled) {
  const ov = ensureOverlay();
  ov.style.pointerEvents = enabled ? 'auto' : 'none';
}

function showOverlay() {
  const ov = ensureOverlay();
  // se il menu mobile è aperto, non intercettare i click
  const menuOpen = document.body.classList.contains('mobile-nav-open') ||
                   (document.getElementById('overlay')?.classList.contains('open'));
  ov.style.pointerEvents = menuOpen ? 'none' : 'auto';
  ov.style.display = 'block';
}

function hideOverlayIfNoWindows() {
  const ov = ensureOverlay();
  const anyOpen = hasOpenWindow();
  if (!anyOpen) ov.style.display = 'none';
}

/* ===========================
   Finestre
=========================== */
// Apertura finestre (tollerante a data-open="#id" o "id")
document.querySelectorAll('[data-open]').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault();
    let raw = btn.dataset.open || '';
    const id = raw.startsWith('#') ? raw.slice(1) : raw;

    // Chiudi tutte le altre (comportamento "una alla volta")
    document.querySelectorAll('.finestra').forEach(f => f.classList.remove('open','active'));

    const win = document.getElementById(id);
    if (win) {
      win.classList.add('open','active');
      bringToFront(win);                     // top + overlay sotto
      win.dispatchEvent(new Event('mousedown')); // focus
      showOverlay();
    }
  });
});

// Focus finestra (porta in primo piano)
document.querySelectorAll('.finestra').forEach(win => {
  win.addEventListener('mousedown', () => {
    document.querySelectorAll('.finestra').forEach(f => f.classList.remove('active'));
    win.classList.add('active');
    bringToFront(win); // sempre top quando la tocchi/trascini
  });
});

/* === Drag solo desktop === */
if (!isMobileViewport()) {
  document.querySelectorAll('.finestra').forEach(win => {
    const header = win.querySelector('[data-drag-handle]');
    let startX=0,startY=0,offsetX=0,offsetY=0,isDragging=false,dragArmed=false,w=0,h=0;
    const THRESHOLD=3;
    const setDelta=(dx,dy)=>{win.style.setProperty('--dx',dx+'px');win.style.setProperty('--dy',dy+'px');};

    const onMove=(e)=>{
      const isTouchEv=e.type&&e.type.includes('touch');
      const clientX=isTouchEv?e.touches[0].clientX:e.clientX;
      const clientY=isTouchEv?e.touches[0].clientY:e.clientY;
      if(!dragArmed)return;
      if(!isDragging){
        const dx0=Math.abs(clientX-startX),dy0=Math.abs(clientY-startY);
        if(dx0<THRESHOLD&&dy0<THRESHOLD)return;
        isDragging=true;win.classList.add('is-dragging');win.style.willChange='transform';
      }
      if(isTouchEv)e.preventDefault();
      const targetLeft=clientX-offsetX,targetTop=clientY-offsetY;
      const parentCenterX=window.innerWidth/2,parentCenterY=window.innerHeight/2;
      const dx=targetLeft-(parentCenterX-w/2),dy=targetTop-(parentCenterY-h/2);
      setDelta(dx,dy);
    };
    const onUp=()=>{
      dragArmed=false;isDragging=false;win.classList.remove('is-dragging');win.style.willChange='';
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
      document.removeEventListener('touchmove',onMove);
      document.removeEventListener('touchend',onUp);
    };
    const onDown=(e)=>{
      if(e.target.closest('[data-close],a,button,input,textarea,select,[role="button"]'))return;
      if(e.type==='mousedown'&&e.button!==0)return;
      const isTouchEv=e.type&&e.type.includes('touch');
      const clientX=isTouchEv?e.touches[0].clientX:e.clientX;
      const clientY=isTouchEv?e.touches[0].clientY:e.clientY;
      const rect=win.getBoundingClientRect();w=rect.width;h=rect.height;
      offsetX=clientX-rect.left;offsetY=clientY-rect.top;
      startX=clientX;startY=clientY;dragArmed=true;isDragging=false;
      e.preventDefault();
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
      document.addEventListener('touchmove',onMove,{passive:false});
      document.addEventListener('touchend',onUp);
    };
    if(header){
      header.addEventListener('mousedown',onDown);
      header.addEventListener('touchstart',onDown,{passive:false});
    }
    // nessun reset della posizione → mantieni --dx/--dy
  });
}

/* === Close finestra === */
function closeFinestraFrom(el) {
  const win = el.closest('.finestra');
  if (win) {
    win.classList.remove('open','active','is-dragging');
    // mantieni posizione
  }
  hideOverlayIfNoWindows();
}

// cattura click sulla X
['pointerup','click'].forEach(ev=>{
  document.addEventListener(ev,(e)=>{
    const btn=e.target.closest('[data-close]');
    if(!btn)return;
    e.preventDefault();e.stopImmediatePropagation();
    closeFinestraFrom(btn);
  },true);
});

// blocca drag se parte dalla X
['pointerdown','mousedown','touchstart'].forEach(ev=>{
  document.addEventListener(ev,(e)=>{
    if(e.target.closest('[data-close]'))e.stopImmediatePropagation();
  },true);
});

// Accessibilità: Enter/Space sulla X
document.addEventListener('keydown',(e)=>{
  const active=document.activeElement;
  if(active&&active.matches('[data-close]')&&(e.key==='Enter'||e.key===' ')){
    e.preventDefault();closeFinestraFrom(active);
  }
});

/* ===========================
   Responsive Menu
=========================== */
document.addEventListener('DOMContentLoaded',()=>{
  const btn=document.getElementById('toggle');
  const menuOverlay=document.getElementById('overlay'); // overlay del MENU mobile
  if(!btn||!menuOverlay)return;

  const setOpen=(open)=>{
    btn.classList.toggle('active',open);
    menuOverlay.classList.toggle('open',open);
    document.body.classList.toggle('mobile-nav-open',open);
    btn.setAttribute('aria-expanded',open?'true':'false');

    // Quando il menu è aperto, disattiva i click sull'overlay delle finestre
    // Quando si richiude, riattivali solo se c'è una finestra aperta
    if (open) {
      setOverlayClickable(false);
    } else {
      setOverlayClickable(hasOpenWindow());
    }
  };

  btn.setAttribute('role','button');
  btn.setAttribute('aria-controls','overlay');
  btn.setAttribute('aria-expanded','false');

  btn.addEventListener('click',()=>setOpen(!menuOverlay.classList.contains('open')));

  btn.addEventListener('keydown',(e)=>{
    if(e.key==='Enter'||e.key===' '){
      e.preventDefault();
      setOpen(!menuOverlay.classList.contains('open'));
    }
  });

  menuOverlay.addEventListener('click',(e)=>{
    if(e.target===menuOverlay||e.target.closest('a')) setOpen(false);
  });
});

/* ===========================
   ESC unificato (priorità: menu -> finestra)
=========================== */
document.addEventListener('keydown',(e)=>{
  if(e.key!=='Escape')return;

  // 1) menu mobile
  const menuOverlay=document.getElementById('overlay');
  const btn=document.getElementById('toggle');
  if(menuOverlay&&menuOverlay.classList.contains('open')){
    menuOverlay.classList.remove('open');
    document.body.classList.remove('mobile-nav-open');
    if(btn){btn.classList.remove('active');btn.setAttribute('aria-expanded','false');}
    // riattiva overlay finestre solo se serve
    setOverlayClickable(hasOpenWindow());
    return;
  }

  // 2) finestra
  const openWin=document.querySelector('.finestra.open,.finestra.active');
  if(openWin){
    const closeBtn=openWin.querySelector('[data-close],.modal__close,.close,.js-close,[aria-label="Chiudi"]');
    if(closeBtn) closeBtn.click();
    else{
      openWin.classList.remove('open','active','is-dragging');
      // mantieni posizione
    }
    hideOverlayIfNoWindows();
  }
});
