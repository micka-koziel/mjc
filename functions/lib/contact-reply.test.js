/**
 * Tests unitaires — functions/lib/contact-reply.js (Sprint 29).
 */
import { describe, it, expect } from 'vitest';
import {
  isContactFormMessage,
  extractContactFormEmail,
  resolveReplyTo,
} from './contact-reply.js';

const CONTACT_TEXT = [
  'Nouveau message',
  '',
  'Sujet  : Marque',
  'Nom    : Mickael KOZIEL',
  'Email  : mickael.koziel@saint-gobain.com',
  'Société: Saint-Gobain',
  'Locale : fr',
  '',
  '--- Message ---',
  'Bonjour, je souhaite lancer une campagne TikTok.',
].join('\n');

describe('isContactFormMessage', () => {
  it('détecte le marqueur [Contact] dans le sujet', () => {
    expect(
      isContactFormMessage({ subject: '[Contact] Marque — Mickael' }),
    ).toBe(true);
  });
  it('renvoie false pour un mail lambda', () => {
    expect(isContactFormMessage({ subject: 'Re: facture' })).toBe(false);
    expect(isContactFormMessage({})).toBe(false);
  });
});

describe('extractContactFormEmail', () => {
  it('extrait l’adresse de la ligne « Email : »', () => {
    expect(extractContactFormEmail({ bodyText: CONTACT_TEXT })).toBe(
      'mickael.koziel@saint-gobain.com',
    );
  });
  it('tombe sur le premier email si pas de ligne labellisée', () => {
    expect(
      extractContactFormEmail({ bodyText: 'Contactez jean@example.com svp' }),
    ).toBe('jean@example.com');
  });
  it('déshabille le HTML en dernier recours', () => {
    expect(
      extractContactFormEmail({
        bodyText: '',
        bodyHtml: '<p>visiteur@domaine.fr · Société</p>',
      }),
    ).toBe('visiteur@domaine.fr');
  });
  it('renvoie "" si aucun email', () => {
    expect(extractContactFormEmail({ bodyText: 'rien ici' })).toBe('');
  });
});

describe('resolveReplyTo', () => {
  it('mail de formulaire → adresse du formulaire (PAS l’expéditeur Resend)', () => {
    const message = {
      subject: '[Contact] Marque — Mickael KOZIEL',
      bodyText: CONTACT_TEXT,
      from: 'onboarding@resend.dev',
    };
    expect(resolveReplyTo(message, 'onboarding@resend.dev')).toBe(
      'mickael.koziel@saint-gobain.com',
    );
  });

  it('mail normal → Reply-To header en priorité, sinon from', () => {
    expect(
      resolveReplyTo(
        { subject: 'Question', from: 'a@x.com' },
        'b@y.com',
      ),
    ).toBe('b@y.com');
    expect(
      resolveReplyTo({ subject: 'Question', from: 'a@x.com' }, ''),
    ).toBe('a@x.com');
  });

  it('formulaire sans email extractible → fallback header/from', () => {
    expect(
      resolveReplyTo(
        { subject: '[Contact] Autre — X', bodyText: 'vide', from: 'f@z.com' },
        '',
      ),
    ).toBe('f@z.com');
  });
});
