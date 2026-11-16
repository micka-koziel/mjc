/**
 * Signature de la personne qui envoie — Sprint 103 (post 2 de l'équipe
 * Trendl, 22/10 : « dans ma signature d'envoi j'ai ajouté mon prénom, ma
 * signature et mon adresse d'envoi… ça n'a mis que mon prénom, et ma
 * signature n'est pas apposée »).
 *
 * Le remplacement côté écran (Sprint 95) ne reconnaissait que la forme
 * « …\nMaxime » en toute dernière ligne. Dès que le brouillon finissait par
 * « Maxime\nTrendl », « Max – Trendl » ou sans prénom du tout, la signature
 * de la personne n'était pas posée. Cette version, appliquée AUSSI au moment
 * de l'envoi (serveur), couvre :
 *  1. signature déjà présente → rien ;
 *  2. signature par défaut de Trendl (Response Settings) → remplacée ;
 *  3. bloc final signé d'un prénom connu (DEFAULT_SIGNERS) → remplacé ;
 *  4. formule de politesse finale sans nom → signature ajoutée dessous ;
 *  5. rien de tout ça → signature ajoutée à la fin.
 * (4 et 5 seulement si la personne a saisi une signature, pas un prénom seul.)
 *
 * Repris de Trendl (Sprint 103) ; le package n'applique la signature
 * qu'au moment de l'envoi (côté serveur).
 */

// Quantique : Trendl remplaçait un bloc final signé « Maxime / Max ». Les
// prénoms reconnus viennent désormais du paramètre DEFAULT_SIGNERS (prénoms
// séparés par des virgules) ; vide par défaut → l'étape 3 est inactive.
const DEFAULT_SIGNERS = String(process.env.DEFAULT_SIGNERS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
const CLOSINGS = /^(cordialement|bien (à|a) (vous|toi)|bien cordialement|belle journée|bonne journée|bonne soirée|à (très )?bientôt|merci( beaucoup| encore)?|best( regards)?|kind regards|regards|cheers|thanks|thank you|all the best|warm regards|sincerely)[\s,.!]*$/i;

const clean = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * Remplace (ou pose) la signature de la personne dans un texte d'e-mail.
 * @param {string} text
 * @param {{name?: string, signature?: string}} profile
 * @param {{defaultSignature?: string}} [opts]
 * @return {string}
 */
function personalizeSignature(text, profile, {defaultSignature = ""} = {}) {
  const body = typeof text === "string" ? text : "";
  const target = clean(profile && (profile.signature || profile.name));
  if (!body.trim() || !target) return body;
  if (body.includes(target)) return body;

  const def = clean(defaultSignature);
  if (def && body.includes(def)) {
    const at = body.lastIndexOf(def);
    return body.slice(0, at) + target + body.slice(at + def.length);
  }

  // Fin de texte (sauts de ligne) conservée telle quelle.
  const trailing = body.match(/\s*$/)[0];
  const lines = body.replace(/\s+$/, "").split("\n");
  const nonEmpty = [];
  for (let i = lines.length - 1; i >= 0 && nonEmpty.length < 5; i -= 1) {
    if (lines[i].trim()) nonEmpty.push(i);
  }
  // 3. Bloc « Maxime … » parmi les dernières lignes, suivi seulement de
  //    lignes courtes (« Trendl », « Trendl Agency », téléphone…).
  for (const i of nonEmpty) {
    const words = lines[i].trim().split(/\s+/);
    const first = words[0].replace(/[,.]$/, "").toLowerCase();
    const short = words.length <= 4 && !/[?!:]/.test(lines[i]);
    const tailShort = lines.slice(i + 1).every((l) => l.trim().split(/\s+/).length <= 5);
    if (short && tailShort && DEFAULT_SIGNERS.includes(first)) {
      const indent = lines[i].match(/^\s*/)[0];
      return [...lines.slice(0, i), `${indent}${target}`].join("\n") + trailing;
    }
  }
  // 4 et 5 : seulement avec une vraie signature (un prénom seul ajouté à un
  // texte sans formule de fin serait plus gênant qu'utile).
  if (!clean(profile.signature)) return body;
  // 4. Formule de politesse en dernière ligne : la signature vient dessous.
  const last = nonEmpty[0];
  if (last !== undefined && CLOSINGS.test(lines[last].trim())) {
    return [...lines.slice(0, last + 1), target].join("\n") + trailing;
  }
  // 5. Aucune fin reconnue : on ajoute la signature.
  return `${lines.join("\n")}\n\n${target}${trailing}`;
}

module.exports = {personalizeSignature, DEFAULT_SIGNERS, CLOSINGS};
