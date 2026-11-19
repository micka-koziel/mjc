# Guide de personnalisation — mode opératoire pour un agent

**But** : produire, à partir du questionnaire **version 2** rempli par un client, une instance à ses couleurs et à son style, **vérifiée**, sans toucher au fonctionnement métier.

## Entrées

1. Le dépôt, dans un état propre (`git status` sans modification).
2. L'export Excel du questionnaire v2 : `khentik-email-<entreprise>-reponses.xlsx`. Il contient tout (logos et documents compris). Un fichier du questionnaire v1 est refusé.
3. Les arbitrages éventuels décidés avec le client (couleurs de charte, police, documents à transmettre à l'IA).

Aucun secret ni accès client n'est nécessaire.

## Règles

- Ne modifier la configuration **que** via `npm run config:apply`. Ne jamais remplacer à la main des couleurs, des noms ou des textes dans le code.
- Un arbitrage = une entrée dans `config/clients/<client>/overrides.json`, avec une `note` (qui, quand, pourquoi). Jamais de modification du fichier Excel du client.
- **Jamais de couleurs KHentik chez un client** : la case correspondante du questionnaire est ignorée.
- **Documents** : ils ne sont pas transmis à l'IA (le questionnaire l'annonce au client). Un document texte n'est transmis que s'il est nommé dans `ai.referenceDocuments`, **après accord du client**.
- La démonstration utilise des données **fictives**. Ne jamais y introduire de vrais e-mails du client.

## Étapes

```bash
# 0. Ranger le fichier du client
mkdir -p config/clients/<client>
cp /chemin/khentik-email-<entreprise>-reponses.xlsx config/clients/<client>/questionnaire.xlsx
# (facultatif) écrire config/clients/<client>/overrides.json

# 1. Valider (ne modifie rien)
npm run config:validate -- config/clients/<client>
```

La commande liste les erreurs (champ, valeur attendue) et les avertissements (réglages lus mais pas encore appliqués, arbitrages appliqués, case KHentik cochée). En cas d'erreur : faire corriger le questionnaire par le client, ou poser un arbitrage explicite. Ne jamais inventer une valeur manquante.

```bash
# 2. Installer (sauvegarde automatique dans config/backups/)
npm run config:apply -- config/clients/<client>

# 3. Vérifier
npm test
npm run test:functions
npm run check:no-crm
npm run build

# 4. Lancer
npm run dev          # http://localhost:3000
```

Pour que l'IA réelle utilise le nouveau style d'écriture : redéployer les fonctions (`functions/config/ai-profile.json` part avec elles).

## Vérification visuelle (à faire à chaque fois)

| Contrôle | Attendu |
|---|---|
| Barre latérale | Logo du client ; ouverte ou réduite selon le questionnaire |
| Couleurs | Boutons, textes et liens aux couleurs retenues, texte lisible |
| Angles, contraste, aperçu des messages | Conformes au questionnaire |
| Accueil | Assistant nommé comme demandé ; expéditeurs importants en tête de « À traiter » |
| Réponse | Brouillon (IA réelle) dans le style du client, avec sa signature |
| Mention fictive | « Exemple fictif » sous le logo **seulement** si `client.isFictional` vaut `true` |
| Mobile | Fenêtre réduite à environ 390 px : menu ☰, liste lisible |

Garder une capture de l'accueil et de la Mailbox comme preuve.

## Rendre l'instance au porteur du projet

Indiquer : le fichier appliqué, le résultat de `config:validate` (avertissements compris), les arbitrages, les vérifications passées et les captures, tout écart constaté.

## Revenir à l'apparence neutre

```bash
npm run config:reset
```
