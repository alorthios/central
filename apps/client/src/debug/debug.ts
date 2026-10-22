import {
  ARCHIVIST_LINE,
  BALANCE,
  addressPoint,
  formatGameTime,
  generateCity,
  generateRequests,
  scheduleDay,
  type CallRequest,
  type City,
  type ScheduledCall,
  type Subscriber,
} from '@allo-central/shared';
import './debug.css';

/**
 * Page de debug (`?debug`) : la ville générée et une journée qui défile en accéléré.
 * Personne ne répond aux appels : chaque client finit par raccrocher, ce qui montre
 * la charge brute de la journée.
 */

const SPEEDS = [1, 5, 20, 60];
const LINES = Array.from({ length: 80 }, (_, i) => ARCHIVIST_LINE + i);
const SVG_NS = 'http://www.w3.org/2000/svg';
const UNIT = 56;
const PAD = 40;

interface Day {
  city: City;
  calls: ScheduledCall[];
  /** Une demande par appel, dans le même ordre que `calls`. */
  requests: CallRequest[];
  callByLine: Map<number, ScheduledCall>;
  subscriberByLine: Map<number, Subscriber>;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  el.append(...children);
  return el;
}

function svg(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (text !== undefined) el.textContent = text;
  return el;
}

function intParam(params: URLSearchParams, name: string, fallback: number): number {
  const value = Number.parseInt(params.get(name) ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function patience(call: ScheduledCall): number {
  return BALANCE.patienceMs[call.kind];
}

function describe(subscriber: Subscriber | undefined): string {
  if (!subscriber) return '?';
  const household = subscriber.spouse
    ? `${subscriber.holder.firstName} et ${subscriber.spouse.firstName}`
    : subscriber.holder.firstName;
  const job = subscriber.profession ? ` (${subscriber.profession})` : '';
  return `${subscriber.lastName} ${household}${job}`;
}

function buildDay(seed: number, dayIndex: number): Day {
  const city = generateCity(seed);
  const config = BALANCE.week[dayIndex] ?? BALANCE.week[0];
  const calls = scheduleDay(seed, config);
  return {
    city,
    calls,
    requests: generateRequests(seed, city, calls, config),
    callByLine: new Map(calls.map((c) => [c.callerLine, c])),
    subscriberByLine: new Map(city.subscribers.map((s) => [s.line, s])),
  };
}

export function mountDebug(root: HTMLElement): void {
  const params = new URLSearchParams(location.search);
  let seed = intParam(params, 'seed', 1953);
  let dayIndex = Math.min(Math.max(intParam(params, 'day', 1), 0), BALANCE.week.length - 1);
  let speed = SPEEDS.includes(intParam(params, 'speed', 20)) ? intParam(params, 'speed', 20) : 20;
  let elapsed = 0;
  let running = false;
  let day = buildDay(seed, dayIndex);
  let logged = 0;
  const hungUp = new Set<number>();
  let peakRinging = 0;

  // --- Commandes -----------------------------------------------------------------------
  const seedInput = h('input', { type: 'number', id: 'dbg-seed', value: String(seed) });
  const daySelect = h(
    'select',
    { id: 'dbg-day' },
    ...BALANCE.week.map((d, i) =>
      h('option', { value: String(i) }, `${d.name} (${d.calls} appels)`),
    ),
  );
  daySelect.value = String(dayIndex);
  const speedSelect = h(
    'select',
    { id: 'dbg-speed' },
    ...SPEEDS.map((s) => h('option', { value: String(s) }, `×${s}`)),
  );
  speedSelect.value = String(speed);
  const playButton = h('button', { type: 'button' }, 'Démarrer');
  const resetButton = h('button', { type: 'button' }, 'Réinitialiser');
  const clock = h('output', { class: 'dbg-clock', 'aria-live': 'off' }, '9 h 00');
  const stats = h('div', { class: 'dbg-stats' });

  // --- Zones ---------------------------------------------------------------------------
  const panel = h('div', { class: 'dbg-panel', 'aria-label': 'Panneau du standard' });
  const lamps = new Map<number, HTMLElement>();
  for (const line of LINES) {
    const lamp = h('div', { class: 'lamp' });
    lamps.set(line, lamp);
    panel.append(
      h(
        'div',
        { class: line === ARCHIVIST_LINE ? 'jack archivist' : 'jack' },
        lamp,
        h('span', {}, String(line)),
      ),
    );
  }
  const journal = h('ol', { class: 'dbg-journal' });
  const plan = h('div', { class: 'dbg-plan' });
  const table = h('table', { class: 'dbg-table' });
  const houses = new Map<number, SVGElement>();
  const rows = new Map<number, HTMLElement>();

  root.replaceChildren(
    h(
      'main',
      { class: 'dbg' },
      h(
        'header',
        { class: 'dbg-header' },
        h('h1', {}, 'Allô Central · debug'),
        h(
          'div',
          { class: 'dbg-controls' },
          h('label', { for: 'dbg-seed' }, 'Graine'),
          seedInput,
          h('label', { for: 'dbg-day' }, 'Journée'),
          daySelect,
          h('label', { for: 'dbg-speed' }, 'Vitesse'),
          speedSelect,
          playButton,
          resetButton,
        ),
        clock,
      ),
      stats,
      h(
        'div',
        { class: 'dbg-grid' },
        h('section', {}, h('h2', {}, 'Panneau'), panel, h('h2', {}, 'Journal'), journal),
        h('section', {}, h('h2', {}, 'Plan de la ville'), plan),
      ),
      h('section', {}, h('h2', {}, 'Abonnés'), table),
    ),
  );

  // --- Ville : plan et annuaire --------------------------------------------------------
  function renderCity(): void {
    const { city } = day;
    const maxX = Math.max(...city.streets.flatMap((s) => [s.from.x, s.to.x]));
    const maxY = Math.max(...city.streets.flatMap((s) => [s.from.y, s.to.y]));
    const px = (v: number) => PAD + v * UNIT;
    const map = svg('svg', {
      viewBox: `0 0 ${maxX * UNIT + 2 * PAD} ${maxY * UNIT + 2 * PAD}`,
      role: 'img',
      'aria-label': 'Plan des rues',
    });

    for (const street of city.streets) {
      map.append(
        svg('line', {
          x1: px(street.from.x),
          y1: px(street.from.y),
          x2: px(street.to.x),
          y2: px(street.to.y),
          class: 'street',
        }),
      );
      const horizontal = street.from.y === street.to.y;
      const x =
        px(Math.min(street.from.x, street.to.x) + (horizontal ? 0.1 : 0)) - (horizontal ? 0 : 6);
      const y =
        px(Math.min(street.from.y, street.to.y) + (horizontal ? 0 : 0.1)) - (horizontal ? 6 : 0);
      map.append(
        svg(
          'text',
          {
            x,
            y,
            class: 'street-name',
            transform: horizontal ? '' : `rotate(-90 ${x} ${y})`,
            'text-anchor': horizontal ? 'start' : 'end',
          },
          street.name,
        ),
      );
    }

    houses.clear();
    for (const subscriber of city.subscribers) {
      const street = city.streets[subscriber.address.streetId];
      if (!street) continue;
      const p = addressPoint(street, subscriber.address.houseNumber);
      const dot = svg('circle', { cx: px(p.x), cy: px(p.y), r: 4, class: 'house' });
      dot.append(svg('title', {}, `${subscriber.line} · ${describe(subscriber)}`));
      houses.set(subscriber.line, dot);
      map.append(dot);
    }

    for (const landmark of city.landmarks) {
      const street = city.streets[landmark.address.streetId];
      if (!street) continue;
      const p = addressPoint(street, landmark.address.houseNumber);
      map.append(
        svg('rect', { x: px(p.x) - 7, y: px(p.y) - 7, width: 14, height: 14, class: 'landmark' }),
        svg('text', { x: px(p.x) + 10, y: px(p.y) + 4, class: 'landmark-name' }, landmark.name),
      );
    }
    plan.replaceChildren(map);

    rows.clear();
    const body = h('tbody');
    for (const s of city.subscribers) {
      const street = city.streets[s.address.streetId]?.name ?? '?';
      const row = h(
        'tr',
        {},
        h('td', {}, String(s.line)),
        h('td', {}, s.lastName),
        h(
          'td',
          {},
          s.spouse ? `${s.holder.firstName} et ${s.spouse.firstName}` : s.holder.firstName,
        ),
        h('td', {}, s.profession ?? '–'),
        h('td', {}, s.notable ? 'oui' : ''),
        h('td', {}, `${s.address.houseNumber}, ${street}`),
      );
      rows.set(s.line, row);
      body.append(row);
    }
    table.replaceChildren(
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          ...['Ligne', 'Nom', 'Foyer', 'Métier', 'Notable', 'Adresse'].map((t) => h('th', {}, t)),
        ),
      ),
      body,
    );
  }

  // --- Journée -------------------------------------------------------------------------
  function log(at: number, text: string, kind: string, detail?: string): void {
    const item = h('li', { class: kind }, h('time', {}, formatGameTime(at)), ' ', text);
    if (detail) item.append(h('span', { class: 'detail' }, detail));
    journal.prepend(item);
  }

  /** La demande telle que l'entend le standardiste, et qui elle désigne vraiment. */
  function requestDetail(request: CallRequest | undefined): string | undefined {
    if (!request) return undefined;
    const which = request.extraText ? ` (Lequel ? « ${request.extraText} »)` : '';
    const target = describe(day.subscriberByLine.get(request.targetLine));
    return `${request.type} « ${request.text} »${which} → ${request.targetLine} ${target}`;
  }

  function render(): void {
    clock.textContent = formatGameTime(elapsed);

    while (logged < day.calls.length && (day.calls[logged]?.at ?? Infinity) <= elapsed) {
      const call = day.calls[logged] as ScheduledCall;
      const urgent = call.kind === 'urgent' ? ' — URGENCE' : '';
      log(
        call.at,
        `${call.callerLine} appelle : ${describe(day.subscriberByLine.get(call.callerLine))}${urgent}`,
        call.kind,
        requestDetail(day.requests[logged]),
      );
      logged++;
    }

    let ringing = 0;
    for (const line of LINES) {
      const call = day.callByLine.get(line);
      const lamp = lamps.get(line);
      if (!lamp) continue;
      const remaining = call ? call.at + patience(call) - elapsed : -1;
      const active = call !== undefined && elapsed >= call.at && remaining > 0;
      if (active) ringing++;

      lamp.classList.toggle('ring', active && remaining > patience(call) / 3);
      lamp.classList.toggle('ring-fast', active && remaining <= patience(call) / 3);
      lamp.classList.toggle('urgent', active && call.kind === 'urgent');
      lamp.textContent = active && call.kind === 'urgent' ? '+' : '';
      houses.get(line)?.classList.toggle('ringing', active);
      rows.get(line)?.classList.toggle('ringing', active);

      if (call && remaining <= 0 && !hungUp.has(line)) {
        hungUp.add(line);
        log(call.at + patience(call), `${line} raccroche, personne n'a répondu`, 'lost');
      }
    }
    peakRinging = Math.max(peakRinging, ringing);

    const arrived = logged;
    stats.textContent =
      `${BALANCE.week[dayIndex]?.name} · graine ${seed} · ` +
      `${arrived}/${day.calls.length} appels arrivés · ${ringing} en attente · ` +
      `${hungUp.size} perdus · pic simultané : ${peakRinging}` +
      (elapsed >= BALANCE.dayDurationMs ? ' · journée terminée' : '');
  }

  function reset(): void {
    running = false;
    playButton.textContent = 'Démarrer';
    elapsed = 0;
    logged = 0;
    peakRinging = 0;
    hungUp.clear();
    journal.replaceChildren();
    day = buildDay(seed, dayIndex);
    renderCity();
    render();
    updateUrl();
  }

  /** Garde les réglages dans l'URL, pour pouvoir partager ou recharger la même journée. */
  function updateUrl(): void {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(seed));
    url.searchParams.set('day', String(dayIndex));
    url.searchParams.set('speed', String(speed));
    history.replaceState(null, '', url);
  }

  let last = performance.now();
  function frame(now: number): void {
    if (running) {
      elapsed = Math.min(elapsed + (now - last) * speed, BALANCE.dayDurationMs);
      if (elapsed >= BALANCE.dayDurationMs) {
        running = false;
        playButton.textContent = 'Démarrer';
      }
      render();
    }
    last = now;
    requestAnimationFrame(frame);
  }

  playButton.addEventListener('click', () => {
    if (elapsed >= BALANCE.dayDurationMs) reset();
    running = !running;
    playButton.textContent = running ? 'Pause' : 'Reprendre';
  });
  resetButton.addEventListener('click', reset);
  seedInput.addEventListener('change', () => {
    seed = Number.parseInt(seedInput.value, 10) || 0;
    reset();
  });
  daySelect.addEventListener('change', () => {
    dayIndex = Number(daySelect.value);
    reset();
  });
  speedSelect.addEventListener('change', () => {
    speed = Number(speedSelect.value);
    updateUrl();
  });

  reset();
  requestAnimationFrame(frame);
}
