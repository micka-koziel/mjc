# Configuration client — questionnaire v2 → instance

Seul le **questionnaire version 2** est accepté (`questionnaireVersion: "2.0"`). La version 1 est obsolète et a été retirée.

## Le chemin d'une réponse

```
questionnaire/questionnaire-v2.html   (rempli par le client, export Excel)
        │
        ▼
config/clients/<client>/questionnaire.xlsx  +  overrides.json (arbitrages, facultatif)
        │   npm run config:apply -- config/clients/<client>
        ▼
src/config/instance.mjs : buildInstance()
        ├─ src/config/active.config.json    interface : couleurs, logo, apparence, nom de l'assistant
        ├─ functions/config/ai-profile.json style d'écriture et contexte métier (serveur uniquement)
        ├─ public/brand/logo-*.{png,jpg,…}  logos
        └─ config/clients/<client>/documents/  documents joints (non versionnés, non embarqués)
```

| Fichier source | Rôle |
|---|---|
| `src/config/questionnaire-v2.mjs` | Valeurs autorisées (recopiées du questionnaire HTML, vérifiées par un test) et validation des réponses |
| `src/config/instance.mjs` | Passage réponses → configuration d'interface et profil IA ; arbitrages |
| `src/config/brand-css.mjs` | Variables CSS (couleurs lisibles, polices) |
| `scripts/read-answers.mjs` | Lecture de l'Excel (onglet « Donnees JSON », fragments recollés) ou d'un JSON |
| `scripts/config-cli.mjs` | Commandes `config:validate`, `config:apply`, `config:reset` |
| `functions/lib/ai-profile.js` | Consignes IA construites à partir du profil |

## Où va chaque réponse

| Réponse | Utilisation |
|---|---|
| `client.companyName`, `productName`, `website` | Interface (titre, logo) et profil IA |
| `brand.logo.light` / `dark` | Fichiers `public/brand/` (2 Mo max, comme le questionnaire) |
| `brand.colors.primary`, `accent` | Boutons et accents. **`useKHentikDefaults` est ignoré** : les couleurs KHentik ne s'appliquent jamais à un client |
| `brand.extra.surface` | Fond du thème clair |
| `brand.extra.links` | Liens (assombris automatiquement jusqu'à un contraste de 4,5) |
| `brand.extra.secondary`, `brand.extra.style`, `appearance.layout` | Lus, **pas encore appliqués** (signalés à l'import) |
| `appearance.theme`, `font`, `density`, `textSize` | Interface |
| `appearance.corners` (`soft` / `square`) | Rayon des angles |
| `appearance.messagePreview` (`one` / `two` / `none`) | Aperçu des messages dans la Mailbox |
| `appearance.sidebar` (`expanded` / `collapsed`) | Barre latérale ouverte ou réduite (dépliable) |
| `appearance.contrast` (`standard` / `high`) | Textes secondaires et bordures renforcés |
| `assistant.name`, `tone`, `concision`, `language` | Interface et IA (le profil serveur fait foi) |
| `assistant.formality`, `greeting`, `empathy`, `clarify`, `avoidPromises`, `instructions`, `forbiddenTerms`, `exampleResponse` | Brouillons de réponse (IA) |
| `assistant.signatureText` (si `signature = custom`) | Fin des brouillons ; exclue du contrôle des « faits inventés » |
| `context.activity`, `businessDescription`, `audience`, `emailTypes`, `vocabulary` | Contexte de toutes les consignes IA |
| `context.priorityExpectations`, `priorityRules`, `escalationRules` | Analyse des e-mails : champ `urgent` → bonus dans la liste « À traiter » |
| `context.importantSenders` | Liste « À traiter » (bonus, nom ou adresse, sans accents ni casse) et IA |
| `documents` | Rangés dans `config/clients/<client>/documents/`. **Jamais envoyés à l'IA**, sauf un document texte nommé dans `overrides.json` (`ai.referenceDocuments`), avec l'accord du client : le questionnaire lui annonce que ses documents ne sont pas transmis à une IA |
| `feedback` | Non utilisé (lecture humaine) |

## Les arbitrages (`overrides.json`)

Fusionnés **par-dessus** les réponses, avant validation. Ils servent à appliquer une décision prise avec le client sans modifier son fichier. Toujours renseigner `note` (qui, quand, pourquoi) : elle est affichée à chaque import.

Clés propres à l'instance (absentes du questionnaire) :

| Clé | Rôle |
|---|---|
| `brand.colors.text` | Couleur des textes (assombrie si nécessaire pour rester lisible) |
| `brand.colors.success` | Couleur des confirmations |
| `appearance.font: "worksans"`, `appearance.titleFont` | Police de charte (Work Sans, embarquée) et police des titres |
| `ai.referenceDocuments` | Noms de documents **texte** à transmettre à l'IA comme guide d'écriture (24 000 caractères au total) |

Exemple : `config/clients/mjc/overrides.json`.
