const FRAME_INTERVAL = 1000 / 30;
const MAX_CANVAS_PIXELS = 4096 * 4096;

/** Slow reflected-light contours behind the portfolio content. */
export function initAmbient(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') return () => {};
  const context = canvas.getContext('2d');
  if (!context) return () => {};

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const contours = [
    {offset: -.19, bend: .09, weight: .5},
    {offset: -.095, bend: .035, weight: .65},
    {offset: -.045, bend: .01, weight: .5},
    {offset: 0, bend: 0, weight: .85},
    {offset: .055, bend: -.015, weight: .5},
    {offset: .135, bend: -.05, weight: .65},
    {offset: .25, bend: -.095, weight: .5},
  ];
  let width = 0;
  let height = 0;
  let frame = 0;
  let timer = 0;
  let resizeFrame = 0;
  let previousTime = 0;
  let elapsed = 0;
  let disposed = false;
  let densityQuery = null;
  const pointer = {x: 0, y: 0, currentX: 0, currentY: 0};

  function measure() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    // Match the display's native density, including Retina and browser zoom.
    // An area budget supports full 4K/5K output without unbounded allocation.
    const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  }

  function watchDensity() {
    densityQuery?.removeEventListener('change', changeDensity);
    densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    densityQuery.addEventListener('change', changeDensity);
  }

  function changeDensity() {
    if (disposed) return;
    watchDensity();
    resize();
  }

  function paint(time) {
    context.clearRect(0, 0, width, height);
    const driftX = Math.sin(time * .035) * 12 + pointer.currentX * .7;
    const driftY = Math.sin(time * .045) * 14 + pointer.currentY * .7;

    // Uneven spacing suggests reflections on a large curved studio surface.
    // Opacity stays constant: the composition moves slowly without pulsing.
    contours.forEach(({offset, bend, weight}, index) => {
      const depth = .45 + index * .07;
      const lift = offset * height + driftY * depth;
      const gradient = context.createLinearGradient(width * .08, height, width * 1.03, height * .1);
      gradient.addColorStop(0, 'rgba(192, 185, 171, 0)');
      gradient.addColorStop(.22, 'rgba(192, 185, 171, .025)');
      gradient.addColorStop(.5, 'rgba(157, 173, 190, .075)');
      gradient.addColorStop(.74, `rgba(230, 231, 228, ${index === 3 ? .16 : .105})`);
      gradient.addColorStop(1, 'rgba(218, 216, 210, 0)');
      context.strokeStyle = gradient;
      context.lineWidth = weight;
      context.beginPath();
      context.moveTo(-width * .14, height * 1.12 + lift);
      context.bezierCurveTo(
        width * .43 + driftX * depth,
        height * (1.02 + bend) + lift,
        width * .4 + driftX,
        height * (.1 - bend) + lift,
        width * 1.16,
        height * .2 + lift * .58,
      );
      context.stroke();
    });
  }

  function stop() {
    window.clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = 0;
    frame = 0;
    previousTime = 0;
  }

  function schedule() {
    if (disposed || document.hidden || motion.matches || timer || frame) return;
    // Limit animation callbacks as well as canvas drawing to about 30 fps.
    timer = window.setTimeout(() => {
      timer = 0;
      frame = requestAnimationFrame(tick);
    }, FRAME_INTERVAL);
  }

  function tick(now) {
    frame = 0;
    if (disposed || document.hidden || motion.matches) return;
    const delta = previousTime ? Math.min((now - previousTime) / 1000, .1) : 0;
    previousTime = now;
    elapsed += delta;
    const follow = 1 - Math.exp(-delta * 2.2);
    pointer.currentX += (pointer.x - pointer.currentX) * follow;
    pointer.currentY += (pointer.y - pointer.currentY) * follow;
    paint(elapsed);
    schedule();
  }

  function syncMotion() {
    stop();
    if (disposed || document.hidden) return;
    if (motion.matches) {
      pointer.currentX = 0;
      pointer.currentY = 0;
      paint(0);
    } else {
      paint(elapsed);
      schedule();
    }
  }

  function resize() {
    if (resizeFrame || disposed) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      measure();
      paint(motion.matches ? 0 : elapsed);
    });
  }

  function movePointer(event) {
    if (motion.matches || event.pointerType === 'touch') return;
    pointer.x = (event.clientX / width - .5) * 16;
    pointer.y = (event.clientY / height - .5) * 12;
  }

  function resetPointer() {
    pointer.x = 0;
    pointer.y = 0;
  }

  window.addEventListener('resize', resize, {passive: true});
  window.addEventListener('pointermove', movePointer, {passive: true});
  document.documentElement.addEventListener('pointerleave', resetPointer, {passive: true});
  document.addEventListener('visibilitychange', syncMotion);
  motion.addEventListener('change', syncMotion);
  measure();
  watchDensity();
  syncMotion();

  return function dispose() {
    disposed = true;
    stop();
    cancelAnimationFrame(resizeFrame);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', movePointer);
    document.documentElement.removeEventListener('pointerleave', resetPointer);
    document.removeEventListener('visibilitychange', syncMotion);
    motion.removeEventListener('change', syncMotion);
    densityQuery?.removeEventListener('change', changeDensity);
    context.clearRect(0, 0, width, height);
  };
}
