import { svg } from './dom.js';
import { shootingPercent } from './rules.js';

// Half-court line drawing. `activeIndex` highlights where to stand during a drill;
// `results` (per-spot makes/attempts) turns it into the post-workout shot map.
export function courtDiagram(drill, { activeIndex = null, results = null, label } = {}) {
  const lines = [
    svg('path', { d: 'M0 10H300V250H0Z' }),
    svg('path', { d: 'M102 10V124H198V10' }),
    svg('circle', { cx: 150, cy: 124, r: 36 }),
    svg('path', { d: 'M18 10V95.2A142.5 142.5 0 0 0 282 95.2V10' }),
    svg('path', { d: 'M132 34H168' }),
    svg('circle', { cx: 150, cy: 41.5, r: 5 }),
  ];
  const marks = (drill.spots || []).map((spot, index) => {
    const result = results?.[index];
    const classes = ['court__spot'];
    if (index === activeIndex) classes.push('is-active');
    let intensity = null;
    if (result?.attempts) {
      intensity = shootingPercent(result.makes, result.attempts) / 100;
      classes.push('is-result');
    }
    // Keep result labels inside the drawing for corner spots.
    const labelX = Math.min(Math.max(spot.x, 16), 284);
    return svg('g', { class: classes.join(' ') },
      svg('circle', { cx: spot.x, cy: spot.y, r: results ? 15 : 9, style: intensity === null ? null : `--hit:${intensity.toFixed(2)}` }),
      result?.attempts ? svg('text', { x: labelX, y: spot.y + 32, 'text-anchor': 'middle' }, `${result.makes}/${result.attempts}`) : null);
  });
  return svg('svg', {
    class: `court${results ? ' court--results' : ''}`,
    viewBox: '-14 0 328 262',
    role: 'img',
    'aria-label': label || `${drill.title} court spots`,
  }, svg('g', { class: 'court__lines' }, lines), marks);
}
