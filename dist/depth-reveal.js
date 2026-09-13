const clamp = value => Math.max(0, Math.min(1, value));

export function emergenceProgress(top, viewportHeight, headerHeight = 72) {
  const start = viewportHeight * .96;
  const finish = Math.min(start - 1, Math.max(headerHeight + 48, viewportHeight * .54));
  return clamp((start - top) / (start - finish));
}

export function depthAppearance(progress) {
  const p = clamp(progress);
  const eased = p * p * (3 - 2 * p);
  return {z: -360 * (1 - eased), blur: 10 * (1 - eased), opacity: .06 + .94 * eased};
}

export function createDepthReveal(blocks, isReduced) {
  const states = blocks.map(block => ({block, top:0, current:0, complete:false, painted:-1}));
  const lookup = new Map(states.map(state => [state.block, state]));
  let frame = 0;
  let previousTime = 0;
  let layoutDirty = true;

  states.forEach(({block}) => block.classList.add('depth-reveal'));

  // offsetTop/offsetParent are layout coordinates, unaffected by CSS perspective.
  function documentTop(element) {
    let top = 0;
    for (let node = element; node; node = node.offsetParent) top += node.offsetTop;
    return top;
  }

  function paint(state, progress) {
    if (Math.abs(state.painted - progress) < .0001) return;
    state.painted = progress;
    if (progress === 1) {
      state.block.classList.add('is-surfaced');
      state.block.style.removeProperty('--reveal-z');
      state.block.style.removeProperty('--reveal-blur');
      state.block.style.removeProperty('--reveal-opacity');
      return;
    }
    const {z, blur, opacity} = depthAppearance(progress);
    state.block.classList.remove('is-surfaced');
    state.block.style.setProperty('--reveal-z', z.toFixed(2) + 'px');
    state.block.style.setProperty('--reveal-blur', blur.toFixed(2) + 'px');
    state.block.style.setProperty('--reveal-opacity', opacity.toFixed(4));
  }

  function showAll() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    states.forEach(state => { state.current = 1; state.complete = true; paint(state, 1); });
  }

  function tick(time) {
    frame = 0;
    if (isReduced()) { showAll(); return; }
    if (layoutDirty) {
      // Read all layout positions before any style writes.
      states.forEach(state => { state.top = documentTop(state.block); });
      layoutDirty = false;
    }
    const elapsed = previousTime ? Math.min(64, time - previousTime) : 16;
    previousTime = time;
    const follow = 1 - Math.exp(-elapsed / 95);
    const headerHeight = document.querySelector('.site-header').offsetHeight;
    let moving = false;
    states.forEach(state => {
      let target = state.complete ? 1 : emergenceProgress(state.top - scrollY, innerHeight, headerHeight);
      if (target === 1) state.complete = true;
      state.current += (target - state.current) * follow;
      if (Math.abs(target - state.current) < .001) state.current = target;
      else moving = true;
      paint(state, state.current);
    });
    if (moving) frame = requestAnimationFrame(tick);
    else previousTime = 0;
  }

  function queue() {
    if (isReduced()) return;
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function refresh() { layoutDirty = true; queue(); }
  function updateMotion() { if (isReduced()) showAll(); else refresh(); }

  window.addEventListener('scroll', queue, {passive:true});
  window.addEventListener('resize', refresh);
  new ResizeObserver(refresh).observe(document.querySelector('.detail-stage'));
  document.addEventListener('toggle', refresh, true);
  document.fonts?.ready.then(refresh);
  document.addEventListener('focusin', event => {
    const state = lookup.get(event.target.closest?.('.depth-reveal'));
    if (!state) return;
    state.complete = true;
    state.current = 1;
    paint(state, 1);
  });
  updateMotion();
  return {refresh, updateMotion};
}

