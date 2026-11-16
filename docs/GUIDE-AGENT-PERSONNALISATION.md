# Guide de personnalisation — mode opératoire pour un agent

**But** : produire, à partir du questionnaire rempli par un client, une instance de démonstration à ses couleurs, **vérifiée**, sans toucher au fonctionnement métier.

## Entrées

1. Le package `quantique-email/`, dans un état propre (`git status` sans modification, ou une copie neuve).
2. Le fichier exporté par le questionnaire : `quantique-config-<entreprise>.json`.

Rien d'autre : le logo est **dans** ce fichier. Aucun secret ni accès client n'est nécessaire pour une démonstration.

## Règles

- Modifier **uniquement** `src/config/active.config.json`, et **uniquement** via `npm run config:apply`. Ne jamais remplacer à la main des couleurs, des noms ou des textes dans le code.
- Ne pas modifier `context` : ces informations ne sont pas appliquées. Les signaler au porteur du projet si elles appellent un réglage.
- Une instance = un client. Avant de changer de client, repartir de la référence (`npm run config:reset`), pour qu'aucun élément (logo, nom) d'un autre client ne reste.
- La démonstration utilise les données **fictives** du package. Ne jamais y introduire de vrais e-mails du client.

## Étapes

```bash
# 0. Partir d'une base propre
npm install
npm run config:reset

# 1. Valider l'export (ne modifie rien)
npm run config:validate -- /chemin/quantique-config-client.json
```

Si le fichier est invalide, la commande liste les erreurs (champ, valeur attendue). Deux possibilités :
- faire corriger le questionnaire par le client : il peut réimporter son fichier à l'étape 1 et le corriger ;
- corriger le JSON, **seulement** pour une erreur de forme évidente (par exemple une couleur `#1e3a8a` sans `#`), et le signaler.

Ne jamais inventer une valeur manquante.

```bash
# 2. Appliquer (copie de sauvegarde automatique dans config/backups/)
npm run config:apply -- /chemin/quantique-config-client.json

# 3. Vérifier le package
npm test
npm run check:no-crm
npm run build

# 4. Lancer
npm start            # ou npm run dev — http://localhost:3000
```

## Vérification visuelle (à faire à chaque fois)

| Contrôle | Attendu |
|---|---|
| Barre latérale | Logo du client (ou pastille + nom du produit), 3 entrées : Assistant IA, Mailbox, To-do |
| Couleurs | Bouton « Répondre » et entrée active aux couleurs du client, texte lisible |
| Thème, police, densité, taille | Conformes au récapitulatif du questionnaire |
| Accueil | Assistant nommé comme demandé, liste « À traiter » remplie (données fictives) |
| Réponse | « Répondre » → résumé + 3 onglets ; le brouillon simulé suit le ton et la longueur choisis |
| Mention fictive | « Exemple fictif » sous le logo **seulement** si `client.isFictional` vaut `true` |
| Mobile | Fenêtre réduite à environ 390 px : menu ☰, liste lisible |

Garder une capture de l'accueil et de la Mailbox comme preuve.

## Revenir à Quantique

```bash
npm run config:reset
```

## Rendre la démonstration au porteur du projet

Indiquer :
- le fichier appliqué et le résultat de `config:validate` (avertissements compris) ;
- les vérifications passées et les captures ;
- le contenu de `context` (activité, priorités, expéditeurs importants), **non appliqué**, pour un futur réglage ;
- tout écart constaté.

## Passer en réel (hors démonstration)

Ce n'est pas le rôle de cette procédure : il faut un projet Firebase dédié au client, les secrets et l'accord du client pour connecter sa boîte. Voir `README.md`, § 4.
