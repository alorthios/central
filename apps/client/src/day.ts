import { BALANCE, MAX_SPEED } from '@allo-central/shared';
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
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed = Number.isSafeInteger(seedParam) ? seedParam : null;
  // `?speed=10` accélère le temps pour tester une journée en une minute.
  const speedParam = Number.parseInt(params.get('speed') ?? '1', 10);
  const speed = Math.min(Math.max(Number.isInteger(speedParam) ? speedParam : 1, 1), MAX_SPEED);

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
  return [label, select, start];
}
