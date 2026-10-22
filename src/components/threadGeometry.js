// Eight ordered lanes share their vertical knots. Each curve interpolates
// between ordered x coordinates, so neighbouring paths cannot cross.
export const THREAD_COUNT = 8;

export function pointOnLane(knots, y) {
  for (let i = 1; i < knots.length; i++) {
    const from = knots[i - 1], to = knots[i];
    if (y <= to.y) {
      const t = Math.max(0, Math.min(1, (y - from.y) / (to.y - from.y)));
      const ease = t * t * (3 - 2 * t);
      return { x: from.x + (to.x - from.x) * ease, y };
    }
  }
  return { ...knots[knots.length - 1] };
}

export function lanePath(knots) {
  let d = `M ${knots[0].x} ${knots[0].y}`;
  for (let i = 1; i < knots.length; i++) {
    const from = knots[i - 1], to = knots[i];
    const dy = (to.y - from.y) / 3;
    d += ` C ${from.x} ${from.y + dy}, ${to.x} ${to.y - dy}, ${to.x} ${to.y}`;
  }
  return d;
}

export function buildThreadGeometry({ width, hero, field, phone, hub, apps = [], cardCount = 0 }) {
  const paths = [], lanes = [], cardPositions = [];
  const mobile = width <= 760;
  if (field && phone) {
    const stations = [
      { y: -60, center: width * .63, gap: width * .027 },
      { y: hero * .38, center: width * .84, gap: width * .032 },
      { y: hero * .84, center: width * .70, gap: width * .052 },
      { y: field.top, center: width * .50, gap: width * (mobile ? .045 : .105) },
      { y: field.bottom, center: width * .51, gap: width * (mobile ? .04 : .062) },
      { y: phone.top + 30, center: phone.x, gap: mobile ? 5 : 9 },
    ];
    for (let i = 0; i < THREAD_COUNT; i++) {
      const knots = stations.map(station => ({ x: station.center + (i - 3.5) * station.gap, y: station.y }));
      lanes.push(knots);
      paths.push({ id: `lane-${i}`, kind: 'gather', d: lanePath(knots) });
    }
    const assignments = mobile ? [1, 6] : [0, 2, 5, 7, 1, 3, 4, 6];
    for (let i = 0; i < cardCount; i++) {
      const y = field.top + (field.bottom - field.top) * ((i + .5) / cardCount);
      const lane = assignments[i % assignments.length];
      cardPositions.push({ ...pointOnLane(lanes[lane], y), lane });
    }
  }

  // Each side uses its own corridor. The port and tile order agree, keeping
  // the curves disjoint as they fan out from the hub's separate edge ports.
  if (hub) {
    for (const side of ['left', 'right']) {
      const group = apps.map((app, index) => ({ ...app, index })).filter(app => side === 'left' ? app.x < hub.x : app.x >= hub.x).sort((a, b) => a.y - b.y);
      group.forEach((app, i) => {
        const startX = side === 'left' ? hub.left + 3 : hub.right - 3;
        const endX = side === 'left' ? app.right - 2 : app.left + 2;
        const startY = hub.y + (i - (group.length - 1) / 2) * 12;
        const midX = (startX + endX) / 2;
        paths.push({ id: `app-${app.index}`, kind: 'app', d: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${app.y}, ${endX} ${app.y}`, side, startY, endY: app.y });
      });
    }
  }
  return { paths, lanes, cardPositions };
}
