# Annexe technique — correspondance Trendl → Quantique Mail

Source analysée : dépôt `trendl-app`, dernier commit `ac00f40` (« Sprint 107.1 : annulation d'envoi ramenée à 5 secondes »), copié **sans secrets** (`.env`, `.secrets` et `functions/.env` exclus). Le dépôt d'origine n'a pas été modifié.

Les chemins Trendl sont relatifs à `trendl-app/`, les chemins du package à `quantique-email/`.

## 1. Cartographie des fonctionnalités (noms visibles → code réel)

| Nom visible | Implémentation Trendl |
|---|---|
| **Alfred** (assistant) | `src/features/assistant/*` (AlfredCompanion, AlfredWorkspace, AlfredComposer…), serveur `functions/assistants/alfredChat.js`, `alfredExecute.js`, `lib/alfred-tools.js`, `lib/prompts-alfred.js` |
| **Alfred → « Répondre »** | `src/features/priorities/components/QuickReplyDrawer.jsx`, qui intègre `src/features/mailbox/components/ReplyDraftDrawer.jsx` en mode `embedded` |
| **Mode liste** de l'accueil | `src/features/priorities/components/TodayPriorities.jsx` (liste + panneau `AlfredPanel`) |
| **Mode Alfred** de l'accueil | `src/features/priorities/components/AlfredSession.jsx` (bascule `homeMode` dans `AssistantHome.jsx`) |
| Accueil | `src/app/admin/page.js` → `src/features/home/components/AssistantHome.jsx` |
| **« Cap AI »** (hypothèse) | Aucun symbole de ce nom. Blocs du haut et du bas de l'accueil : `src/features/home/components/PipelineBand.jsx` et `CockpitKpis.jsx` |
| **Mailbox** | `src/app/admin/mailbox/page.js` → `src/features/mailbox/components/MailboxShell.jsx` |
| Pastilles de classification | `ThreadList.jsx` (`computeDotKey`) + `mailbox-actions.js` (`classifPalette`) |
| Résumé 12 h | `src/features/mailbox/components/SummaryPanel.jsx` → `functions/ai/summarizeRecentEmails.js` |
| **To-do** | `src/app/admin/todos/*` → `src/features/todos/config.js` + `lib/todo-schema.js`, `lib/todo-occurrence.js`, rendu par le moteur générique `src/features/_entity-framework/*` |
| Priorisation | `src/features/priorities/lib/daily-priorities.js`, `priority-weights.js`, `priority-settings.js` |

## 2. Application (front)

| Package | Origine Trendl | Statut | Détail |
|---|---|---|---|
| `src/app/layout.js` | `src/app/layout.js` | Adapté | Marque appliquée avant rendu (variables CSS, thème) |
| `src/app-shell/AppShell.jsx` | `features/admin/components/AdminSidebar.jsx` + `app/admin/layout.js` | Adapté | 3 entrées au lieu d'environ 40 ; pas d'impersonation ni de compteurs CRM |
| `src/app-shell/AppProviders.jsx` | — | Ajouté | Un abonnement messages + tâches partagé par les 3 écrans |
| `src/app-shell/LoginScreen.jsx` | `features/auth/*` | Adapté | E-mail + mot de passe ; sans double authentification ni récupération |
| `src/app/page.js` + `features/home/components/AssistantHome.jsx` | `features/home/components/AssistantHome.jsx` (1 728 lignes) + `TodayPriorities.jsx` | Adapté | Mode liste seul ; PipelineBand, CockpitKpis, board CRM, débrief et volets CRM retirés |
| `features/home/lib/work-list.js` | `features/priorities/lib/daily-priorities.js`, `priority-weights.js` | Adapté | Barèmes `fresh` / `agePerDay` / poids de familles repris ; critères CRM retirés |
| `features/assistant/components/AssistantPanel.jsx` | `TodayPriorities.jsx` (`AlfredPanel`, `ALFRED_COMMANDS`) | Adapté | Commandes CRM retirées ; 12 h, spams, en attente, tâches |
| `features/workspace/components/EmailWorkspace.jsx` | `features/priorities/components/QuickReplyDrawer.jsx` | Adapté | Résumé du fil (service) au lieu du résumé d'opportunité ; partagé avec la Mailbox |
| `features/workspace/components/ReplyComposer.jsx` | `features/mailbox/components/ReplyDraftDrawer.jsx` | Adapté | Même logique ; appels via services ; préférences d'assistant ; sans consigne de refus, profil d'expéditeur, « Pas mon style » |
| `features/mailbox/components/MailboxShell.jsx` | `features/mailbox/components/MailboxShell.jsx` | Adapté | Zone droite = EmailWorkspace (au lieu de ThreadReader) ; bandeau d'ingestion Trendl retiré |
| `features/mailbox/components/ThreadList.jsx` | idem | Adapté | Pastilles retirées ; non-lu en gras ; recherche sans acteurs CRM, avec pièces jointes et entreprise détectée |
| `features/mailbox/components/FolderNav.jsx` | idem | Repris | |
| `features/mailbox/components/SummaryPanel.jsx` | idem | Adapté | Action « Opportunité » retirée ; « Répondre » ouvre l'espace de traitement |
| `features/mailbox/components/EmailBodyFrame.jsx` | idem | Repris | Corps HTML dans un iframe isolé |
| `features/mailbox/components/DraftFactWarnings.jsx` | idem | Adapté | Avertissement « créateurs » retiré |
| `features/mailbox/lib/threads.js` | `features/mailbox/lib/useMailbox.js` (partie pure) | Repris | Dates via `toMs` ; tests repris |
| `features/mailbox/lib/compute-folder.js` | idem | Repris | Libellé « Boîte de réception » |
| `features/mailbox/lib/resolve-reply-to.js` | idem | Adapté | Marqueur de formulaire et domaine interne génériques |
| `features/mailbox/lib/useMailboxSearch.js` | idem | Adapté | Via `service.searchMessages` |
| `features/mailbox/lib/useMailboxPrefs.js`, `format-email.js`, `validate-recipients.js` | idem | Repris | |
| `features/todos/lib/todo-schema.js`, `todo-occurrence.js` (+ tests) | idem | Repris | |
| `features/todos/components/TodosPage.jsx` | `features/todos/config.js` + `_entity-framework` | Adapté | Écran autonome ; mêmes colonnes et règles ; section « Propriétaire » retirée ; lien e-mail ajouté |
| `shared/utils/undo-send.js` | idem | Repris | 5 s ; identifiants renommés |
| `shared/utils/*` (cn, text-fold, format-date, calendar-days), `shared/components/*` (Button, Spinner, ToastProvider) | idem | Repris | Button : variante primaire aux couleurs de marque |
| `services/*` | `features/mailbox/lib/*-actions.js`, `lib/firebase.js`, `lib/cloud-functions.js` | Adapté | Couche démo / réel ; URL des fonctions par variable d'environnement |
| `services/demo/*` | — | Ajouté | Données fictives, IA simulée |
| `config/contract.mjs`, `features/brand/*` | — | Ajouté | Contrat de configuration, application de la marque |

**Non repris (front)** : `ThreadReader`, `MailboxAiActions`, `ThreadActionsBar`, `ThreadPartiesBanner`, `EmailInvoicePanel`, `NewEmailDrawer` (prospection), `MessageBadges`, `IngestionHealthBanner`, `AlfredCompanion` / `AlfredWorkspace` (chat flottant à cartes CRM), `AlfredSession`, et toutes les rubriques CRM, recouvrement, créateurs, système et site vitrine.

## 3. Fonctions serveur

| Package `functions/` | Origine Trendl | Statut | Détail |
|---|---|---|---|
| `oauth/initOAuth.js`, `oauth/callbackOAuth.js` | idem | Repris | Région europe-west1 ; textes génériques |
| `ingest/ingestEmail.js` | idem | Adapté | Domaines bloqués via `lib/spam-domains.js` ; sujet Pub/Sub paramétrable ; drapeau de notification renommé |
| `ingest/startWatch.js` | idem | Adapté | Réponse JSON ; origines paramétrées |
| `schedule/renewWatch.js`, `schedule/checkIngestionHealth.js` | idem | Repris | Quotidien à 3 h ; toutes les 30 min |
| `analyze/analyzeEmail.js` | idem (+ `lib/prompts.js`, `lib/crm-matcher.js`) | Adapté | Une étape générique ; plus de rapprochement CRM |
| `ai/applyGmailAction.js` | idem | Adapté | `label_opportunity` retiré |
| `ai/searchMailbox.js` | idem | Repris | |
| `ai/summarizeRecentEmails.js` | idem | Adapté | Consigne et classification génériques ; renvoie `threadId` |
| `ai/summarizeThread.js` | — (Trendl : `thread_summary` des opportunités) | Ajouté | Résumé du fil, mis en cache dans `thread_summaries` |
| `ai/generateReplyDraft.js` | idem (+ `lib/prompts-reply.js`) | Adapté | Fil, cible, Cc, contrôle des faits repris ; tarifs créateurs, acteurs CRM, sollicitations, prospection et profil de voix retirés ; préférences d'assistant ajoutées |
| `ai/sendReplyDraft.js` | idem | Adapté | Branche « nouvel e-mail de prospection + négociation » retirée |
| `assistants/assistantChat.js` | `assistants/alfredChat.js` | Adapté | Outils e-mails et tâches seulement ; pas de propositions d'actions |
| `lib/mail-assistant-tools.js` | `lib/alfred-tools.js` | Adapté | `chercher_mails`, `lire_fil`, `chercher_todos`, `repondre` |
| `lib/prompts-generic.js` | `lib/prompts.js`, `prompts-reply.js`, `prompts-alfred.js` | Adapté | Consignes sans vocabulaire métier |
| `lib/admin-auth.js` | idem | Adapté | Liste d'accès (`app_settings/access` + `ALLOWED_EMAILS`) au lieu des rôles, de la double authentification et de l'impersonation |
| `lib/user-secrets.js` | idem | Adapté | Secrets globaux seulement (pas de « compte exploitant ») |
| `lib/cors.js` | idem | Adapté | Origines paramétrées |
| `lib/reply-cc.js` | idem | Adapté | Domaines internes paramétrés (`INTERNAL_DOMAINS`) |
| `lib/sender-signature.js` | idem | Adapté | Prénoms remplacés paramétrés (`DEFAULT_SIGNERS`) |
| `lib/response-settings.js` | idem | Adapté | Champ « adresse de livraison Trendl » retiré |
| `lib/validation/ai-schemas.js` | idem | Adapté | Schémas du périmètre e-mails seulement |
| `lib/spam-domains.js` | extrait de `lib/email-qualification.js` | Adapté | Sans qualification d'opportunités |
| `lib/reply-target.js` | `lib/opportunity-reply-target.js` | Repris | Ne lit que le fil |
| `lib/gmail-client.js`, `watch-helpers.js`, `contact-reply.js`, `sender-identity.js` | idem | Repris (textes et identifiants génériques) | |
| `lib/firebase-admin`, `log-redact`, `secret-manager`, `oauth-state`, `observability`, `budget-guard`, `text-safe`, `anthropic-client`, `ai-provider`, `ai-providers/anthropic`, `prompt-safety`, `thread-reader`, `message-direction`, `reply-quote`, `email-html`, `email-validate`, `draft-facts`, `history-cursor`, `dead-letter`, `ingestion-health`, `mailbox-search`, `sentry` | idem | Repris | Leurs tests unitaires ont été repris avec eux |

**Non repris (serveur)** : 113 des 126 fonctions exportées par Trendl (13 reprises ou adaptées, 1 ajoutée), dont `createOpportunityFromEmail`, `createRecordFromSuggestion`, `alfredExecute`, `onMessageAnalyzed` (création automatique d'opportunités), les déclencheurs d'opportunités et de collaborations, le recouvrement, les créateurs, la prospection, la veille, le serveur MCP, les sauvegardes et la purge RGPD.

## 4. Données (Firestore)

| Collection | Écrit par | Lu par le navigateur | Origine |
|---|---|---|---|
| `messages` | `ingestEmail`, `analyzeEmail`, `applyGmailAction` | oui | Repris ; champ `analysis` générique (catégorie, senderName, senderCompany, summary1Line, expectedAction) |
| `message_drafts` | `generateReplyDraft`, `sendReplyDraft` | oui | Repris |
| `todos` | application | oui (lecture et écriture) | Repris + champs `source_thread_id`, `source_message_id`, `source_subject` |
| `thread_summaries` | `summarizeThread` | non | Ajouté |
| `assistant_conversations` | `assistantChat` | non | Repris (structure Alfred) |
| `app_settings/access`, `spam_v1`, `response_v1` | console Firebase | non | `access` ajouté ; `spam_v1` extrait ; `response_v1` repris |
| `system/gmail-watch`, `oauth_states`, compteurs budget IA | fonctions | non | Repris |

Règles : `firestore.rules` et `storage.rules` sont fermées par défaut. Seules les adresses de `app_settings/access.allowed_emails` ont accès.

## 5. Dépendances supprimées ou découplées

| Dépendance Trendl | Où | Traitement |
|---|---|---|
| Opportunités / collaborations (fil, statut, résumé) | QuickReplyDrawer, AssistantHome | Remplacées par le fil Mailbox et `summarizeThread` |
| Fiches marques, créateurs, agences | ThreadList (recherche), analyzeEmail, generateReplyDraft | Supprimées ; entreprise détectée dans le texte de l'e-mail |
| Grilles tarifaires des créateurs | generateReplyDraft | Supprimées |
| Priorités par marque, agence, montant, historique | daily-priorities | Supprimées ; règle provisoire (§ 4.13 des spécifications) |
| Moteur générique de fiches (`_entity-framework`) | To-do | Remplacé par un écran autonome |
| Rôles, double authentification, impersonation, compte exploitant | admin-auth, user-secrets | Liste d'accès simple, secrets globaux |
| Domaines, projet et sujet Pub/Sub codés en dur | cors, watch-helpers, ingestEmail, reply-cc, startWatch | Paramètres d'environnement |

## 6. Vérifications exécutées (16/11/2026)

| Vérification | Résultat |
|---|---|
| `npm test` (application) | 15 fichiers, 127 tests verts |
| `npm run test:functions` | 26 fichiers, 170 tests verts |
| `npm run check:no-crm` | Aucune dépendance interdite (contrôle vérifié sur un faux positif volontaire) |
| `npm run lint` | 0 erreur, 0 avertissement |
| `npm run build` (démo et `NEXT_PUBLIC_DATA_MODE=firebase`) | OK |
| Chargement de `functions/index.js` | 14 fonctions exportées, aucun module manquant |
| Parcours navigateur automatisé (démo) | Accueil → Répondre → onglets → régénération avec consigne → pièce jointe → envoi avec compte à rebours → fil retiré de la liste ; spams ; 12 h ; chat ; Mailbox ; recherche ; To-do ; mobile 390 px |
| Questionnaire → `config:apply` → application | Couleurs, thème sombre, police, densité, logo, nom d'assistant visibles ; `config:reset` |
| **Non exécuté** | Gmail réel, Firebase réel, émulateurs (téléchargement bloqué dans l'environnement), appels IA réels |
