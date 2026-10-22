import { formatGameTime } from '@allo-central/shared';

export interface JournalRow {
  /** Temps de jeu écoulé depuis 9 h, en ms. */
  at: number;
  event: string;
  call: number | null;
  line: number | null;
  detail: string;
}

const HEADER = ['heure', 'ms', 'evenement', 'appel', 'ligne', 'detail'];

/** Échappe une cellule CSV : guillemets doublés, cellule entre guillemets si besoin. */
function cell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Le journal d'une journée (§17, §19) : chaque événement horodaté, pour mesurer les séances
 * de test (temps par appel, temps sur la ligne 100, sonnette, langage commun). Exporté en
 * CSV au séparateur point-virgule, que les tableurs français ouvrent tels quels.
 */
export class Journal {
  private readonly rows: JournalRow[] = [];

  add(at: number, event: string, fields: Partial<Omit<JournalRow, 'at' | 'event'>> = {}): void {
    this.rows.push({
      at: Math.round(at),
      event,
      call: fields.call ?? null,
      line: fields.line ?? null,
      detail: fields.detail ?? '',
    });
  }

  get length(): number {
    return this.rows.length;
  }

  toCsv(): string {
    const lines = this.rows.map((row) =>
      [formatGameTime(row.at), row.at, row.event, row.call, row.line, row.detail]
        .map(cell)
        .join(';'),
    );
    return [HEADER.join(';'), ...lines].join('\r\n') + '\r\n';
  }
}
