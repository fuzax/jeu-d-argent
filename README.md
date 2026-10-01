# La Chance

Une salle de jeux en crédits virtuels, sans argent réel.

## Jouer

Lancez un serveur web local à la racine du projet :

```sh
python3 -m http.server 8000
```

Ouvrez ensuite <http://localhost:8000>. Le jeu fonctionne aussi hors ligne après son premier chargement et peut être installé depuis un navigateur compatible.

## Jeux

- **Blackjack** : tirer, rester, doubler ou prendre une assurance contre le blackjack du croupier ; naturel payé 3:2.
- **Roulette européenne** : jouer un numéro, une couleur, pair/impair ou une moitié de table.
- **Machines à sous** : une paire paie 2× la mise, trois symboles identiques paient 10×.
- **Pile ou face** : choisissez un côté ; une bonne réponse paie 1:1.
- **Dés** : pariez sur petit, grand ou exactement 7 ; l’égalité rend la mise pour petit ou grand.
- **Baccarat** : misez sur le joueur, le banquier ou l’égalité ; les cartes suivent les règles classiques.
- **Hi-Lo** : devinez si la prochaine carte sera plus haute ou plus basse ; l’égalité rend la mise.
- **Keno** : choisissez 5 numéros parmi 20 et comparez-les au tirage ; les gains vont jusqu’à 100×.
- **Texas Hold’em** : affrontez le croupier au meilleur des cinq cartes parmi vos deux cartes et les cinq cartes communes.
- **Tournoi de dés** : payez 100 crédits d’entrée, jouez cinq manches et gagnez jusqu’à 1 000 crédits.
- **Bonus quotidien** : récupérez 250 crédits une fois par jour.
- **Missions quotidiennes et succès** : gagnez des crédits en jouant et débloquez cinq badges.
- **Personnalisation** : changez le tapis, le dos des cartes, le nom du classement, le son et les animations.
- **Classement local** : comparez les meilleurs soldes atteints sur cet appareil.
- **Carnet de jeu** : consultez vos statistiques et vos cinq dernières parties.

Le solde et les statistiques sont stockés localement dans le navigateur. Le bouton ↻ réinitialise le solde, mais ne modifie pas les statistiques.