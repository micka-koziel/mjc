# KHentik Email — package générique de gestion des e-mails

Application web de gestion des e-mails assistée par IA, extraite de l'application Trendl et rendue générique. Elle compte trois écrans : **Assistant IA** (accueil), **Mailbox** et **To-do**. La marque, les couleurs, le logo et le ton de l'assistant se règlent par **un seul fichier de configuration**, produit par le questionnaire client.

| Élément | Où |
|---|---|
| Application (Next.js) | `src/` |
| Fonctions serveur (Firebase Cloud Functions) | `functions/` |
| Contrat de configuration (source unique) | `src/config/contract.mjs` |
| Configuration active de l'instance | `src/config/active.config.json` |
| Référence KHentik / exemple fictif | `config/khentik.reference.json`, `config/examples/` |
| Questionnaire client (fichier HTML autonome) | `questionnaire/questionnaire.html` |
| Spécifications pour l'architecte | `docs/SPECIFICATIONS-FONCTIONNELLES.md` |
| Annexe technique (correspondance avec Trendl) | `docs/ANNEXE-TECHNIQUE.md` |
| Guide de personnalisation par un agent | `docs/GUIDE-AGENT-PERSONNALISATION.md` |
| Description du contrat de configuration | `docs/CONTRAT-CONFIGURATION.md` |

---

## 1. Démarrage rapide (démonstration)

Prérequis : Node.js 20 ou plus récent.

```bash
npm install          # le fichier .npmrc active legacy-peer-deps (nécessaire)
npm run dev          # http://localhost:3000
```

Le mode **démonstration** est actif par défaut :

- les données sont fictives (entreprises et adresses inventées, domaines `.example`) ;
- l'IA est **simulée** : résumés et brouillons sont construits à partir des données fictives, et l'interface l'indique (« IA simulée (démo) ») ;
- **rien n'est envoyé ni supprimé** ailleurs que dans le navigateur ; l'envoi garde le délai d'annulation de 5 secondes ;
- l'état de la démo est mémorisé dans le navigateur. « Réinitialiser la démo » (en bas de la barre latérale) repart du jeu d'origine.

Production locale : `npm run build && npm start`.

## 2. Appliquer une configuration client

```bash
npm run config:validate -- chemin/vers/khentik-config-client.json   # vérifie seulement
npm run config:apply    -- chemin/vers/khentik-config-client.json   # vérifie puis installe
npm run config:reset                                                   # revient à KHentik
```

Relancez ensuite `npm run dev` (ou `npm run build`). L'ancienne configuration est sauvegardée dans `config/backups/`. Le logo est **embarqué dans le JSON** : il n'y a aucun fichier à copier à part. Le mode opératoire complet est dans `docs/GUIDE-AGENT-PERSONNALISATION.md`.

## 3. Questionnaire client

`questionnaire/questionnaire.html` est un fichier unique qui fonctionne hors ligne : on l'ouvre dans un navigateur, ou on l'envoie par e-mail ou par lien de partage de fichier. **Ce n'est pas un service hébergé** : pour obtenir un lien web public, il faut le déposer sur un hébergement statique (Netlify, Drive public, etc.). Voir `questionnaire/README.md`.

Après toute modification du contrat (`src/config/contract.mjs`) : `npm run questionnaire:build`. Un test échoue si le questionnaire n'embarque plus la version courante du contrat.

## 3 bis. Démo partageable en un seul fichier

```bash
npm run build:share      # produit share/index.html (démo complète, données fictives)
```

Ce fichier unique peut être envoyé ou publié tel quel (navigation par ancre : `#mailbox`, `#todos`). La commande utilise les scripts `scripts/build-share.mjs` et `share-src/`.

## 4. Mode réel (Gmail + Firebase)

> ⚠️ Ce mode a été écrit et relu, et ses fonctions serveur passent leurs tests unitaires. Il **n'a pas été exécuté** contre un vrai compte Gmail ni un vrai projet Firebase pendant la construction : l'environnement de construction n'avait pas accès à Google. Voir la section 7.

Organisation retenue : **une instance = un client = un projet Firebase**, avec une seule boîte Gmail partagée par les personnes autorisées (même fonctionnement que Trendl). Pas de multi-tenant.

1. **Projet Firebase** (plan Blaze), région `europe-west1` : activer Firestore, Storage et Authentication (fournisseur « E-mail / mot de passe »). Créer les comptes des utilisateurs dans Authentication et **vérifier leur adresse**, car les règles exigent `email_verified`.
2. **Liste d'accès** : créer dans Firestore le document `app_settings/access` avec le champ `allowed_emails` (tableau d'adresses **en minuscules**). Cette liste est lue par les règles Firestore et Storage et par les fonctions.
3. **Google Cloud** : activer l'API Gmail. Créer un identifiant OAuth « Application Web ». Créer le sujet Pub/Sub `khentik-emails-inbound` et donner le rôle *Publisher* à `gmail-api-push@system.gserviceaccount.com`.
4. **Secrets** (Secret Manager) :
   ```bash
   npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY
   npx firebase-tools functions:secrets:set GMAIL_CLIENT_SECRET
   npx firebase-tools functions:secrets:set GMAIL_REFRESH_TOKEN   # valeur provisoire « x » : remplacée à l'étape 7
   ```
5. **Paramètres des fonctions** : copier `functions/.env.example` vers `functions/.env` et le remplir (`GMAIL_CLIENT_ID`, `GMAIL_REDIRECT_URI`, `ALLOWED_ORIGINS`, `INTERNAL_DOMAINS`…).
6. **Déploiement** :
   ```bash
   cp .firebaserc.example .firebaserc        # puis indiquer l'ID du projet
   (cd functions && npm install)
   npx firebase-tools deploy --only functions,firestore,storage
   ```
   Reporter l'URL de `callbackOAuth` dans `GMAIL_REDIRECT_URI` et dans les URI de redirection autorisées de l'identifiant OAuth, puis redéployer les fonctions.
7. **Application** : copier `.env.example` vers `.env.local`, mettre `NEXT_PUBLIC_DATA_MODE=firebase` et les clés Web Firebase, puis lancer l'application. Une fois connecté : barre latérale → « Connexion de la messagerie » → **1. Autoriser l'accès Gmail** → **2. Activer la réception**. La réception est ensuite renouvelée chaque jour (`renewWatch`).

Hébergement du front : Netlify ou tout hébergeur Next.js, avec les mêmes variables `NEXT_PUBLIC_*`.

## 5. Vérifications

```bash
npm test                 # tests de l'application (contrat, liste de travail, IA simulée, reprises Trendl)
npm run test:functions   # tests des fonctions serveur
npm run check:no-crm     # aucune dépendance CRM / recouvrement / module exclu
npm run lint
npm run build
```

## 6. Ce qui est réel et ce qui est simulé

| Fonction | Démo | Réel |
|---|---|---|
| Lecture des e-mails | Jeu fictif | Gmail → Pub/Sub → `ingestEmail` → Firestore (repris de Trendl) |
| Analyse de chaque e-mail (résumé court, action attendue) | Pré-remplie | `analyzeEmail`, consignes génériques |
| Résumé du fil | Simulé (construit à partir des messages) | `summarizeThread` (nouveau) |
| Brouillon de réponse et régénération | Simulés, mais tenant compte du ton, de la longueur, de la langue et de la consigne | `generateReplyDraft` |
| Envoi, pièces jointes | Simulés (ajoutés à l'historique de démo) | `sendReplyDraft` (repris) + Storage |
| Corbeille, spam, archive, « lu » | Navigateur seulement | `applyGmailAction` (repris) |
| Recherche étendue | Tous les messages fictifs | `searchMailbox` (repris) |
| Résumé 12 h | Simulé | `summarizeRecentEmails` (consignes génériques) |
| Questions libres à l'assistant | Quelques intentions reconnues, sinon message explicite | `assistantChat` (outils e-mails et tâches) |

## 7. Limites connues

- Mode réel non exécuté en conditions réelles (pas d'accès Google ni d'émulateur Firebase dans l'environnement de construction).
- Un seul fournisseur de messagerie : **Gmail** (comme Trendl). Outlook / IMAP ne sont pas pris en charge.
- Les brouillons sont générés **à l'ouverture** (5 à 10 s). Trendl les pré-générait via les fiches CRM, qui n'existent pas ici.
- La priorisation de l'accueil est une **règle provisoire** documentée (`src/features/home/lib/work-list.js`).
- La signature par utilisateur (`users/{uid}`) et les réglages de réponse (`app_settings/response_v1`) sont lus par le serveur, mais n'ont pas d'écran de réglage.
