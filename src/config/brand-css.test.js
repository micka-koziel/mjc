import { describe, it, expect } from 'vitest';
import { brandCssVariables, contrastRatio, readableOn, readableTextColor } from './brand-css.mjs';

describe('variables CSS de marque', () => {
  it('dérive des couleurs lisibles', () => {
    const v = brandCssVariables({ brand: { colors: { primary: '#FFE600', accent: '#000000' } } });
    expect(v['--q-primary-foreground']).toBe('#111827');
    expect(readableOn('#1E3A8A')).toBe('#FFFFFF');
  });
  it('assombrit un lien ou un texte trop pâle (kraft sur blanc)', () => {
    expect(contrastRatio('#AD7C59', '#FFFFFF')).toBeLessThan(4.5);
    expect(contrastRatio(readableTextColor('#AD7C59', '#FFFFFF'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
  it('fond, texte, succès et polices facultatifs', () => {
    const neutre = brandCssVariables({});
    expect(neutre['--q-bg-custom']).toBeUndefined();
    expect(neutre['--q-fg-custom']).toBeUndefined();
    expect(neutre['--q-font-title']).toBe(neutre['--q-font']);
    const mjc = brandCssVariables({
      brand: { colors: { primary: '#4F2C1D', background: '#FFFFFF', text: '#4F2C1D', success: '#338811', link: '#AD7C59' } },
      appearance: { font: 'worksans', titleFont: 'worksans' },
    });
    expect(mjc['--q-fg-custom']).toBe('#4F2C1D');
    expect(mjc['--q-primary-foreground']).toBe('#FFFFFF');
    expect(mjc['--q-font']).toMatch(/Work Sans/);
    expect(contrastRatio(mjc['--q-link-light'], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
