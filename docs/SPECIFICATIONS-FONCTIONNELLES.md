# KHentik Email — Spécifications fonctionnelles

*Version 1.0 — 16 novembre 2026. Document destiné à l'architecte. Il se lit sans connaître l'historique du projet.*

**Légende des statuts**, utilisée dans tout le document :

- **[Repris]** : existe dans Trendl et a été conservé tel quel ou presque.
- **[Adapté]** : existe dans Trendl et a été modifié pour le produit générique.
- **[Ajouté]** : n'existait pas dans Trendl.
- **[À définir]** : décision non prise. Une proposition est faite, sans valeur d'exigence validée.

L'annexe technique (`ANNEXE-TECHNIQUE.md`) relie chaque fonction aux fichiers réels.

---

## 1. Objectif du produit et premier cas d'usage

KHentik Email aide une petite entreprise à **traiter ses e-mails plus vite** :
- une liste de travail priorisée, où chaque e-mail est résumé en une phrase ;
- un espace de réponse où l'IA propose un brouillon que la personne relit, modifie et envoie ;
- une liste de tâches.

Le produit est **générique**. Il est présenté sous la marque KHentik et se personnalise (nom, logo, couleurs, apparence, ton de l'assistant) par un fichier de configuration. Aucune donnée, aucun vocabulaire ni aucune règle propre à Trendl ou à un client n'en fait partie.

**Première cliente envisagée** : la dirigeante de Mon Jardin Chocolaté, chocolaterie artisanale. Elle veut commencer simplement par la gestion de ses e-mails. Le projet de commandes groupées de la chocolaterie est **distinct** et hors périmètre.

**Parcours commercial visé** :
1. démonstration directe de la version KHentik (mode démo, données fictives) ;
2. questionnaire préalable rempli par la cliente ;
3. export du questionnaire fourni à un agent avec le package ;
4. instance personnalisée et vérifiée pour la démonstration à la cliente.

## 2. Périmètre

### 2.1 Inclus

| Domaine | Contenu |
|---|---|
| Navigation | Trois entrées : Assistant IA (accueil), Mailbox, To-do. Connexion et déconnexion. |
| Mailbox | Dossiers, recherche, résumé 12 h, liste, sélection, corbeille, espace de traitement partagé. |
| Espace de traitement | Résumé du fil, puis trois onglets : Réponse IA, Mail d'origine, Historique. |
| Assistant IA | Liste de travail priorisée (e-mails et tâches), assistant conversationnel et commandes rapides limités aux e-mails. |
| To-do | Tâches ponctuelles et récurrentes, lien optionnel vers un e-mail. |
| Personnalisation | Contrat de configuration, questionnaire client, outil d'application. |
| Technique | Connexion Gmail (OAuth), réception (Pub/Sub), analyse IA, envoi Gmail, règles d'accès. |

### 2.2 Exclu

Le package n'expose ni ne nécessite :
- le CRM (fiches, opportunités, négociations, collaborations, actions recommandées) ;
- le recouvrement ;
- les indicateurs et règles métier de Trendl ;
- les blocs « Cap AI » de l'accueil ;
- le « mode Alfred » de l'accueil ;
- les pastilles de couleur de classification de la Mailbox ;
- les commandes groupées et Odoo.

Le contrôle `npm run check:no-crm` le vérifie automatiquement.

### 2.3 Besoins techniques qui ne sont pas du CRM

Le produit manipule les **adresses des correspondants**, les **métadonnées des e-mails** (expéditeur, destinataires, copie, date, fil, dossiers Gmail) et un **nom d'entreprise détecté par l'IA** dans le texte de l'e-mail. Ce sont des données de messagerie : elles ne créent aucune fiche et ne sont pas stockées hors des e-mails.

## 3. Navigation et organisation des écrans

### 3.1 Barre latérale [Adapté]

- Trois entrées, dans cet ordre : **Assistant IA**, **Mailbox**, **To-do**. L'Assistant IA est l'écran d'accueil (`/`).
- En bas de la barre : nom de l'utilisateur et « Se déconnecter ».
- En mode démo : encart « Mode démonstration » et « Réinitialiser la démo ».
- En mode réel : menu repliable « Connexion de la messagerie » (autoriser Gmail, activer la réception). C'est un mécanisme technique, pas une rubrique métier.
- Logo et nom du produit selon la configuration. Mention « Exemple fictif » si la configuration est marquée fictive.
- Sur mobile, la barre devient un menu ouvrable depuis la barre du haut.

Trendl comptait une quarantaine d'entrées (CRM, recouvrement, système…). Elles ont toutes été retirées.

### 3.2 Mailbox

**Zone gauche** :
- commandes : dossier courant avec son compteur, bouton « Résumer 12 h », champ de recherche ;
- liste des conversations.

**Zone droite** : espace de traitement partagé (§ 3.4).

Sur mobile, la liste occupe l'écran. Choisir un e-mail ouvre l'espace de traitement en plein écran, avec une croix pour revenir à la liste.

### 3.3 Assistant IA (accueil)

**Gauche** : « À traiter », la liste de travail priorisée (§ 4.11).

**Droite** : l'assistant (nom selon la configuration), quatre commandes rapides et le chat.

« Répondre » ouvre l'espace de traitement dans un volet. Sous 1 280 px de large, l'assistant passe sous la liste.

### 3.4 Espace de traitement (partagé Mailbox / Assistant) [Adapté]

Un **seul composant**, utilisé par les deux écrans : les deux expériences ne peuvent donc pas diverger. De haut en bas :
1. **en-tête** : objet, expéditeur, entreprise si détectée, date et heure, bouton « + Tâche » ;
2. **résumé IA de la discussion** : ce qui s'est passé, points utiles, situation actuelle. Il porte sur tout le fil disponible ;
3. **trois onglets**, « Réponse IA » ouvert en premier :
   - **Réponse IA** : destinataires À, Cc et Cci, sujet, brouillon modifiable, régénération avec consigne, pièces jointes, envoi ;
   - **Mail d'origine** : en-têtes (De, À, Cc, Date), pièces jointes reçues, corps du message ;
   - **Historique** : tous les messages du fil, du plus ancien au plus récent. Chacun peut être déplié pour lire le message complet.

Le brouillon est conservé quand on change d'onglet.

**Retiré par rapport à Trendl** : « Ouvrir la fiche », passage automatique de l'opportunité en « Négociation » après l'envoi, contexte CRM du bandeau, suggestions de création de fiches, actions CRM recommandées.

### 3.5 To-do [Adapté]

- En-tête et bouton « + Nouvelle tâche ».
- Recherche sur le texte et le détail, case « Afficher les tâches faites ».
- Tableau : Tâche, Type, Échéance / ancre, Statut, actions (Fait, Rouvrir, Supprimer).
- Formulaire de création et de modification sur la même page.

## 4. Parcours principaux

### 4.1 Consulter

Ouvrir la Mailbox affiche la boîte de réception. Sur grand écran, la conversation la plus récente est sélectionnée automatiquement, **sans** la marquer comme lue. Un clic volontaire sur une conversation la marque lue, dans l'application et dans Gmail. **[Repris]**

### 4.2 Rechercher [Repris, adapté]

- **Filtre local immédiat**, sans accents ni majuscules, sur tous les messages du fil : objet, expéditeur, destinataires, copie, extrait, 4 000 premiers caractères du corps. Le package y ajoute le nom et l'entreprise détectés par l'IA et les noms des pièces jointes. Trendl y ajoutait les acteurs du CRM, ce qui a été retiré.
- **Recherche étendue** à partir de 3 caractères, après 500 ms sans frappe. En réel, Gmail cherche sur toutes les dates, l'objet, le corps et les pièces jointes, hors corbeille et spam, 25 fils au plus. Les fils trouvés sont ajoutés à la liste.
- Une recherche porte sur **tous les dossiers sauf corbeille et spam** (sauf si l'on se trouve dans l'un d'eux).

**Rechercher par nom** fonctionne par le nom d'affichage de l'expéditeur, par l'adresse, et par le nom détecté par l'IA.

### 4.3 Résumer les 12 dernières heures [Repris, adapté]

Accessible depuis la Mailbox (bouton) et depuis l'Assistant (commande rapide).

**Ce qui est pris en compte**, côté serveur :
- messages **arrivés dans l'application** depuis 12 h (champ `ingestedAt`, pas la date d'envoi) ;
- présents en boîte de réception ;
- pas encore triés ;
- 100 lus au plus, 50 envoyés à l'IA.

**Résultat** : une vue d'ensemble de 3 à 5 phrases, puis chaque e-mail avec quatre actions : **Répondre**, **Spam**, **Corbeille**, **Ignorer** (archiver). Le panneau reste ouvert pour enchaîner le tri.

**Adapté** : classification générique (à traiter / information / spam) au lieu de « opportunité / spam / autre ». L'action « Opportunité » est retirée.

### 4.4 Comprendre un fil

Le résumé en tête de l'espace de traitement donne : qui, de quoi il s'agit, les points utiles et la situation actuelle (« En attente de votre réponse : … » ou « Vous avez répondu en dernier… »).

En réel, il est calculé par l'IA sur les 15 derniers messages du fil (40 lus au plus). Il est mis en cache et recalculé dès qu'un message arrive. La consigne interdit d'inventer des messages manquants. **[Ajouté]**

### 4.5 Répondre avec l'IA [Repris, adapté]

1. À l'ouverture, un brouillon déjà généré pour ce message s'affiche aussitôt. Sinon, il est généré (5 à 10 s en réel).
2. **Cible** : le dernier message du fil.
   - S'il vient de l'interlocuteur : **réponse**.
   - Si l'utilisateur a écrit en dernier : **relance**.
3. **Destinataire** : toujours l'interlocuteur externe.
   - Formulaire de contact du site : l'adresse saisie dans le formulaire.
   - Sinon : l'adresse de réponse indiquée, sinon l'expéditeur.
4. **Copie (Cc)** : les personnes en À et en Cc du message, sauf le destinataire principal, l'utilisateur et les adresses internes. C'est l'équivalent de « répondre à tous ».
5. **Style** selon la configuration : ton (cordial, professionnel, direct), longueur (court, équilibré, détaillé), langue (français, anglais).
6. L'IA ne doit inventer **aucun fait** (prix, date, quantité, lien, adresse). Si une information manque, elle écrit un espace réservé, par exemple `[à compléter : …]`.
7. Les liens, téléphones et adresses absents des messages sont **signalés en rouge** sous le brouillon, et la confiance affichée est abaissée.

### 4.6 Modifier

Tous les champs restent modifiables avant l'envoi : À, Cc, Cci, sujet, texte. **[Repris]**

### 4.7 Régénérer avec une consigne

« Régénérer avec une consigne » ouvre un champ libre, par exemple « plus court », « ton plus formel » ou « réponds en anglais ». La consigne est prioritaire sur le style par défaut. **[Repris]**

### 4.8 Joindre un fichier

- 5 fichiers au plus, 10 Mo par fichier.
- Le fichier est déposé dans le stockage dès qu'il est choisi, puis joint à l'envoi par le serveur.
- Un fichier peut être retiré avant l'envoi.

**[Repris]**

### 4.9 Envoyer [Repris]

1. Les adresses À, Cc et Cci sont validées : une adresse invalide est nommée dans le message d'erreur.
2. Un bandeau « envoi dans 5 s — Annuler » s'affiche.
   - Annuler : **rien ne part** et le texte est conservé.
   - Fermer l'onglet pendant le compte à rebours : le navigateur prévient.
3. Le serveur **refuse l'envoi** s'il reste un espace réservé dans le texte.
4. L'envoi part depuis la boîte Gmail connectée, dans le même fil, avec l'historique cité en dessous.
5. La signature de l'expéditeur est apposée si elle est réglée.

En démo, l'envoi est simulé : le message est ajouté à l'historique fictif et l'écran l'indique.

### 4.10 Consulter les spams

- **Mailbox** : dossier « Spam ».
- **Assistant** : commande « Voir les spams ». Elle affiche la liste à cocher, avec « Lire » pour chaque e-mail, puis « Mettre à la corbeille (n) » **pour la sélection seulement**, après confirmation.

Il n'y a **aucune suppression globale automatique**. **[Ajouté]** : Trendl n'avait pas cette commande.

### 4.11 Liste de travail de l'accueil [Adapté]

**E-mails** : chaque conversation dont le **dernier message vient de l'interlocuteur**, en boîte de réception, hors newsletters et spams. Chaque ligne affiche :
- l'expéditeur, l'entreprise si détectée, la date ;
- l'objet ;
- **un court résumé IA** (qui, sujet, action attendue) ;
- le nombre de messages et les raisons du classement ;
- le bouton « Répondre ».

**Tâches** : échues aujourd'hui ou en retard, avec « ✓ Fait » et un lien vers l'e-mail lié s'il existe.

**Ordre** : voir § 4.13.

### 4.12 Gérer les tâches [Repris, adapté]

- **Ponctuelle** : une échéance. « Fait » la clôt définitivement.
- **Récurrente** : quotidienne, hebdomadaire, mensuelle, trimestrielle ou annuelle, plus une première échéance. « Fait » ne solde que l'occurrence en cours. Le calcul est fait à partir de l'ancre : « le 31 » revient bien au 31.
- Règles de saisie reprises de Trendl : tâche obligatoire ; échéance obligatoire si ponctuelle ; périodicité et ancre obligatoires si récurrente. Ajout : un lien utile doit commencer par http(s).
- **[Ajouté]** « + Tâche » dans l'espace de traitement crée une tâche du jour **liée à l'e-mail**. Dans Trendl, le lien tâche-e-mail passait par les collaborations du CRM.

### 4.13 Priorisation — exigence conservée, algorithme à définir [À définir]

**Dans Trendl**, l'accueil classait les actions par « valeur business ». La note combinait :
- le poids de la famille d'action ;
- le **montant** de l'opportunité ;
- la **fraîcheur** (e-mails) ou l'**ancienneté** (factures, tâches) ;
- le **poids de la marque et de l'agence** ;
- l'**historique de collaborations** ;
- un bonus de négociation en cours.

Tous ces critères, sauf la fraîcheur et l'ancienneté, dépendent du CRM.

**Règle provisoire retenue**, transparente et réglable dans `PRIORITY_RULES` (`src/features/home/lib/work-list.js`) :

```
e-mail = 100 (poids « mail à répondre », réglage Trendl)
       + fraîcheur (barème Trendl : +30 aujourd'hui … −35 au-delà de 21 jours)
       + 15 si l'IA a détecté une action attendue (ajout provisoire)
tâche  = 20 (poids « to-do », réglage Trendl) + 2 points par jour de retard (20 au plus)
```

Conséquence : **les e-mails passent avant les tâches**, puis à égalité le plus récent d'abord ; 12 éléments au plus.

Ce n'est **pas** une priorisation IA aboutie. Options pour la suite :
- (a) un score d'importance par l'IA à l'analyse ;
- (b) des expéditeurs ou domaines prioritaires saisis par le client (le questionnaire collecte déjà cette information, sans l'appliquer) ;
- (c) un mélange tâches / e-mails par échéance plutôt que par famille.

## 5. Règles de gestion vérifiées dans le code

| Règle | Comportement | Statut |
|---|---|---|
| **Constitution des fils** | Regroupement par fil Gmail. Les formulaires de contact du site sont chacun un fil à part. Les brouillons Gmail ne sont jamais affichés. Les copies strictement identiques sont fusionnées. Messages triés du plus ancien au plus récent ; fils triés par dernier message. | Repris |
| **Dossiers** | Boîte de réception, Spam, Archive, Envoyés, Corbeille. Le dossier d'un fil dépend de son **dernier message entrant** : une réponse envoyée ne fait pas sortir le fil de la boîte de réception. Les compteurs comptent des conversations. | Repris |
| **Liste chargée** | 200 derniers messages en temps réel, plus les fils trouvés par la recherche étendue ou ouverts par lien. | Repris |
| **Corbeille** | Porte sur le **dernier message** du fil. Corbeille Gmail, récupérable 30 jours côté Gmail. Le fil est masqué immédiatement et réaffiché si l'opération échoue. Pas de corbeille dans le dossier Corbeille. Pas de suppression définitive. | Repris |
| **Spam / Ignorer** | Spam = libellé SPAM, retiré de la boîte de réception. Ignorer = archivé. Les deux marquent le message comme trié. | Repris |
| **Domaines bloqués** | Les e-mails d'un domaine listé dans `app_settings/spam_v1` vont directement en spam, sans analyse IA. Une entrée « .xyz » bloque tout un suffixe. | Repris (extrait) |
| **Brouillons** | Un brouillon par message, dans `message_drafts/{id}`. Il est réaffiché à la réouverture et remplacé à chaque régénération. | Repris |
| **Résumé 12 h** | Voir § 4.3. | Adapté |
| **Analyse des e-mails** | Une analyse par e-mail entrant : catégorie (action, info, newsletter, spam, personnel), nom, entreprise si présente dans l'e-mail, résumé en une phrase, action attendue. Aucune IA pour les messages sortants, les brouillons et les spams. | Adapté |
| **Lien tâche ↔ e-mail** | Champs optionnels sur la tâche : fil, message, objet. Ouverture de l'e-mail depuis la tâche (accueil, To-do). | Ajouté |
| **Accès** | Seules les adresses de `app_settings/access.allowed_emails` (adresses vérifiées) lisent les e-mails et les brouillons, gèrent les tâches et appellent les fonctions. Tout le reste est fermé par défaut. | Adapté |

## 6. Données manquantes, pannes et échecs

| Situation | Comportement attendu (implémenté) |
|---|---|
| E-mail sans analyse IA | La liste affiche l'extrait du message à la place du résumé. |
| Entreprise non détectée | Rien n'est affiché à sa place : jamais de valeur inventée. |
| IA indisponible (résumé du fil) | « Résumé indisponible pour le moment (…) » ; le fil reste consultable dans « Historique ». |
| IA indisponible (brouillon) | « Proposition indisponible », avec « Réessayer » ou « Écrire moi-même ». |
| IA indisponible (résumé 12 h) | Message d'erreur et « Réessayer ». |
| Budget IA mensuel atteint | Le serveur refuse avec un message lisible (garde-fou repris de Trendl, inactif tant qu'il n'est pas armé). |
| Synchronisation impossible | Bandeau « Synchronisation impossible… Les e-mails affichés peuvent ne pas être à jour ». |
| Envoi refusé ou en échec | « Échec de l'envoi : … Votre texte est conservé. » **Le succès n'est affiché qu'après la réponse positive du serveur.** |
| Envoi annulé | « Envoi annulé : rien n'est parti, votre texte est conservé. » |
| Espace réservé oublié | L'envoi est refusé et l'information à compléter est nommée. |
| Adresse invalide | L'envoi est refusé et l'adresse est nommée. |
| E-mail ouvert par lien mais introuvable | Message « Cet e-mail n'est plus disponible ». |
| Corbeille ou spam en échec | Message d'erreur ; le fil réapparaît. |

## 7. Données et intégrations

- **Messagerie** : Gmail uniquement (API Gmail, droits `gmail.modify` et `gmail.send`), une boîte par instance. La connexion se fait par OAuth (jeton de rafraîchissement dans Secret Manager). Les nouveaux e-mails arrivent en temps réel par Pub/Sub, avec un renouvellement quotidien et un contrôle de santé toutes les 30 minutes.
- **IA** : Anthropic (Claude). Modèle rapide pour l'analyse, le résumé de fil et l'assistant ; modèle plus fin pour les brouillons et le résumé 12 h. Sorties structurées validées, protection contre les injections, plafond budgétaire optionnel.
- **Stockage** : Firestore. Collections `messages`, `message_drafts`, `todos`, `thread_summaries`, `assistant_conversations`, `app_settings`, `system`. Storage pour les pièces jointes sortantes.
- **Authentification** : Firebase Auth (e-mail et mot de passe), liste d'accès.
- **Cloisonnement** : une instance (projet Firebase) par client. Aucun client ne partage la base d'un autre.

## 8. Personnalisation et contrat de configuration

Une seule source de vérité : `src/config/contract.mjs`. Elle est utilisée **à l'identique** par l'application, le questionnaire (copie vérifiée par un test) et l'outil de l'agent. Le détail des champs est dans `CONTRAT-CONFIGURATION.md`.

| Section | Effet immédiat |
|---|---|
| `client` | Nom du produit (barre latérale, titre de l'onglet), nom de l'entreprise, site web, mention « exemple fictif ». |
| `brand.logo` | Logo clair et logo sombre, **embarqués** dans le JSON (300 Ko au plus). |
| `brand.colors` | Couleur principale (boutons, sélection, navigation) et couleur d'accent. Les teintes, le texte lisible et les variantes sombres sont dérivées automatiquement. |
| `appearance` | Thème (clair, sombre, selon l'appareil), police (3 polices système), densité de liste, taille du texte. |
| `assistant` | Nom affiché ; ton, longueur et langue des brouillons. |
| `context` | **Non appliqué**, marqué `applied: false` : activité, types d'e-mails, attentes de priorité, expéditeurs importants. Sert à un futur réglage. |

Le contrat **refuse** :
- tout champ de secret ;
- un logo donné par chemin de fichier ou par URL temporaire ;
- toute valeur hors liste ;
- un contexte marqué « appliqué ».

Il ne permet ni de réintroduire le CRM, ni de retirer une entrée de navigation, ni d'activer une fonction non livrée.

## 9. Critères d'acceptation

| # | Critère | Vérification réalisée |
|---|---|---|
| 1 | L'application ouvre sur l'Assistant IA ; trois entrées, dans l'ordre. | ✅ Navigateur automatisé, démo |
| 2 | Mailbox : dossiers, recherche, résumé 12 h, métadonnées, corbeille. | ✅ Démo (recherche « cahier » trouvée par la pièce jointe) |
| 3 | Aucune pastille de classification dans la liste. | ✅ Code retiré + capture |
| 4 | Sélection dans la Mailbox → résumé du fil + trois onglets, « Réponse IA » en premier. | ✅ Démo |
| 5 | « Répondre » de l'accueil → même composant. | ✅ Composant unique `EmailWorkspace` |
| 6 | Brouillon modifiable et régénérable ; À, Cc, Cci, pièces jointes, envoi avec annulation. | ✅ Démo (Cc « répondre à tous » pré-rempli, consigne « plus court et plus formel » appliquée, pièce jointe, compte à rebours, envoi simulé) |
| 7 | Résumés courts : qui, sujet, action attendue, sans CRM. | ✅ Démo ; ⏳ réel non exécuté |
| 8 | Classement par priorité documenté, règle provisoire signalée. | ✅ § 4.13, mention « règle provisoire » à l'écran |
| 9 | Chat et commandes limités aux e-mails ; spams sans suppression globale. | ✅ Démo + test des outils serveur |
| 10 | To-do : fonctions autonomes conservées, lien avec les e-mails. | ✅ Démo + tests de récurrence repris |
| 11 | Aucune dépendance CRM ou recouvrement ; blocs Cap AI retirés. | ✅ `npm run check:no-crm` |
| 12 | Lancement selon la documentation. | ✅ `npm install`, `npm run build`, `npm start` |
| 13 | Questionnaire : réponses conservées entre étapes et au rechargement, export valide avec logo. | ✅ Parcours automatisé complet |
| 14 | Export appliqué au package, effets visibles ; retour à KHentik possible. | ✅ Thème sombre, couleurs, police, densité, logo, nom « Léa » visibles ; `config:reset` |
| 15 | Limites et vérifications non exécutées indiquées. | ✅ § 10 et README |

## 10. Hypothèses, limites et décisions à prendre

### Hypothèses prises

- **H1 — « Cap AI »** : aucun élément de ce nom n'existe dans le code de Trendl. Nous avons considéré qu'il s'agit du **bandeau chiffré du haut** de l'accueil (`PipelineBand` : tunnel E-mails → Négociation → À encaisser) et des **quatre chiffres du bas** (`CockpitKpis`). Les deux sont retirés. **À confirmer.**
- **H2 — mélange e-mails / tâches** : e-mails d'abord, tâches ensuite (poids Trendl 100 / 20). Voir § 4.13.
- **H3 — cible de la réponse** : l'écran montre le dernier e-mail **reçu** ; le serveur rédige pour le dernier message du fil (réponse ou relance), comme Trendl.
- **H4 — organisation** : une instance par client (projet Firebase dédié), pas de plateforme multi-clients.

### Limites

- Mode réel non exécuté contre Gmail et Firebase pendant la construction : à valider sur un projet de recette.
- Gmail seulement.
- Brouillons générés à la demande (Trendl les pré-générait via le CRM).
- Pas d'écran pour la liste d'accès, la signature, les domaines bloqués et les réglages de réponse : ils se règlent dans la console Firebase.
- « Nouvel e-mail » (hors réponse) non repris : dans Trendl, il était lié à la prospection CRM.

### Décisions restantes

1. **Algorithme de priorité** : option (a), (b) ou (c) du § 4.13, ou une combinaison.
2. **Confirmation de H1** (Cap AI).
3. **Pré-génération des brouillons** à la réception (coût IA contre rapidité d'affichage).
4. **Composer un nouvel e-mail** sans répondre : à ajouter ou non au périmètre.
5. **Prise en charge d'Outlook / Microsoft 365** si des clients en ont besoin.
