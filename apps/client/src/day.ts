import { BALANCE, MAX_SPEED } from '@allo-central/shared';
import { devMode } from './dev.ts';
import type { Connection } from './net.ts';
import { showReport } from './report.ts';

/**
 * Le choix de la journée et le bouton pour la lancer, communs aux deux rôles. À 18 h, le
 * bilan propose de rejouer ou de passer au lendemain, dans la même ville (§5.3).
 */
export function dayControls(connection: Connection): HTMLElement[] {
  const params = new URLSearchParams(location.search);
  const select = document.createElement('select');
  select.id = 'day';
  BALANCE.week.forEach((day, i) => select.add(new Option(day.name, String(i))));
  select.value = params.get('day') ?? '0';
  const label = Object.assign(document.createElement('label'), { htmlFor: 'day' });
  label.textContent = 'Journée';
  const start = Object.assign(document.createElement('button'), { type: 'button' });
  start.textContent = 'Ouvrir le central';

  // La salle garde sa ville toute la semaine (§5.3) ; `?seed` en impose une.
  let seed = readSeed(params.get('seed'));
  // `?speed=10` accélère le temps pour tester une journée en une minute.
  let speed = readSpeed(params.get('speed'));
  // En mode développeur, les deux se règlent dans le bandeau.
  const devFields = devMode()
    ? devSettings(seed, speed, (newSeed, newSpeed) => {
        seed = newSeed;
        speed = newSpeed;
      })
    : [];

  const startDay = (dayIndex: number) => {
    select.value = String(dayIndex);
    connection.send({ type: 'startDay', seed, dayIndex, speed });
  };
  start.addEventListener('click', () => startDay(Number(select.value)));

  connection.listen((message) => {
    if (message.type === 'dayStarted') {
      select.value = String(message.dayIndex);
      start.textContent = 'Recommencer la journée';
    }
    if (message.type === 'dayEnded') {
      start.textContent = 'Ouvrir le central';
      const dayIndex = Number(select.value);
      const hasNext = !message.report.replay && dayIndex < BALANCE.week.length - 1;
      showReport(message.report, {
        replay: () => startDay(dayIndex),
        next: hasNext ? () => startDay(dayIndex + 1) : null,
        journal: {
          csv: message.journal,
          filename: `allo-central-${message.report.dayName.toLowerCase()}.csv`,
        },
      });
    }
  });
  connection.onClose(() => (start.disabled = true));
  return [label, select, ...devFields, start];
}

function readSeed(raw: string | null): number | null {
  const seed = Number.parseInt(raw ?? '', 10);
  return Number.isSafeInteger(seed) && seed >= 0 ? seed : null;
}

function readSpeed(raw: string | null): number {
  const speed = Number.parseInt(raw ?? '1', 10);
  return Math.min(Math.max(Number.isInteger(speed) ? speed : 1, 1), MAX_SPEED);
}

/** Les champs « graine » et « vitesse » du mode développeur, pris en compte au lancement. */
function devSettings(
  seed: number | null,
  speed: number,
  onChange: (seed: number | null, speed: number) => void,
): HTMLElement[] {
  const field = (text: string, input: HTMLInputElement) => {
    const label = document.createElement('label');
    label.className = 'dev-field';
    label.append(text, input);
    return label;
  };
  const seedInput = Object.assign(document.createElement('input'), {
    type: 'number',
    min: '0',
    placeholder: 'salle',
    value: seed === null ? '' : String(seed),
  });
  seedInput.title = 'Graine de la ville (vide : celle de la salle)';
  const speedInput = Object.assign(document.createElement('input'), {
    type: 'number',
    min: '1',
    max: String(MAX_SPEED),
    value: String(speed),
  });
  speedInput.title = `Vitesse de l'horloge (1 à ${MAX_SPEED})`;
  const update = () => onChange(readSeed(seedInput.value), readSpeed(speedInput.value));
  seedInput.addEventListener('change', update);
  speedInput.addEventListener('change', () => {
    speedInput.value = String(readSpeed(speedInput.value));
    update();
  });
  return [field('Graine', seedInput), field('× ', speedInput)];
}
