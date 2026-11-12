// Element builders. Text always goes through textContent, so player-entered
// names can never be interpreted as markup.
function fill(element, props, children) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') element.setAttribute('class', value);
    else if (key === 'on') for (const [type, handler] of Object.entries(value)) element.addEventListener(type, handler);
    else element.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

// replaceChildren that tolerates null entries and nested arrays.
export function swap(element, ...children) {
  element.replaceChildren();
  return fill(element, null, children);
}

export const h = (tag, props, ...children) => fill(document.createElement(tag), props, children);
export const svg = (tag, props, ...children) => fill(document.createElementNS('http://www.w3.org/2000/svg', tag), props, children);

const ICON_PATHS = {
  back: ['M15 5l-7 7 7 7'],
  sound: ['M4 9v6h4l5 4V5L8 9H4z', 'M16.5 8.5a5 5 0 010 7'],
  muted: ['M4 9v6h4l5 4V5L8 9H4z', 'M17 9.5l5 5M22 9.5l-5 5'],
  undo: ['M8 6L3 11l5 5', 'M3 11h11a5 5 0 010 10h-2'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 017 0v3'],
  play: ['M8 5.5v13l11-6.5z'],
  expand: ['M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'],
  book: ['M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2V4z', 'M9 9h6M9 13h6'],
  out: ['M10 5H5v14h5', 'M14 8l4 4-4 4M18 12H9'],
  retry: ['M20 12a8 8 0 11-2.6-5.9', 'M20 4v5h-5'],
};

export function icon(name) {
  return svg('svg', { class: `icon icon--${name}`, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    ICON_PATHS[name].map((d) => svg('path', { d })));
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function formatPercent(value) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}
