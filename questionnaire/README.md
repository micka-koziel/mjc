# Questionnaire client

Le questionnaire tient dans **un seul fichier** : `questionnaire.html`. Il ne dépend d'aucun service en ligne.

## Le faire remplir

- **Par e-mail ou partage de fichier** : envoyer `questionnaire.html`. Le client l'ouvre dans son navigateur (double-clic), sur ordinateur ou sur mobile.
- **Par lien web** : déposer le fichier sur un hébergement statique (Netlify Drop, page GitHub, espace web). Tant que ce n'est pas fait, **il n'existe pas de lien public**.

## Ce qu'il fait

- 8 étapes courtes, barre de progression, retour en arrière sans perte.
- Progression enregistrée **sur l'appareil du client** (stockage du navigateur) : on peut fermer et revenir.
- Choix visuels (couleurs, thème, police, densité), aperçu de l'application, récapitulatif modifiable.
- Le logo est réduit si besoin et **embarqué dans le fichier exporté**.
- Export : bouton « Télécharger mon fichier » (`quantique-config-<entreprise>.json`) ou « Copier le contenu ».
- Possibilité de reprendre un fichier déjà exporté (étape 1, « Vous avez déjà un fichier exporté ? »).
- Aucun mot de passe, aucune clé, aucun accès technique n'est demandé.

## Le mettre à jour

Le fichier est **généré** : ne pas le modifier à la main. Modifier `questionnaire/src/questionnaire.template.html` ou `src/config/contract.mjs`, puis :

```bash
npm run questionnaire:build
```
