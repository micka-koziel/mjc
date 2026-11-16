import { describe, it, expect, vi, afterEach } from 'vitest';
import { waitForUndo, isSendCancelled } from './undo-send';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Sprint 107 — annulation d’envoi', () => {
  it('rien ne part avant la fin du délai, puis l’envoi est libéré', async () => {
    vi.useFakeTimers();
    let sent = false;
    const p = waitForUndo({ label: 'Réponse', seconds: 20 }).then(() => (sent = true));
    expect(document.body.textContent).toContain('Réponse : envoi dans 20 s');
    await vi.advanceTimersByTimeAsync(19000);
    expect(sent).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(sent).toBe(true);
    expect(document.getElementById('q-undo-send').children).toHaveLength(0);
  });
  it('« Annuler » bloque l’envoi avec une erreur reconnaissable', async () => {
    vi.useFakeTimers();
    const p = waitForUndo({ seconds: 20 });
    document.querySelector('#q-undo-send button').click();
    await expect(p).rejects.toSatisfy(isSendCancelled);
  });
  it('délai 0 (tests) : immédiat', async () => {
    await expect(waitForUndo({ seconds: 0 })).resolves.toBeUndefined();
  });
});
