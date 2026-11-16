/**
 * Annulation d'envoi — Sprint 107 (demande de l'équipe du 13/11 : « une
 * temporisation de quelques secondes avec possibilité d'annuler à l'envoi
 * d'un e-mail » ; choix de Mickaël : 5 secondes depuis le 107.1, partout).
 *
 * Avant chaque envoi réel (réponses, nouvel e-mail, relances, prospection,
 * temps forts, script à la marque, facture, réponses des créateurs aux
 * sollicitations), `waitForUndo()` affiche en bas de l'écran :
 *   « Envoi dans 5 s — Annuler »
 * Rien ne part pendant le compte à rebours. « Annuler » rejette la promesse
 * avec une `SendCancelledError` : l'écran garde le texte et affiche « Envoi
 * annulé ». Fermer l'onglet pendant le compte à rebours = rien ne part (le
 * navigateur prévient avant).
 *
 * Bandeau en DOM simple (pas de composant React à monter) : il marche dans
 * l'espace admin comme dans l'espace créateur. Plusieurs envois en attente
 * s'empilent.
 */

// Sprint 107.1 (Mickaël, 13/11 : « 20 s, c'est trop long ») — 5 secondes.
export const UNDO_SEND_SECONDS = 5;

export class SendCancelledError extends Error {
  constructor() {
    super('Envoi annulé : rien n’est parti, votre texte est conservé.');
    this.name = 'SendCancelledError';
    this.cancelled = true;
  }
}

export function isSendCancelled(err) {
  return Boolean(err && (err.cancelled || err.name === 'SendCancelledError'));
}

let pending = 0;
function beforeUnload(e) {
  e.preventDefault();
  e.returnValue = 'Un envoi est en cours : si vous quittez, il ne partira pas.';
  return e.returnValue;
}

function stackRoot() {
  let root = document.getElementById('q-undo-send');
  if (!root) {
    root = document.createElement('div');
    root.id = 'q-undo-send';
    root.setAttribute('aria-live', 'polite');
    root.className = 'fixed bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 flex-col gap-2';
    document.body.appendChild(root);
  }
  return root;
}

/**
 * Attend la fin du délai d'annulation. Résout quand l'envoi peut partir,
 * rejette avec SendCancelledError si la personne annule.
 * @param {{label?: string, seconds?: number}} [opts]
 * @returns {Promise<void>}
 */
export function waitForUndo({ label = 'E-mail', seconds } = {}) {
  const total = Number.isFinite(seconds)
    ? seconds
    : typeof globalThis !== 'undefined' && Number.isFinite(globalThis.__Q_UNDO_SECONDS__)
      ? globalThis.__Q_UNDO_SECONDS__
      : UNDO_SEND_SECONDS;
  if (typeof document === 'undefined' || total <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let left = total;
    const box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.className =
      'flex items-center gap-4 rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-sm text-white shadow-2xl';
    const text = document.createElement('span');
    const bar = document.createElement('span');
    bar.className = 'block h-1 rounded-full bg-[var(--q-primary,#A9883A)] transition-all duration-1000 ease-linear';
    const barWrap = document.createElement('span');
    barWrap.className = 'block h-1 w-24 overflow-hidden rounded-full bg-white/10';
    barWrap.appendChild(bar);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Annuler';
    cancel.className = 'rounded-md bg-white px-3 py-1 text-sm font-semibold text-[#111827] hover:bg-white/90';
    box.append(text, barWrap, cancel);
    stackRoot().appendChild(box);

    const render = () => {
      text.textContent = `${label} : envoi dans ${left} s`;
      bar.style.width = `${(left / total) * 100}%`;
    };
    render();
    pending += 1;
    if (pending === 1) window.addEventListener('beforeunload', beforeUnload);

    const done = () => {
      clearInterval(timer);
      box.remove();
      pending -= 1;
      if (pending === 0) window.removeEventListener('beforeunload', beforeUnload);
    };
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        done();
        resolve();
      } else {
        render();
      }
    }, 1000);
    cancel.addEventListener('click', () => {
      done();
      reject(new SendCancelledError());
    });
  });
}
