import type { ArchivistDesk, MapData, Source } from '@allo-central/shared';

const ENTRIES_PER_PAGE = 10;
const SVG_NS = 'http://www.w3.org/2000/svg';
const UNIT = 72;
const PAD = 48;

const DOCUMENTS: { source: Source; title: string; arrives: string }[] = [
  { source: 'directory', title: 'Annuaire', arrives: 'lundi' },
  { source: 'professions', title: 'Professions', arrives: 'mardi' },
  { source: 'map', title: 'Plan', arrives: 'mercredi' },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function svg(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Un document qu'on feuillette : une page à la fois, flèches du clavier comprises. */
function pager(
  count: number,
  render: (index: number) => { title: string; body: HTMLElement },
  unit: string,
): HTMLElement {
  const root = el('section', 'paper');
  root.tabIndex = 0;
  const header = el('header', 'paper-head');
  const title = el('h3');
  const position = el('span', 'paper-position');
  header.append(title, position);
  const body = el('div', 'paper-body');
  const nav = el('nav', 'paper-nav');
  const prev = Object.assign(el('button', '', '‹ Précédente'), { type: 'button' });
  const next = Object.assign(el('button', '', 'Suivante ›'), { type: 'button' });
  nav.append(prev, next);
  root.append(header, body, nav);

  let index = 0;
  const show = (i: number) => {
    index = Math.min(Math.max(i, 0), count - 1);
    const page = render(index);
    title.textContent = page.title;
    position.textContent = `${unit} ${index + 1} / ${count}`;
    body.replaceChildren(page.body);
    prev.disabled = index === 0;
    next.disabled = index === count - 1;
  };
  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  root.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });
  show(0);
  return root;
}

/** L'annuaire : on le feuillette page à page, sans recherche (§7.1, C3.3). */
function directoryView(entries: NonNullable<ArchivistDesk['directory']>): HTMLElement {
  const pages = Math.max(1, Math.ceil(entries.length / ENTRIES_PER_PAGE));
  return pager(
    pages,
    (page) => {
      const slice = entries.slice(page * ENTRIES_PER_PAGE, (page + 1) * ENTRIES_PER_PAGE);
      const list = el('ol', 'directory');
      for (const entry of slice) {
        const item = el('li');
        const name = el('span', 'name');
        name.append(el('strong', '', entry.lastName.toUpperCase()), ` ${entry.household}`);
        item.append(name, el('span', 'dots'), el('span', 'line', String(entry.line)));
        item.append(el('span', 'address', entry.address));
        list.append(item);
      }
      const first = slice[0]?.lastName ?? '';
      const last = slice.at(-1)?.lastName ?? '';
      return { title: `${first.toUpperCase()} — ${last.toUpperCase()}`, body: list };
    },
    'Page',
  );
}

/** Le tiroir des professions : une fiche par métier, sans numéro de téléphone (§7.1). */
function professionsView(cards: NonNullable<ArchivistDesk['professions']>): HTMLElement {
  return pager(
    cards.length,
    (index) => {
      const card = cards[index];
      const list = el('ul', 'card');
      for (const person of card?.people ?? []) {
        const item = el('li');
        item.append(el('strong', '', person.name), el('span', 'address', person.address));
        list.append(item);
      }
      return { title: (card?.profession ?? '').toUpperCase(), body: list };
    },
    'Fiche',
  );
}

/** Le plan : rues, lieux repères et numéros des maisons habitées (§7.1). */
function mapView(map: MapData): HTMLElement {
  const px = (v: number) => PAD + v * UNIT;
  const root = svg('svg', {
    viewBox: `0 0 ${map.width * UNIT + 2 * PAD} ${map.height * UNIT + 2 * PAD}`,
    role: 'img',
    'aria-label': 'Plan de la ville',
    class: 'map',
  });
  for (const street of map.streets) {
    root.append(
      svg('line', {
        x1: px(street.from.x),
        y1: px(street.from.y),
        x2: px(street.to.x),
        y2: px(street.to.y),
        class: 'street',
      }),
    );
  }
  for (const house of map.houses) {
    root.append(
      svg('circle', { cx: px(house.at.x), cy: px(house.at.y), r: 3, class: 'house' }),
      svg(
        'text',
        { x: px(house.at.x) + 5, y: px(house.at.y) - 4, class: 'house-number' },
        String(house.number),
      ),
    );
  }
  // Le nom de chaque rue au milieu de son plus long tronçon entre deux carrefours.
  for (const street of map.streets) {
    const horizontal = street.from.y === street.to.y;
    const along = (p: { x: number; y: number }) => (horizontal ? p.x : p.y);
    const across = horizontal ? street.from.y : street.from.x;
    const [start, end] = [along(street.from), along(street.to)].sort((a, b) => a - b) as [
      number,
      number,
    ];
    const crossings = map.streets
      .filter((other) => (other.from.y === other.to.y) !== horizontal)
      .filter((other) => {
        const [a, b] = horizontal ? [other.from.y, other.to.y] : [other.from.x, other.to.x];
        return Math.min(a, b) <= across && across <= Math.max(a, b);
      })
      .map((other) => (horizontal ? other.from.x : other.from.y))
      .filter((at) => at > start && at < end);
    const stops = [start, ...crossings.sort((a, b) => a - b), end];
    let middle = (start + end) / 2;
    let widest = 0;
    for (let i = 1; i < stops.length; i++) {
      const gap = (stops[i] as number) - (stops[i - 1] as number);
      if (gap > widest) {
        widest = gap;
        middle = ((stops[i] as number) + (stops[i - 1] as number)) / 2;
      }
    }
    const x = px(horizontal ? middle : across);
    const y = px(horizontal ? across : middle);
    root.append(
      svg(
        'text',
        {
          x,
          y: horizontal ? y + 4 : y,
          class: 'street-name',
          'text-anchor': 'middle',
          transform: horizontal ? '' : `rotate(-90 ${x} ${y}) translate(0 4)`,
        },
        street.name,
      ),
    );
  }
  for (const landmark of map.landmarks) {
    const x = px(landmark.at.x);
    const y = px(landmark.at.y);
    root.append(
      svg('rect', { x: x - 8, y: y - 8, width: 16, height: 16, rx: 3, class: 'landmark' }),
      svg('text', { x: x + 12, y: y + 5, class: 'landmark-name' }, landmark.name),
    );
  }
  const wrapper = el('section', 'paper map-paper');
  wrapper.append(root);
  return wrapper;
}

/**
 * Le bureau : un onglet par document, grisé tant qu'il n'est pas arrivé, et la taille du
 * texte réglable (§15).
 */
export function renderDesk(root: HTMLElement, desk: ArchivistDesk, notes: HTMLElement): void {
  const tabs = el('div', 'desk-tabs');
  tabs.setAttribute('role', 'tablist');
  const content = el('div', 'desk-content');
  const zoom = el('div', 'desk-zoom');
  const smaller = Object.assign(el('button', '', 'A−'), {
    type: 'button',
    title: 'Texte plus petit',
  });
  const larger = Object.assign(el('button', '', 'A+'), {
    type: 'button',
    title: 'Texte plus grand',
  });
  zoom.append(smaller, larger);
  let scale = Number(root.style.getPropertyValue('--desk-scale')) || 1;
  const setScale = (value: number) => {
    scale = Math.min(Math.max(value, 0.8), 1.6);
    root.style.setProperty('--desk-scale', String(scale));
  };
  smaller.addEventListener('click', () => setScale(scale - 0.1));
  larger.addEventListener('click', () => setScale(scale + 0.1));

  const views: Record<Source, (() => HTMLElement) | undefined> = {
    directory: desk.directory ? () => directoryView(desk.directory ?? []) : undefined,
    professions: desk.professions ? () => professionsView(desk.professions ?? []) : undefined,
    map: desk.map ? () => mapView(desk.map as MapData) : undefined,
  };
  const buttons = DOCUMENTS.map(({ source, title, arrives }) => {
    const button = Object.assign(el('button', 'desk-tab', title), { type: 'button' });
    button.setAttribute('role', 'tab');
    const open = views[source];
    if (!open) {
      button.disabled = true;
      button.title = `Arrive ${arrives}`;
    }
    button.addEventListener('click', () => {
      for (const b of [...buttons, notesTab]) b.setAttribute('aria-selected', String(b === button));
      content.replaceChildren(open?.() ?? el('p'));
    });
    tabs.append(button);
    return button;
  });
  // Les notes libres, toujours là (§7.2).
  const notesTab = Object.assign(el('button', 'desk-tab', 'Notes'), { type: 'button' });
  notesTab.setAttribute('role', 'tab');
  notesTab.addEventListener('click', () => {
    for (const b of [...buttons, notesTab]) b.setAttribute('aria-selected', String(b === notesTab));
    content.replaceChildren(notes);
  });
  tabs.append(notesTab, zoom);
  root.replaceChildren(tabs, content);
  buttons.find((b) => !b.disabled)?.click();
}
