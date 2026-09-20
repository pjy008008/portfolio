// Each calendar year gets one equal-width column, including leap years.
export function timelinePosition(value, firstYear = 2017, endYear = 2027) {
  // Year-only records align with that year's tick without inventing a month or day.
  if (typeof value === 'string' && /^\d{4}$/.test(value)) {
    return Math.max(0, Math.min(100, (Number(value) - firstYear) / (endYear - firstYear) * 100));
  }
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const fraction = year + (date.getTime() - start) / (end - start);
  return Math.max(0, Math.min(100, (fraction - firstYear) / (endYear - firstYear) * 100));
}

export function initBioTimeline(now = new Date()) {
  document.querySelectorAll('.bio-chart').forEach(chart => {
    const firstYear = Number(chart.dataset.firstYear);
    const endYear = Number(chart.dataset.endYear);
    chart.querySelectorAll('[data-start]').forEach(period => {
      const start = timelinePosition(period.dataset.start, firstYear, endYear);
      const end = timelinePosition(period.dataset.end === 'present' ? now : period.dataset.end, firstYear, endYear);
      period.style.setProperty('--start', `${start}%`);
      period.style.setProperty('--duration', `${Math.max(0, end - start)}%`);
    });
    initBioConnectors(chart);
  });
  return initBioTooltips();
}

// Keep each icon at its date unless its neighbour or the chart edge needs room.
export function layoutTimelineEvents(targets, width, iconWidth, gap) {
  const half = iconWidth / 2;
  const spacing = iconWidth + gap;
  const centers = targets.map(target => Math.max(half, Math.min(width - half, target)));
  for (let index = 1; index < centers.length; index++) {
    centers[index] = Math.max(centers[index], centers[index - 1] + spacing);
  }
  if (centers.length) centers[centers.length - 1] = Math.min(centers.at(-1), width - half);
  for (let index = centers.length - 2; index >= 0; index--) {
    centers[index] = Math.min(centers[index], centers[index + 1] - spacing);
  }
  return centers;
}

// Each connector still ends at the recorded date after collision adjustment.
const connectorObservers = new WeakMap();

function initBioConnectors(chart) {
  if (connectorObservers.has(chart)) return;
  const plot = chart.querySelector('.bio-plot');
  const eventRow = chart.querySelector('.bio-events');
  const svg = chart.querySelector('.bio-connectors');
  const baseline = chart.querySelector('.bio-band');
  if (!plot || !eventRow || !svg || !baseline) return;
  const firstYear = Number(chart.dataset.firstYear);
  const endYear = Number(chart.dataset.endYear);
  const records = [...chart.querySelectorAll('.bio-event')].map(event => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', `bio-connector ${event.classList.contains('award') ? 'award' : 'credential'}`);
    path.dataset.date = event.dataset.date;
    return {event, path, at: timelinePosition(event.dataset.date, firstYear, endYear)};
  });
  svg.replaceChildren(...records.map(record => record.path));
  let frame = 0;
  const draw = () => {
    frame = 0;
    const bounds = plot.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const width = plot.clientWidth;
    const height = plot.clientHeight;
    const iconWidth = records[0]?.event.offsetWidth || 0;
    const gap = parseFloat(getComputedStyle(eventRow).getPropertyValue('--bio-event-gap')) || 0;
    const centers = layoutTimelineEvents(records.map(record => record.at / 100 * width), width, iconWidth, gap);
    records.forEach(({event}, index) => event.style.setProperty('--event-x', `${centers[index]}px`));
    // Work in layout units even while the surrounding reveal is scaled.
    const scaleX = width / bounds.width;
    const scaleY = height / bounds.height;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const endY = (baseline.getBoundingClientRect().top - bounds.top) * scaleY;
    records.forEach(({event, path, at}) => {
      const icon = event.querySelector('.bio-event-symbol').getBoundingClientRect();
      const startX = (icon.left + icon.width / 2 - bounds.left) * scaleX;
      const startY = (icon.bottom - bounds.top) * scaleY + 2;
      const endX = at / 100 * width;
      const middleY = (startY + endY) / 2;
      path.setAttribute('d', `M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`);
    });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(plot);
  connectorObservers.set(chart, observer);
  schedule();
}

let disposeBioTooltips = null;

export function initBioTooltips() {
  if (disposeBioTooltips) return disposeBioTooltips;
  const triggers = [...document.querySelectorAll('.bio-trigger')];
  if (!triggers.length) return () => {};

  const tooltip = document.createElement('div');
  tooltip.className = 'bio-tooltip';
  let id = 'bio-tooltip';
  for (let suffix = 1; document.getElementById(id); suffix++) id = `bio-tooltip-${suffix}`;
  tooltip.id = id;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  const parts = ['date', 'title', 'description'].map(name => {
    const part = document.createElement('div');
    part.className = `bio-tooltip-${name}`;
    tooltip.append(part);
    return part;
  });
  document.body.append(tooltip);

  const cleanups = [];
  let active = null;
  let hovered = null;
  let focused = null;
  let pinned = null;
  let overTooltip = false;
  let leaveTimer = 0;
  let focusTimer = 0;
  let pendingFocus = null;
  let disposed = false;

  function listen(target, name, callback, options) {
    target.addEventListener(name, callback, options);
    cleanups.push(() => target.removeEventListener(name, callback, options));
  }

  function visibleRect(trigger) {
    const viewportWidth = document.documentElement.clientWidth || innerWidth;
    const viewportHeight = document.documentElement.clientHeight || innerHeight;
    const rect = trigger.getBoundingClientRect();
    const container = trigger.closest('.bio-chart-scroll') || trigger.closest('.bio-overview');
    const clip = container.getBoundingClientRect();
    const left = Math.max(0, rect.left, clip.left);
    const top = Math.max(0, rect.top, clip.top);
    const right = Math.min(viewportWidth, rect.right, clip.right);
    const bottom = Math.min(viewportHeight, rect.bottom, clip.bottom);
    return right > left && bottom > top ? {left, top, right, bottom} : null;
  }

  function position(trigger) {
    const anchor = visibleRect(trigger);
    if (!anchor) return false;
    const viewportWidth = document.documentElement.clientWidth || innerWidth;
    const viewportHeight = document.documentElement.clientHeight || innerHeight;
    const margin = 12;
    const gap = 12;
    tooltip.style.position = 'fixed';
    tooltip.style.maxWidth = `${Math.min(300, Math.max(0, viewportWidth - margin * 2))}px`;
    tooltip.style.maxHeight = `${Math.max(0, viewportHeight - margin * 2)}px`;
    tooltip.style.overflowY = 'auto';
    const {width, height} = tooltip.getBoundingClientRect();
    const x = (anchor.left + anchor.right - width) / 2;
    const y = (anchor.top + anchor.bottom - height) / 2;
    const obstacles = triggers.filter(item => item !== trigger && item.closest('.bio-event')).map(visibleRect).filter(Boolean);
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const candidates = [
      ['left', anchor.left - width - gap, y], ['right', anchor.right + gap, y],
      ['bottom', x, anchor.bottom + gap], ['top', x, anchor.top - height - gap]
    ].map(([placement, left, top], index) => {
      const boundedLeft = Math.max(margin, Math.min(viewportWidth - width - margin, left));
      const boundedTop = Math.max(margin, Math.min(viewportHeight - height - margin, top));
      const box = {left: boundedLeft, top: boundedTop, right: boundedLeft + width, bottom: boundedTop + height};
      const score = overlap(box, anchor) * 10 + obstacles.reduce((sum, rect) => sum + overlap(box, rect), 0) +
        Math.abs(boundedLeft - left) + Math.abs(boundedTop - top) + index;
      return {placement, left: boundedLeft, top: boundedTop, score};
    });
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    tooltip.style.left = `${best.left}px`;
    tooltip.style.top = `${best.top}px`;
    tooltip.dataset.placement = best.placement;
    return true;
  }

  function detach() {
    if (!active) return;
    active.classList.remove('is-active');
    const ids = (active.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== id);
    if (ids.length) active.setAttribute('aria-describedby', ids.join(' '));
    else active.removeAttribute('aria-describedby');
    active = null;
  }

  function hide() {
    clearTimeout(leaveTimer);
    clearTimeout(focusTimer);
    leaveTimer = focusTimer = 0;
    pendingFocus = hovered = focused = pinned = null;
    overTooltip = false;
    tooltip.hidden = true;
    detach();
  }

  function show(trigger, source) {
    if (source === 'hover' && ((focused && focused !== trigger) || (pinned && pinned !== trigger))) return;
    clearTimeout(leaveTimer);
    clearTimeout(focusTimer);
    focusTimer = 0;
    pendingFocus = null;
    if (active !== trigger) { detach(); pinned = null; }
    active = trigger;
    if (document.activeElement === trigger) focused = trigger;
    const summary = trigger.querySelector(':scope > .sr-only');
    ['date', 'title', 'description'].forEach((name, index) => {
      parts[index].textContent = summary?.querySelector(`[data-bio-${name}]`)?.textContent.trim() || '';
      parts[index].hidden = !parts[index].textContent;
    });
    tooltip.hidden = false;
    if (!position(trigger)) { hide(); return; }
    trigger.classList.add('is-active');
    const describedBy = new Set((trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    describedBy.add(id);
    trigger.setAttribute('aria-describedby', [...describedBy].join(' '));
  }

  function leave() {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (active && hovered !== active && focused !== active && pinned !== active && !overTooltip) hide();
    }, 180);
  }

  function queueFocus(trigger) {
    clearTimeout(focusTimer);
    pendingFocus = trigger;
    focused = trigger;
    // Native Tab focus may scroll the chart before its scroll event is delivered.
    focusTimer = setTimeout(() => {
      focusTimer = 0;
      pendingFocus = null;
      if (document.activeElement === trigger) show(trigger, 'focus');
    }, 80);
  }

  triggers.forEach(trigger => {
    listen(trigger, 'pointerenter', event => {
      if (event.pointerType === 'touch') return;
      hovered = trigger;
      show(trigger, 'hover');
    });
    listen(trigger, 'pointerleave', () => { if (hovered === trigger) hovered = null; leave(); });
    listen(trigger, 'focus', () => queueFocus(trigger));
    listen(trigger, 'blur', () => {
      if (pendingFocus === trigger) { clearTimeout(focusTimer); focusTimer = 0; pendingFocus = null; }
      if (focused === trigger) focused = null;
      if (pinned === trigger) pinned = null;
      leave();
    });
    listen(trigger, 'click', () => {
      if (active === trigger && pinned === trigger) { hide(); return; }
      show(trigger, 'click');
      if (active === trigger) pinned = trigger;
    });
  });
  listen(tooltip, 'pointerenter', () => { overTooltip = true; clearTimeout(leaveTimer); });
  listen(tooltip, 'pointerleave', () => { overTooltip = false; leave(); });
  listen(document, 'pointerdown', event => {
    if (tooltip.contains(event.target) || active?.contains(event.target) || pendingFocus?.contains(event.target)) return;
    hide();
  }, true);
  listen(document, 'keydown', event => {
    if (['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) hide();
  });
  listen(window, 'scroll', event => {
    if (tooltip.contains(event.target)) return;
    const nextFocus = pendingFocus;
    hide();
    if (nextFocus && document.activeElement === nextFocus) queueFocus(nextFocus);
  }, {capture: true, passive: true});
  listen(window, 'wheel', event => { if (!tooltip.contains(event.target)) hide(); }, {passive: true});
  listen(window, 'resize', hide);
  listen(window, 'blur', hide);

  disposeBioTooltips = () => {
    if (disposed) return;
    disposed = true;
    hide();
    cleanups.forEach(cleanup => cleanup());
    tooltip.remove();
    disposeBioTooltips = null;
  };
  return disposeBioTooltips;
}
