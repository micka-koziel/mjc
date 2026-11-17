import { describe, it, expect } from 'vitest';
import { MODULES, enabledModules, showModuleTitles } from './registry';

describe('registre des modules', () => {
  it('MVP : seul le module e-mail est actif, avec ses trois écrans', () => {
    expect(enabledModules().map((m) => m.id)).toEqual(['email']);
    expect(MODULES[0].nav.map((n) => n.view)).toEqual(['home', 'mailbox', 'todos']);
  });
  it('identifiants de modules et d’écrans uniques', () => {
    const ids = MODULES.map((m) => m.id);
    const views = MODULES.flatMap((m) => m.nav.map((n) => n.view));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(views).size).toBe(views.length);
  });
  it('titres de modules masqués avec un seul module actif, affichés à partir de deux', () => {
    expect(showModuleTitles()).toBe(false);
    const deux = [
      ...MODULES,
      { id: 'commandes', label: 'Commandes groupées', enabled: true, nav: [] },
    ];
    expect(showModuleTitles(deux)).toBe(true);
    expect(showModuleTitles([...MODULES, { ...deux[1], enabled: false }])).toBe(false);
  });
});
