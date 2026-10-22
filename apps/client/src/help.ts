import type { Role } from '@allo-central/shared';
import { devMode } from './dev.ts';

/** La phrase-clé de la prise en main (§14). */
export const KEY_PHRASE =
  'Un cordon est une rallonge entre deux personnes. La clé décide si tu es dans la conversation.';

interface Section {
  title: string;
  items: string[];
}

/** Les cartes mémo (§14) : l'essentiel de chaque rôle, à relire pendant la partie. */
const CARDS: Record<Role, { title: string; sections: Section[] }> = {
  operator: {
    title: 'Carte mémo du standardiste',
    sections: [
      {
        title: 'Un appel, pas à pas',
        items: [
          'Une ampoule clignote : glissez une fiche d’un cordon sur sa prise.',
          'Levez la clé de la paire (cliquez au-dessus de son axe) : vous entendez le client.',
          'Branchez l’autre fiche sur le correspondant, puis sonnez (cliquez sous l’axe).',
          'Il décroche : rabaissez la clé, ils se parlent sans vous.',
          'L’ampoule clignote lentement : c’est fini, ramenez les deux fiches sur la tablette.',
        ],
      },
      {
        title: 'Les ampoules',
        items: [
          'Clignote : appel en attente, de plus en plus vite quand le client s’impatiente.',
          'Fixe : vous écoutez cette ligne. Scintille : conversation en cours.',
          'Clignote lentement : conversation terminée. Éteinte : ligne libre.',
          'Rouge, marquée d’une croix : urgence, le client attend peu.',
        ],
      },
      {
        title: 'Situations',
        items: [
          'Une seule écoute : lever une clé rabaisse celle qui était levée.',
          'Occupé, ou absent après trois sonneries : levez la clé pour prévenir le client.',
          '« Lequel ? » obtient une précision du client, contre 10 s de sa patience.',
          'Mauvais correspondant : le client proteste, s’impatiente, et l’erreur compte au bilan.',
        ],
      },
      {
        title: 'L’étage',
        items: [
          'Ligne 100 : l’archiviste. Reliez-y une paire et levez sa clé quand l’étage a décroché.',
          'Pendant ce temps, vous n’entendez aucun client. Un client ne peut jamais y être relié.',
          'Le voyant « Sonnette » et la cloche : l’étage vous fait signe, selon votre code.',
        ],
      },
    ],
  },
  archivist: {
    title: 'Carte mémo de l’archiviste',
    sections: [
      {
        title: 'Vos documents',
        items: [
          'L’annuaire (lundi) se feuillette par lettre : nom → numéro.',
          'Le fichier des professions (mardi) : métier → abonnés.',
          'Le plan de la ville (mercredi) : rues, maisons numérotées, lieux repères.',
          'Pas de recherche : la vitesse vient de l’habitude. A− et A+ règlent la taille du texte.',
        ],
      },
      {
        title: 'Parler au rez-de-chaussée',
        items: [
          'Votre téléphone sonne : décrochez, le standardiste vous parle par la ligne 100.',
          'Pour l’appeler, décrochez : l’ampoule 100 clignote en bas, parmi les autres appels.',
          'La ligne est ouverte quand il lève sa clé : voix (activez le micro) ou texte.',
          'Raccrochez une fois l’échange fini.',
        ],
      },
      {
        title: 'Sans décrocher',
        items: [
          'La sonnette (bouton ou touche S) est gratuite : un coup au plus toutes les 0,6 s.',
          'Inventez un code à deux : un coup, deux coups…',
          'Épinglez les numéros fréquents, et gardez vos trouvailles dans les notes.',
        ],
      },
    ],
  },
};

/** La carte mémo s'ouvre d'elle-même à la première partie dans chaque rôle. */
const seenKey = (role: Role) => `allo-central:memo-seen:${role}`;

function firstTime(role: Role): boolean {
  try {
    if (localStorage.getItem(seenKey(role))) return false;
    localStorage.setItem(seenKey(role), '1');
    return true;
  } catch {
    return false;
  }
}

function memoDialog(role: Role): HTMLDialogElement {
  const card = CARDS[role];
  const dialog = document.createElement('dialog');
  dialog.className = 'memo';
  dialog.setAttribute('aria-labelledby', 'memo-title');
  const title = Object.assign(document.createElement('h2'), { id: 'memo-title' });
  title.textContent = card.title;
  const phrase = document.createElement('p');
  phrase.className = 'key-phrase';
  phrase.textContent = `« ${KEY_PHRASE} »`;
  dialog.append(title, phrase);
  for (const section of card.sections) {
    const heading = document.createElement('h3');
    heading.textContent = section.title;
    const list = document.createElement('ul');
    for (const item of section.items) {
      const li = document.createElement('li');
      li.textContent = item;
      list.append(li);
    }
    dialog.append(heading, list);
  }
  const close = Object.assign(document.createElement('button'), { type: 'button' });
  close.textContent = 'Au travail';
  close.addEventListener('click', () => dialog.close());
  const footer = document.createElement('p');
  footer.className = 'buttons';
  footer.append(close);
  dialog.append(footer);
  // Un clic hors de la carte la referme.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

/**
 * Le bouton « Carte mémo » du bandeau (§14), aussi sur la touche « ? ». La carte est
 * accessible à tout moment ; elle s'ouvre seule la première fois.
 */
export function memoButton(role: Role): HTMLElement {
  const dialog = memoDialog(role);
  const button = Object.assign(document.createElement('button'), { type: 'button' });
  button.className = 'memo-button';
  button.textContent = 'Carte mémo';
  button.title = 'Touche ?';
  const toggle = () => {
    if (dialog.open) dialog.close();
    else dialog.showModal();
  };
  button.addEventListener('click', toggle);
  document.addEventListener('keydown', (event) => {
    const typing =
      event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (!typing && !event.repeat && event.key === '?') toggle();
  });
  // La carte vit dans le bandeau : l'écran remplace le contenu de la page en se montant.
  const wrapper = document.createElement('span');
  wrapper.className = 'memo-wrapper';
  wrapper.append(button, dialog);
  if (!devMode() && firstTime(role)) {
    const openWhenShown = () => {
      if (dialog.isConnected) dialog.showModal();
      else requestAnimationFrame(openWhenShown);
    };
    requestAnimationFrame(openWhenShown);
  }
  return wrapper;
}
