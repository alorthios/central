import type { DayReport } from '@allo-central/shared';

export interface ReportActions {
  replay(): void;
  /** Absent : pas de journée suivante (fin de semaine, ou journée à rejouer). */
  next: (() => void) | null;
  /** Le journal CSV de la journée, à télécharger pour les mesures (§19). */
  journal: { csv: string; filename: string };
}

const percent = (rate: number) => `${Math.round(rate * 100)} %`;
const seconds = (ms: number | null) => (ms === null ? '—' : `${Math.round(ms / 1000)} s`);

/**
 * Le bilan de fin de journée (§11) : les étoiles, le taux de service, et les statistiques
 * d'équipe qui rendent visibles les progrès du langage commun.
 */
export function showReport(report: DayReport, actions: ReportActions): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'report';

  const title = document.createElement('h2');
  title.textContent = `Bilan du ${report.dayName.toLowerCase()}`;

  const stars = document.createElement('p');
  stars.className = 'stars';
  stars.textContent = '★'.repeat(report.stars) + '☆'.repeat(3 - report.stars);
  stars.setAttribute('aria-label', `${report.stars} étoile${report.stars > 1 ? 's' : ''} sur 3`);

  const rate = document.createElement('p');
  rate.className = 'rate';
  rate.textContent = `Taux de service : ${percent(report.serviceRate)}`;

  const { thresholds } = report;
  const verdict = document.createElement('p');
  verdict.className = report.replay ? 'verdict replay' : 'verdict';
  verdict.textContent = report.replay
    ? 'Aucune étoile : la journée est à rejouer.'
    : `Étoiles à ${percent(thresholds.one)}, ${percent(thresholds.two)} et ${percent(thresholds.three)}. Chaque urgence perdue en retire une.`;

  const stats = document.createElement('dl');
  const rows: [string, string][] = [
    ['Appels reçus', String(report.received)],
    ['Servis', `${report.served} (dont ${report.informed} clients prévenus)`],
    ['Perdus', `${report.lost} (dont ${report.urgentLost} urgences)`],
    ['Temps moyen par appel', seconds(report.averageHandlingMs)],
    ['Erreurs de branchement', String(report.wrongConnections)],
    ['« Lequel ? » demandés', String(report.whichOneAsked)],
    ['Temps sur la ligne 100', report.line100Ms > 0 ? seconds(report.line100Ms) : '—'],
    ['Coups de sonnette', report.bellRings > 0 ? String(report.bellRings) : '—'],
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    stats.append(dt, dd);
  }

  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  const replay = Object.assign(document.createElement('button'), { type: 'button' });
  replay.textContent = 'Rejouer la journée';
  replay.addEventListener('click', () => {
    dialog.close();
    actions.replay();
  });
  const download = Object.assign(document.createElement('button'), { type: 'button' });
  download.textContent = 'Télécharger le journal';
  download.title = 'Chaque événement de la journée, horodaté (CSV)';
  download.addEventListener('click', () => {
    // Le BOM fait lire les accents correctement aux tableurs.
    const blob = new Blob(['﻿' + actions.journal.csv], { type: 'text/csv;charset=utf-8' });
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: actions.journal.filename,
    });
    link.click();
    URL.revokeObjectURL(link.href);
  });
  buttons.append(download, replay);
  if (actions.next) {
    const next = Object.assign(document.createElement('button'), { type: 'button' });
    next.textContent = 'Journée suivante';
    next.className = 'primary';
    const go = actions.next;
    next.addEventListener('click', () => {
      dialog.close();
      go();
    });
    buttons.append(next);
  }

  dialog.append(title, stars, rate, verdict, stats, buttons);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
