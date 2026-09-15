const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const properties = {
  hero: [['--hero-rx', 'deg', 0], ['--hero-ry', 'deg', 0], ['--hero-tx', 'px', 0], ['--hero-ty', 'px', 0]],
  magnet: [['--magnet-x', 'px', 0], ['--magnet-y', 'px', 0]],
  cover: [['--cover-shift', 'px', 0], ['--cover-x', '%', 50], ['--cover-y', '%', 50], ['--cover-light', '', 0]],
};

/** Small, pointer-driven material details; returns a complete cleanup function. */
export function initMaterialInteractions() {
  const states = [];
  const cleanups = [];
  let frame = 0;
  let lastTime = 0;
  let disposed = false;

  function add(target, output, kind) {
    if (!target || !output) return;
    const spec = properties[kind];
    states.push({
      target, output, kind, spec,
      values: spec.map(([, , rest]) => rest),
      destination: spec.map(([, , rest]) => rest),
      previous: spec.map(([name]) => [output.style.getPropertyValue(name), output.style.getPropertyPriority(name)]),
      bounds: null,
      suppressed: false,
    });
  }

  add(document.querySelector('.hero-composition'), document.querySelector('.hero-visual'), 'hero');
  document.querySelectorAll('.profile-actions .text-button').forEach(button => add(button, button, 'magnet'));
  document.querySelectorAll('.project-banner').forEach(banner => add(banner, banner, 'cover'));
  if (!states.length) return () => {};

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const enabled = () => !disposed && finePointer.matches && !reducedMotion.matches && !document.hidden;

  function listen(target, name, callback, options) {
    target.addEventListener(name, callback, options);
    cleanups.push(() => target.removeEventListener(name, callback, options));
  }

  function render(state) {
    state.spec.forEach(([name, unit], index) => {
      state.output.style.setProperty(name, `${state.values[index].toFixed(3)}${unit}`);
    });
  }

  function queue() {
    if (!frame && enabled()) frame = requestAnimationFrame(animate);
  }

  function animate(time) {
    frame = 0;
    if (!enabled()) { resetAll(); return; }
    const delta = lastTime ? Math.min(time - lastTime, 64) : 16;
    lastTime = time;
    const follow = 1 - Math.exp(-delta / 95);
    let moving = false;
    states.forEach(state => {
      let changed = false;
      state.values.forEach((value, index) => {
        const destination = state.destination[index];
        if (value === destination) return;
        const next = value + (destination - value) * follow;
        state.values[index] = Math.abs(destination - next) < .005 ? destination : next;
        changed = true;
        if (state.values[index] !== destination) moving = true;
      });
      if (changed) render(state);
    });
    if (moving) queue();
    else lastTime = 0;
  }

  function reset(state, immediate = false) {
    state.bounds = null;
    state.destination = state.spec.map(([, , rest]) => rest);
    if (immediate) {
      state.values = state.destination.slice();
      render(state);
    } else queue();
  }

  function resetAll() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    states.forEach(state => {
      state.suppressed = false;
      reset(state, true);
    });
  }

  function pointerPosition(state, event) {
    if (!state.bounds) {
      const rect = state.target.getBoundingClientRect();
      // Button bounds are cached before movement and corrected when re-entered
      // mid-return, so the animated button never becomes a moving reference.
      state.bounds = {
        left: rect.left - (state.kind === 'magnet' ? state.values[0] : 0),
        top: rect.top - (state.kind === 'magnet' ? state.values[1] : 0),
        width: rect.width,
        height: rect.height,
      };
    }
    const {left, top, width, height} = state.bounds;
    return [
      clamp(((event.clientX - left) / Math.max(1, width) - .5) * 2, -1, 1),
      clamp(((event.clientY - top) / Math.max(1, height) - .5) * 2, -1, 1),
    ];
  }

  function move(state, event) {
    if (event.pointerType === 'touch') { resetAll(); return; }
    if (!enabled() || event.isPrimary === false) return;
    if (state.kind === 'magnet' && (state.suppressed || state.target.matches(':focus-visible'))) return;
    const [x, y] = pointerPosition(state, event);
    if (state.kind === 'hero') state.destination = [-y * 7, x * 7, x * 6, y * 6];
    if (state.kind === 'magnet') state.destination = [x * 5, y * 5];
    if (state.kind === 'cover') state.destination = [x * 50, (x + 1) * 50, (y + 1) * 50, 1];
    queue();
  }

  states.forEach(state => {
    listen(state.target, 'pointerenter', event => move(state, event), {passive: true});
    listen(state.target, 'pointermove', event => move(state, event), {passive: true});
    listen(state.target, 'pointerleave', () => {
      state.suppressed = false;
      reset(state, !enabled());
    }, {passive: true});
    if (state.kind !== 'magnet') return;
    listen(state.target, 'pointerdown', () => {
      state.suppressed = true;
      // Freeze the hit target through pointerup/click, including edge clicks.
      state.destination = state.values.slice();
    }, {passive: true});
    listen(state.target, 'focus', () => {
      if (state.target.matches(':focus-visible')) reset(state, true);
    });
    listen(state.target, 'keydown', () => reset(state, true));
    listen(state.target, 'blur', () => {
      state.suppressed = false;
      reset(state, true);
    });
  });

  listen(window, 'scroll', resetAll, {passive: true, capture: true});
  listen(window, 'resize', resetAll, {passive: true});
  listen(window, 'blur', resetAll);
  listen(document.documentElement, 'pointerleave', resetAll, {passive: true});
  listen(document, 'visibilitychange', resetAll);
  listen(finePointer, 'change', resetAll);
  listen(reducedMotion, 'change', resetAll);

  return function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    cleanups.forEach(cleanup => cleanup());
    states.forEach(state => {
      state.spec.forEach(([name], index) => {
        const [value, priority] = state.previous[index];
        if (value) state.output.style.setProperty(name, value, priority);
        else state.output.style.removeProperty(name);
      });
    });
  };
}
