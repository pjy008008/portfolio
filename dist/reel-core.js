export const reelDistance = (index, cursor) => index - cursor;

export function reelGeometry(height) {
  const radius = height * .68;
  const angle = 18 * Math.PI / 180;
  return {radius, angle, slotHeight: Math.max(1, radius * Math.sin(angle))};
}

export function reelPose(index, cursor, count, height) {
  const distance = reelDistance(index, cursor);
  const depth = Math.abs(distance);
  const {radius, angle} = reelGeometry(height);
  const fade = Math.max(0, Math.min(1, (count / 2 - depth) / .65));
  return {
    distance,
    y: Math.sin(distance * angle) * radius,
    z: (Math.cos(distance * angle) - 1) * radius * .55,
    scale: 1.1 - Math.min(depth, 3) * .055,
    opacity: (1 - Math.min(depth, 2) * .12) * fade
  };
}

export function cursorFromDrag(startCursor, startY, currentY, slotHeight) {
  return startCursor + (startY - currentY) / Math.max(1, slotHeight);
}


export function sectionAtScroll(tops, readingLine, atBottom = false) {
  if (!tops.length) return 0;
  if (atBottom) return tops.length - 1;
  let selected = 0;
  for (let index = 0; index < tops.length; index++) {
    if (tops[index] <= readingLine) selected = index;
    else break;
  }
  return selected;
}
export function scrollPositionFromCursor(cursor, offsets) {
  if (!offsets.length) return 0;
  const position = Math.max(0, Math.min(offsets.length - 1, cursor));
  const start = Math.floor(position);
  const end = Math.min(offsets.length - 1, start + 1);
  return offsets[start] + (offsets[end] - offsets[start]) * (position - start);
}

export function cursorAtScroll(position, offsets) {
  if (offsets.length < 2 || position <= offsets[0]) return 0;
  if (position >= offsets.at(-1)) return offsets.length - 1;
  for (let index = offsets.length - 2; index >= 0; index--) {
    if (position >= offsets[index]) {
      const span = offsets[index + 1] - offsets[index];
      return span > 0 ? index + (position - offsets[index]) / span : index + 1;
    }
  }
  return 0;
}
