/**
 * Le tableau d'épingles et les notes libres de l'archiviste (§7.2) : son travail propre,
 * gardé dans le navigateur pour toute la semaine de la salle.
 */
const PINS = 6;

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sans stockage, le tableau vit le temps de la page : il reste utilisable.
  }
}

/** Six épingles : un nom et un numéro, à portée de main pendant les appels. */
export function pinBoard(room: string): HTMLElement {
  const key = `allo-central:pins:${room}`;
  let pins: { name: string; line: string }[] = [];
  try {
    pins = JSON.parse(load(key) ?? '[]') as typeof pins;
  } catch {
    pins = [];
  }

  const board = document.createElement('section');
  board.className = 'pins';
  board.setAttribute('aria-label', "Tableau d'épingles");
  const title = document.createElement('strong');
  title.textContent = 'Épingles';
  board.append(title);
  for (let i = 0; i < PINS; i++) {
    const pin = document.createElement('div');
    pin.className = 'pin';
    const name = Object.assign(document.createElement('input'), {
      value: pins[i]?.name ?? '',
      placeholder: 'Nom',
      maxLength: 24,
    });
    name.setAttribute('aria-label', `Épingle ${i + 1} : nom`);
    const line = Object.assign(document.createElement('input'), {
      value: pins[i]?.line ?? '',
      placeholder: 'N°',
      maxLength: 3,
      inputMode: 'numeric',
    });
    line.setAttribute('aria-label', `Épingle ${i + 1} : numéro`);
    const store = () => {
      pins[i] = { name: name.value, line: line.value };
      save(key, JSON.stringify(pins));
    };
    name.addEventListener('input', store);
    line.addEventListener('input', store);
    pin.append(name, line);
    board.append(pin);
  }
  return board;
}

/** Les notes libres : une page blanche qui survit aux journées. */
export function notesPage(room: string): HTMLElement {
  const key = `allo-central:notes:${room}`;
  const page = document.createElement('section');
  page.className = 'paper notes';
  const area = document.createElement('textarea');
  area.setAttribute('aria-label', 'Notes libres');
  area.placeholder = 'Vos notes : numéros fréquents, code de sonnette, habitudes de la ville…';
  area.value = load(key) ?? '';
  area.addEventListener('input', () => save(key, area.value));
  page.append(area);
  return page;
}
