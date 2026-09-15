const TAU = Math.PI * 2;
const FRAME_INTERVAL = 1000 / 30;

/** A quiet, viewport-sized star field behind the portfolio content. */
export function initAmbient(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') return () => {};
  const context = canvas.getContext('2d');
  if (!context) return () => {};

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['105, 247, 222', '158, 131, 255', '218, 232, 255'];
  let width = 0;
  let height = 0;
  let stars = [];
  let links = [];
  let frame = 0;
  let timer = 0;
  let resizeFrame = 0;
  let previousTime = 0;
  let elapsed = 0;
  let disposed = false;
  const pointer = {x: 0, y: 0, currentX: 0, currentY: 0};

  // Stable placement keeps the field from jumping when the viewport resizes.
  function randomSequence() {
    let seed = 8127;
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  function measure() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const random = randomSequence();
    const count = width <= 740 ? 24 : Math.min(60, Math.round(width / 24));
    stars = Array.from({length: count}, (_, index) => ({
      x: random(),
      y: random(),
      phase: random() * TAU,
      depth: .3 + random() * .7,
      radius: index % 11 === 0 ? 1.5 : .45 + random() * .6,
      color: colors[index % colors.length],
      screenX: 0,
      screenY: 0,
    }));

    links = [];
    const reach = Math.min(190, width * .2);
    stars.forEach((star, index) => {
      let nearest = -1;
      let distance = reach;
      for (let next = index + 1; next < stars.length; next++) {
        const candidate = stars[next];
        const separation = Math.hypot((star.x - candidate.x) * width, (star.y - candidate.y) * height);
        if (separation < distance && separation > 35) {
          nearest = next;
          distance = separation;
        }
      }
      if (nearest >= 0 && links.length < 22) links.push([index, nearest]);
    });
  }

  function paint(time) {
    context.clearRect(0, 0, width, height);
    const shiftX = pointer.currentX;
    const shiftY = pointer.currentY;

    // Oversized orbital paths connect the field without enclosing the content.
    context.save();
    context.translate(width * .78 + shiftX * .4, height * .4 + shiftY * .4);
    context.rotate(-.42);
    for (let orbit = 0; orbit < 3; orbit++) {
      const radiusX = width * (.43 + orbit * .105);
      const radiusY = height * (.27 + orbit * .105);
      const gradient = context.createLinearGradient(-radiusX, -radiusY, radiusX, radiusY);
      gradient.addColorStop(0, 'rgba(105, 247, 222, 0)');
      gradient.addColorStop(.3, `rgba(${colors[orbit]}, .105)`);
      gradient.addColorStop(.7, `rgba(${colors[(orbit + 1) % 3]}, .05)`);
      gradient.addColorStop(1, 'rgba(158, 131, 255, 0)');
      context.strokeStyle = gradient;
      context.lineWidth = .65;
      context.beginPath();
      context.ellipse(0, 0, radiusX, radiusY, 0, 0, TAU);
      context.stroke();
    }
    context.restore();

    stars.forEach(star => {
      star.screenX = star.x * width + Math.sin(time * .065 + star.phase) * 7 * star.depth + shiftX * star.depth;
      star.screenY = star.y * height + Math.cos(time * .05 + star.phase) * 9 * star.depth + shiftY * star.depth;
    });

    links.forEach(([first, second]) => {
      const a = stars[first];
      const b = stars[second];
      context.strokeStyle = `rgba(${a.color}, .075)`;
      context.lineWidth = .55;
      context.beginPath();
      context.moveTo(a.screenX, a.screenY);
      context.quadraticCurveTo((a.screenX + b.screenX) / 2, (a.screenY + b.screenY) / 2 - 8, b.screenX, b.screenY);
      context.stroke();
    });

    stars.forEach((star, index) => {
      const opacity = .3 + (.5 + Math.sin(time * .32 + star.phase) * .5) * .35;
      context.fillStyle = `rgba(${star.color}, ${opacity})`;
      context.beginPath();
      context.arc(star.screenX, star.screenY, star.radius, 0, TAU);
      context.fill();
      if (index % 11 !== 0) return;

      const glow = context.createRadialGradient(star.screenX, star.screenY, 0, star.screenX, star.screenY, 13);
      glow.addColorStop(0, `rgba(${star.color}, .16)`);
      glow.addColorStop(1, `rgba(${star.color}, 0)`);
      context.fillStyle = glow;
      context.fillRect(star.screenX - 13, star.screenY - 13, 26, 26);
      context.strokeStyle = `rgba(${star.color}, .18)`;
      context.lineWidth = .6;
      context.beginPath();
      context.moveTo(star.screenX - 5, star.screenY);
      context.lineTo(star.screenX + 5, star.screenY);
      context.moveTo(star.screenX, star.screenY - 5);
      context.lineTo(star.screenX, star.screenY + 5);
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
    context.clearRect(0, 0, width, height);
  };
}
