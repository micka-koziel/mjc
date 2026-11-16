'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * EmailBodyFrame — Affiche le body d'un email de façon sécurisée.
 *
 * Stratégie V1 Sprint 20 :
 *  - Par défaut on affiche bodyText (toujours présent, zéro risque XSS).
 *  - Toggle "Voir version HTML" → affiche bodyHtml dans une iframe
 *    sandbox="" (aucun JS, aucune navigation, aucun form). C'est l'approche
 *    Gmail/Apple Mail : les emails HTML peuvent contenir n'importe quel
 *    contenu malveillant, l'iframe sandbox les neutralise complètement.
 *  - Auto-resize via postMessage : l'iframe envoie sa hauteur au parent
 *    après chargement. Plafond à 1600px pour éviter les emails géants.
 *
 * Pourquoi pas DOMPurify ? Zéro dépendance ajoutée, sandbox est
 * suffisant pour V1, et l'iframe isole aussi le CSS (les emails ne peuvent
 * pas casser le layout de notre app).
 *
 * @param {object} props
 * @param {string} [props.bodyHtml] HTML brut (ingestEmail.js)
 * @param {string} [props.bodyText] Plain text fallback
 */
export function EmailBodyFrame({ bodyHtml, bodyText }) {
  const [mode, setMode] = useState('text'); // 'text' | 'html'
  const iframeRef = useRef(null);
  const [iframeHeight, setIframeHeight] = useState(400);

  const hasHtml = Boolean(bodyHtml && bodyHtml.trim());
  const hasText = Boolean(bodyText && bodyText.trim());

  // Mode réellement affiché : si une seule version existe, on la force
  // (sinon un mail 100% HTML resterait bloqué sur l'onglet Texte vide et
  // n'afficherait jamais son contenu).
  const effectiveMode = hasText && hasHtml ? mode : hasHtml ? 'html' : 'text';

  useEffect(() => {
    if (effectiveMode !== 'html') return undefined;

    function onMessage(event) {
      // On accepte n'importe quelle source ici car l'iframe sandbox="" ne peut
      // pas se faire passer pour une autre origine (origin sera "null").
      if (event.data && event.data.__qMailboxIframeHeight) {
        const h = Math.min(
          Math.max(parseInt(event.data.__qMailboxIframeHeight, 10) || 400, 200),
          1600,
        );
        setIframeHeight(h);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [effectiveMode]);

  if (!hasHtml && !hasText) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        Email sans contenu lisible (HTML/texte vides).
      </div>
    );
  }

  // Script auto-resize injecté dans srcdoc. Mesure la hauteur du body et
  // envoie au parent. L'iframe sandbox="" autorise les scripts via
  // "allow-scripts" UNIQUEMENT si on l'ajoute. Or on veut ZÉRO script
  // depuis le contenu email. Solution : on ajoute "allow-scripts" mais on
  // injecte un postMessage minimal en tête de doc, AVANT tout contenu, et
  // surtout sans "allow-same-origin" pour que window.parent n'ait aucun
  // accès au DOM. Le script email lui-même ne peut rien faire d'utile.
  //
  // En réalité on omet allow-scripts pour V1 : pas de resize auto, hauteur
  // = 600 par défaut + scroll interne. Plus safe.
  // Sprint 89 (requête Max 03/08) — « les écrans de Mailbox doivent être
  // figés, pas de scroll à droite » : le CSS injecté force le retour à la
  // ligne PARTOUT dans l'email (overflow-wrap:anywhere), neutralise les
  // tables à largeur fixe des emails marketing (table-layout:fixed +
  // width:100% sur les tables plus larges que la fenêtre via max-width) et
  // fait replier les <pre> et les URLs interminables.
  //
  // Sprint 100 (Mickaël, 19/10) — texte encore coupé à droite : les emails
  // collés depuis Google Docs / Gmail portent white-space:nowrap (ou pre) en
  // style inline, qui gagnait contre overflow-wrap ; et overflow-x:hidden
  // CACHAIT le débordement sans moyen de le lire. Désormais :
  //  - nowrap neutralisé (→ normal), pre/pre-line inline → pre-wrap (garde les
  //    sauts de ligne mais replie) ; on ne touche pas aux autres éléments ;
  //  - min-width neutralisé (wrappers « min-width:600px » des newsletters) ;
  //  - filet : ce qui déborde encore (grand tableau) défile au lieu d'être perdu.
  const srcDoc = hasHtml ? buildEmailSrcDoc(bodyHtml) : '';

  return (
    <div className="space-y-2">
      {hasHtml && hasText && (
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`rounded-md px-2 py-1 transition-colors ${
              mode === 'text'
                ? 'bg-elevated text-foreground'
                : 'text-muted hover:text-foreground'
            }`}
          >
            Texte
          </button>
          <button
            type="button"
            onClick={() => setMode('html')}
            className={`rounded-md px-2 py-1 transition-colors ${
              mode === 'html'
                ? 'bg-elevated text-foreground'
                : 'text-muted hover:text-foreground'
            }`}
          >
            HTML
          </button>
        </div>
      )}

      {/* Sprint 89 — max-w-full + overflow-wrap:anywhere : un token sans
          espace (URL de tracking…) ne pousse plus la colonne vers la droite. */}
      {effectiveMode === 'text' && hasText && (
        <pre className="max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-lg border border-border bg-surface p-4 font-sans text-sm leading-relaxed text-foreground">
          {bodyText}
        </pre>
      )}

      {effectiveMode === 'html' && hasHtml && (
        <iframe
          ref={iframeRef}
          title="Contenu HTML de l'email (sandboxé)"
          sandbox=""
          srcDoc={srcDoc}
          className="w-full rounded-lg border border-border bg-white"
          style={{ height: iframeHeight }}
        />
      )}
    </div>
  );
}

/**
 * Document HTML (srcdoc) de l'iframe sandbox. Exporté pour les tests.
 * @param {string} bodyHtml
 * @returns {string}
 */
export function buildEmailSrcDoc(bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
       html,body{margin:0;overflow-x:auto}
       body{padding:16px;font-family:system-ui,sans-serif;color:#1a1a1a;background:#ffffff;line-height:1.5;font-size:14px;overflow-wrap:anywhere;word-break:break-word}
       *{max-width:100% !important;min-width:0 !important;box-sizing:border-box}
       [nowrap],[style*="nowrap" i]{white-space:normal !important}
       [style*="white-space:pre" i],[style*="white-space: pre" i]{white-space:pre-wrap !important}
       img{max-width:100%;height:auto}
       a{color:#6b5bd2;word-break:break-all}
       table{max-width:100% !important;width:auto !important;border-collapse:collapse;table-layout:fixed}
       td,th{overflow-wrap:anywhere;word-break:break-word}
       pre,pre *{white-space:pre-wrap !important;overflow-wrap:anywhere}
       pre,code{background:#f3f4f6;padding:2px 4px;border-radius:4px}
       blockquote{border-left:3px solid #ddd;padding-left:12px;color:#555;margin:8px 0}
       </style></head><body>${bodyHtml}</body></html>`;
}
