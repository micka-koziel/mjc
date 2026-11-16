import { describe, it, expect } from 'vitest';
import {
  isContactFormMessage,
  extractContactFormEmail,
  resolveReplyTo,
} from './resolve-reply-to';

const CONTACT_TEXT = [
  'Nouveau message KHentik',
  '',
  'Sujet  : Marque',
  'Nom    : Mickael KOZIEL',
  'Email  : mickael.koziel@saint-gobain.com',
  'Société: Saint-Gobain',
  'Locale : fr',
].join('\n');

describe('resolve-reply-to (Sprint 29)', () => {
  it('détecte un mail de formulaire de contact', () => {
    expect(
      isContactFormMessage({ subject: '[Contact] Marque — X' }),
    ).toBe(true);
    expect(isContactFormMessage({ subject: 'Re: facture' })).toBe(false);
  });

  it('extrait l’adresse saisie dans le corps du formulaire', () => {
    expect(extractContactFormEmail({ bodyText: CONTACT_TEXT })).toBe(
      'mickael.koziel@saint-gobain.com',
    );
  });

  it('formulaire → adresse du formulaire, PAS l’expéditeur Resend', () => {
    expect(
      resolveReplyTo({
        subject: '[Contact] Marque — Mickael KOZIEL',
        bodyText: CONTACT_TEXT,
        from: 'onboarding@resend.dev',
        reply_to: 'onboarding@resend.dev',
      }),
    ).toBe('mickael.koziel@saint-gobain.com');
  });

  it('mail normal → reply_to puis from', () => {
    expect(
      resolveReplyTo({ subject: 'Devis', reply_to: 'a@x.com', from: 'b@y.com' }),
    ).toBe('a@x.com');
    expect(resolveReplyTo({ subject: 'Devis', from: 'b@y.com' })).toBe(
      'b@y.com',
    );
  });
});
