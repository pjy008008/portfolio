import {createDepthReveal} from './depth-reveal.js';
import {wrap, reelDistance, reelGeometry, reelPose, cursorFromDrag, sectionAtScroll, scrollPositionFromCursor, cursorAtScroll} from './reel-core.js';

const items = [...document.querySelectorAll('.reel-item')];
const sections = [...document.querySelectorAll('.detail-panel')];
const viewport = document.querySelector('#reel-viewport');
const scene = document.querySelector('.reel-scene');
const keys = sections.map(section => section.id.replace('panel-', ''));
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let paused = false;
let selected = 0;
let targetCursor = 0;
let animatedCursor = 0;
let reelFrame = 0;
let lastFrame = 0;
let scrollFrame = 0;
let viewportHeight = viewport.clientHeight;
let compact = matchMedia('(max-width: 740px)').matches;
let gesture = null;
let navigationTarget = null;
let navigationTimer = 0;
let announceTimer = 0;
let suppressClickUntil = 0;
const pointers = new Set();

function reducedMotion() { return paused || motionPreference.matches; }
function scrollOffset() { return document.querySelector('.site-header').offsetHeight + 36; }
function sectionOffsets() {
  const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const offset = scrollOffset();
  return sections.map(section => Math.max(0, Math.min(maximum, section.getBoundingClientRect().top + scrollY - offset)));
}
function paint() {
  items.forEach((item, index) => {
    const {distance, y, z, scale, opacity} = reelPose(index, animatedCursor, items.length, viewportHeight);
    const depth = Math.abs(distance);
    item.style.transform = `translate3d(${depth * (compact ? 1 : 2)}px, calc(-50% + ${y}px), ${z}px) rotateX(${-distance * 9}deg) rotateY(${-Math.min(depth, 2) * 2}deg) scale(${scale})`;
    item.style.opacity = opacity;
    item.style.zIndex = String(10 - Math.round(depth * 2));
    item.style.pointerEvents = opacity > .1 ? 'auto' : 'none';
  });
}
function animate(time) {
  const elapsed = lastFrame ? Math.min(64, time - lastFrame) : 16;
  lastFrame = time;
  animatedCursor += (targetCursor - animatedCursor) * (1 - Math.exp(-elapsed / 105));
  if (Math.abs(targetCursor - animatedCursor) < .001 || reducedMotion()) animatedCursor = targetCursor;
  paint();
  if (animatedCursor !== targetCursor) reelFrame = requestAnimationFrame(animate);
  else { reelFrame = 0; lastFrame = 0; }
}
function animateToSelection() {
  if (reducedMotion()) { animatedCursor = targetCursor; paint(); }
  else if (!reelFrame) reelFrame = requestAnimationFrame(animate);
}
function renderSelection({focus = false, announce = false, updateHash = true} = {}) {
  items.forEach((item, index) => {
    const active = index === selected;
    item.classList.toggle('is-selected', active);
    item.tabIndex = active ? 0 : -1;
    if (active) item.setAttribute('aria-current', 'location');
    else item.removeAttribute('aria-current');
  });
  document.querySelector('.skip-link').href = '#panel-' + keys[selected];
  if (updateHash) history.replaceState(null, '', '#' + keys[selected]);
  if (focus) items[selected].focus({preventScroll: true});
  clearTimeout(announceTimer);
  if (announce) announceTimer = setTimeout(() => {
    document.querySelector('#selection-status').textContent =
      `${selected + 1} / ${items.length}, ${items[selected].textContent}로 이동`;
  }, 200);
}
function setActive(index, options = {}) {
  targetCursor += reelDistance(index, targetCursor, items.length);
  selected = index;
  renderSelection(options);
  animateToSelection();
}
function finishNavigation() {
  navigationTarget = null;
  clearTimeout(navigationTimer);
  queueScroll();
}
function navigate(index, {focus = false, instant = false} = {}) {
  if (!Number.isInteger(index) || index < 0 || index >= sections.length) return;
  navigationTarget = index;
  setActive(index, {focus, announce: !instant});
  const top = sectionOffsets()[index];
  window.scrollTo({top, behavior: instant || reducedMotion() ? 'auto' : 'smooth'});
  clearTimeout(navigationTimer);
  navigationTimer = setTimeout(finishNavigation, 1200);
}
function updateScroll() {
  scrollFrame = 0;
  if (gesture || navigationTarget !== null) return;
  const line = scrollY + scrollOffset() + Math.max(0, innerHeight * .18);
  const tops = sections.map(section => section.getBoundingClientRect().top + scrollY);
  const atBottom = scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 3;
  const index = sectionAtScroll(tops, line, atBottom);
  if (index !== selected) setActive(index);
}
function queueScroll() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
}
window.addEventListener('scroll', () => {
  queueScroll();
  if (navigationTarget !== null) {
    clearTimeout(navigationTimer);
    navigationTimer = setTimeout(finishNavigation, 160);
  }
}, {passive: true});
window.addEventListener('scrollend', () => {
  if (navigationTarget !== null) finishNavigation();
});
window.addEventListener('wheel', () => {
  if (gesture) settleDrag(false);
  if (navigationTarget !== null) finishNavigation();
}, {passive: true});
window.addEventListener('touchstart', () => {
  if (navigationTarget !== null) finishNavigation();
}, {passive: true});
window.addEventListener('keydown', event => {
  if (!scene.contains(event.target) && ['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)) finishNavigation();
});
items.forEach((item, index) => item.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(index);
}));
document.querySelectorAll('[data-select]').forEach(control => control.addEventListener('click', event => {
  event.preventDefault();
  navigate(Number(control.dataset.select));
}));
scene.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Escape') { settleDrag(); return; }
  if (!['ArrowDown','ArrowUp','Home','End','PageDown','PageUp'].includes(event.key)) return;
  event.preventDefault();
  settleDrag(false);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
    wrap(selected + (event.key === 'ArrowDown' || event.key === 'PageDown' ? 1 : -1), items.length);
  navigate(index, {focus: true});
});

// Pointer movement turns the reel and scrubs between document sections.
viewport.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pointers.add(event.pointerId);
  if (pointers.size > 1) { settleDrag(false); return; }
  finishNavigation();
  suppressClickUntil = 0;
  cancelAnimationFrame(reelFrame);
  reelFrame = 0;
  lastFrame = 0;
  // Keep the same document position when beginning a drag inside a long section.
  const offsets = sectionOffsets();
  animatedCursor = selected + (animatedCursor - targetCursor);
  targetCursor = selected;
  gesture = {
    id: event.pointerId, x: event.clientX, y: event.clientY,
    cursor: cursorAtScroll(scrollY, offsets),
    slotHeight: reelGeometry(viewportHeight).slotHeight,
    offsets, moved: false
  };
});
viewport.addEventListener('pointermove', event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const dy = event.clientY - gesture.y;
  const dx = event.clientX - gesture.x;
  if (!gesture.moved && Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy)) { settleDrag(false); return; }
  if (!gesture.moved && Math.abs(dy) > 5) {
    gesture.moved = true;
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-dragging');
  }
  if (!gesture.moved) return;
  event.preventDefault();
  animatedCursor = Math.max(0, Math.min(items.length - 1, cursorFromDrag(gesture.cursor, gesture.y, event.clientY, gesture.slotHeight)));
  targetCursor = Math.round(animatedCursor);
  if (targetCursor !== selected) {
    selected = targetCursor;
    renderSelection({updateHash: false});
  }
  paint();
  window.scrollTo({top: scrollPositionFromCursor(animatedCursor, gesture.offsets), behavior: 'auto'});
});
function settleDrag(moveToSection = true) {
  if (!gesture) return;
  const previous = gesture;
  gesture = null;
  viewport.classList.remove('is-dragging');
  if (viewport.hasPointerCapture(previous.id)) viewport.releasePointerCapture(previous.id);
  if (previous.moved) {
    suppressClickUntil = performance.now() + 400;
    selected = Math.round(animatedCursor);
    targetCursor = selected;
    if (moveToSection) navigate(selected);
    else { renderSelection(); animateToSelection(); queueScroll(); }
  } else animateToSelection();
}
function finishGesture(event) {
  pointers.delete(event.pointerId);
  if (gesture?.id === event.pointerId) settleDrag(event.type === 'pointerup');
}
window.addEventListener('pointerup', finishGesture);
window.addEventListener('pointercancel', finishGesture);
viewport.addEventListener('lostpointercapture', event => {
  if (gesture?.id === event.pointerId) settleDrag(false);
});
window.addEventListener('blur', () => { pointers.clear(); settleDrag(false); });
viewport.addEventListener('dragstart', event => event.preventDefault());
viewport.addEventListener('click', event => {
  if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
}, true);

// Content emerges along screen depth as its reading position approaches.
const revealSelector = [
  '.panel-body > .eyebrow', '.panel-body > h1', '.panel-body > h2', '.panel-body > .body-copy',
  '.panel-body > .fact-grid', '.profile-actions', '.resume-metrics', '.project-banner',
  '.section-heading', '.timeline article', '.credential-list > article',
  '.resume-section > .fact-grid', '.architecture-summary', '.case-study',
  '.contact-type', '.contact-links', '.panel-body > .text-button'
].join(',');
const revealBlocks = [...document.querySelectorAll(revealSelector)];
const depthReveal = createDepthReveal(revealBlocks, reducedMotion);
const motionButton = document.querySelector('#motion-toggle');
function updateMotion() {
  const reduce = reducedMotion();
  document.documentElement.dataset.reducedMotion = String(reduce);
  motionButton.setAttribute('aria-pressed', String(reduce));
  motionButton.textContent = reduce ? '모션 꺼짐 ○' : '모션 켜짐 ◉';
  motionButton.disabled = motionPreference.matches;
  motionButton.title = motionPreference.matches ? '기기의 동작 줄이기 설정을 따르고 있어요.' : '애니메이션 켜기 또는 끄기';
  if (reduce) { animatedCursor = targetCursor; paint(); }
  depthReveal.updateMotion();
}
motionButton.addEventListener('click', () => { paused = !paused; updateMotion(); });
motionPreference.addEventListener('change', updateMotion);
new ResizeObserver(() => {
  viewportHeight = viewport.clientHeight;
  compact = matchMedia('(max-width: 740px)').matches;
  paint();
  queueScroll();
}).observe(viewport);
new ResizeObserver(queueScroll).observe(document.querySelector('.detail-stage'));
window.addEventListener('resize', queueScroll);
document.querySelectorAll('details').forEach(detail => detail.addEventListener('toggle', queueScroll));
document.fonts?.ready.then(queueScroll);

function readRoute() {
  const aliases = {top:'profile',about:'career',work:'idea2strategy',flow:'idea2strategy',soom:'drowsiness',frame:'crypto'};
  const hash = location.hash.slice(1).replace(/^panel-/, '');
  return keys.indexOf(aliases[hash] || hash);
}
window.addEventListener('hashchange', () => {
  const index = readRoute();
  if (index >= 0) navigate(index);
});
document.querySelector('#copy-email').addEventListener('click', async () => {
  const status = document.querySelector('.copy-status');
  const email = document.querySelector('#copy-email').dataset.email;
  try { await navigator.clipboard.writeText(email); status.textContent = '이메일 주소를 복사했어요.'; }
  catch { status.textContent = `${email} 주소를 직접 복사해 주세요.`; }
});
selected = Math.max(0, readRoute());
targetCursor = animatedCursor = selected;
renderSelection({updateHash: false});
updateMotion();
paint();
if (readRoute() >= 0) requestAnimationFrame(() => navigate(selected, {instant: true}));
else queueScroll();

