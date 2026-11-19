# Questionnaire client (version 2)

`questionnaire-v2.html` est le questionnaire fourni par l'équipe KHentik : un fichier unique qui fonctionne hors ligne. Le client le remplit dans son navigateur et télécharge ses réponses au format **Excel** (`khentik-email-<entreprise>-reponses.xlsx`).

Ce fichier est une **copie de référence** : les valeurs autorisées de `src/config/questionnaire-v2.mjs` doivent correspondre à ses choix (un test le vérifie). Pour le faire évoluer, mettre à jour les deux.

Pour installer les réponses d'un client : voir `docs/GUIDE-AGENT-PERSONNALISATION.md`.

Point connu à corriger dans le questionnaire : la case « couleurs KHentik » est cochée par défaut. Elle est ignorée à l'import (jamais de couleurs KHentik chez un client).
