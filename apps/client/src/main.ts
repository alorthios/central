if (new URLSearchParams(location.search).has('debug')) {
  // Chargée à part : le code de debug ne pèse pas sur la page de jeu.
  void import('./debug/debug.ts').then(({ mountDebug }) => mountDebug(document.body));
} else {
  void import('./operator/operator.ts').then(({ mountOperator }) => mountOperator(document.body));
}
