import { mountLobby } from './lobby.ts';
import { connect } from './net.ts';

if (new URLSearchParams(location.search).has('debug')) {
  // Chargée à part : le code de debug ne pèse pas sur la page de jeu.
  void import('./debug/debug.ts').then(({ mountDebug }) => mountDebug(document.body));
} else {
  const connection = connect();
  mountLobby(document.body, connection, (joined) => {
    // Chaque rôle a son écran, chargé à la demande : l'archiviste n'a pas besoin de PixiJS.
    if (joined.role === 'operator') {
      void import('./operator/operator.ts').then(({ mountOperator }) =>
        mountOperator(document.body, connection, joined),
      );
    } else {
      void import('./archivist/archivist.ts').then(({ mountArchivist }) =>
        mountArchivist(document.body, connection, joined),
      );
    }
  });
}
