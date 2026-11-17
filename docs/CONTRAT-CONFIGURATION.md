# Contrat de configuration — version 1.0

**Source unique** : `src/config/contract.mjs` (règles, valeurs autorisées, valeurs par défaut, validation).
Cette même source est utilisée :
- par l'application, pour appliquer la marque ;
- par le questionnaire, qui en embarque une copie contrôlée par un test ;
- par l'outil `npm run config:*`.

Le format est un JSON en UTF-8. Le fichier exporté par le questionnaire s'appelle `khentik-config-<entreprise>.json`.

## Champs

| Champ | Type | Obligatoire | Défaut | Valeurs / règles | Effet |
|---|---|---|---|---|---|
| `schemaVersion` | texte | oui | `"1.0"` | exactement `"1.0"` | Version du contrat |
| `client.companyName` | texte | oui | `KHentik` | 1 à 80 caractères | Nom de l'entreprise |
| `client.productName` | texte | oui | `KHentik Email` | 1 à 40 caractères | Nom affiché (barre latérale, onglet du navigateur) |
| `client.website` | texte | non | `""` | `https://…` | Information |
| `client.isFictional` | booléen | oui | `false` | | Mention « Exemple fictif » sous le logo |
| `brand.logo.light` | objet ou `null` | oui (peut être `null`) | `null` | `{dataUrl, mimeType, fileName}` ; PNG, JPEG, WEBP ou SVG ; **300 Ko au plus** ; image **embarquée** en `data:…;base64,` | Logo sur fond clair |
| `brand.logo.dark` | objet ou `null` | oui (peut être `null`) | `null` | idem | Logo sur fond sombre (sinon, le logo clair) |
| `brand.colors.useKHentikDefaults` | booléen | oui | `true` | | `true` = couleurs KHentik, quelles que soient les valeurs saisies |
| `brand.colors.primary` | texte | oui | `#A9883A` | `#RRGGBB` ; un contraste faible déclenche un avertissement | Boutons, sélection, navigation |
| `brand.colors.accent` | texte | oui | `#0C1929` | `#RRGGBB` | Couleur secondaire |
| `brand.colors.background` | texte ou null | non | `null` | `#RRGGBB` | Fond du thème clair ; zones en relief et bordures en dérivent. `null` = fond neutre. Alerte si trop foncé |
| `appearance.theme` | texte | oui | `light` | `light`, `dark`, `system` | Thème |
| `appearance.font` | texte | oui | `system` | `system` (Moderne), `humanist` (Douce), `serif` (Classique) | Police (polices système, sans téléchargement) |
| `appearance.titleFont` | texte ou null | non | `null` | `system`, `humanist`, `serif` | Police des titres. `null` = même police que le texte |
| `appearance.density` | texte | oui | `comfortable` | `comfortable`, `compact` | Espacement des listes |
| `appearance.textSize` | texte | oui | `normal` | `normal`, `large` (+12,5 %) | Taille du texte |
| `assistant.name` | texte | oui | `Assistant` | 1 à 30 caractères | Nom de l'assistant (accueil, chat, chargement) |
| `assistant.tone` | texte | oui | `cordial` | `cordial`, `professional`, `direct` | Ton des brouillons |
| `assistant.concision` | texte | oui | `balanced` | `short`, `balanced`, `detailed` | Longueur des brouillons |
| `assistant.language` | texte | oui | `fr` | `fr`, `en` | Langue des brouillons et des réponses du chat |
| `context.applied` | booléen | oui | `false` | **toujours `false`** | Indique que le contexte n'est pas appliqué |
| `context.activity` | texte | non | `""` | 2 000 caractères au plus | **Non appliqué**, réservé à un futur réglage |
| `context.emailTypes` | liste | oui (peut être vide) | `[]` | `customers`, `orders`, `suppliers`, `quotes`, `billing`, `partners`, `recruiting`, `admin`, `newsletters`, `other` | **Non appliqué** |
| `context.priorityExpectations` | texte | non | `""` | 2 000 caractères au plus | **Non appliqué** |
| `context.importantSenders` | texte | non | `""` | 2 000 caractères au plus | **Non appliqué** |
| `context.notes` | texte | non | `""` | 2 000 caractères au plus | **Non appliqué** |
| `meta` | objet | non | | `exportedAt`, `source`, `appliedAt`, `appliedFrom` | Traçabilité |

## Refus systématiques

La validation refuse :
- tout champ nommé `password`, `apiKey`, `api_key`, `secret` ou `token` (aucun secret dans ce fichier) ;
- un logo donné par chemin de fichier, par URL `blob:` ou par URL web : il ne survivrait pas au transfert ;
- toute valeur hors des listes ci-dessus ;
- `context.applied` différent de `false`.

## Ce que le contrat ne permet pas

Il ne permet ni de réactiver le CRM, ni de masquer ou d'ajouter une entrée de navigation, ni d'activer une fonction non livrée. La navigation et le comportement métier ne sont pas configurables.

## Exemples

- `config/khentik.reference.json` : référence KHentik. Couleurs reprises de l'application khentik-app (or `#A9883A`, bleu nuit `#0C1929`). Logo tiré de « Logo HD KHentik.png » : la variante pour fond sombre est le logo d'origine recadré ; la variante pour fond clair en est **dérivée** (lettres argent passées en bleu nuit, H doré conservé), car l'original argenté est peu lisible sur fond blanc.
- `config/examples/client-fictif.atelier-ginkgo.json` : client **fictif**, avec logo SVG inventé, thème clair, police classique, densité compacte, assistant « Gaspard ».
