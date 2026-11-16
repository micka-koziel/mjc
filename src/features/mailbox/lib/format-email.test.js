import { describe, it, expect } from 'vitest';
import {
  parseEmailAddress,
  displayName,
  initialsFromAddress,
  summarizeRecipients,
} from './format-email';

describe('parseEmailAddress', () => {
  it('parses Name <email> format', () => {
    expect(parseEmailAddress('Jean Dupont <jean@example.com>')).toEqual({
      name: 'Jean Dupont',
      email: 'jean@example.com',
    });
  });

  it('handles quoted name with comma', () => {
    expect(parseEmailAddress('"Dupont, Jean" <jean@example.com>')).toEqual({
      name: 'Dupont, Jean',
      email: 'jean@example.com',
    });
  });

  it('handles email only (no chevrons)', () => {
    expect(parseEmailAddress('jean@example.com')).toEqual({
      name: '',
      email: 'jean@example.com',
    });
  });

  it('handles chevron-only format', () => {
    expect(parseEmailAddress('<jean@example.com>')).toEqual({
      name: '',
      email: 'jean@example.com',
    });
  });

  it('returns empty on falsy input', () => {
    expect(parseEmailAddress('')).toEqual({ name: '', email: '' });
    expect(parseEmailAddress(null)).toEqual({ name: '', email: '' });
    expect(parseEmailAddress(undefined)).toEqual({ name: '', email: '' });
  });
});

describe('displayName', () => {
  it('prefers name over email', () => {
    expect(displayName('Jean Dupont <jean@example.com>')).toBe('Jean Dupont');
  });

  it('falls back to email when no name', () => {
    expect(displayName('jean@example.com')).toBe('jean@example.com');
  });

  it('returns empty for empty input', () => {
    expect(displayName('')).toBe('');
  });
});

describe('initialsFromAddress', () => {
  it('returns 2 initials from full name', () => {
    expect(initialsFromAddress('Jean Dupont <j@e.com>')).toBe('JD');
  });

  it('returns 2 initials from dotted email username', () => {
    expect(initialsFromAddress('jean.dupont@example.com')).toBe('JD');
  });

  it('returns first 2 chars from single-word email', () => {
    expect(initialsFromAddress('jean@example.com')).toBe('JE');
  });

  it('returns ? on empty', () => {
    expect(initialsFromAddress('')).toBe('?');
    expect(initialsFromAddress(null)).toBe('?');
  });

  it('handles accents in names', () => {
    expect(initialsFromAddress('Édouard Béranger <e@b.com>')).toBe('ÉB');
  });
});

describe('summarizeRecipients', () => {
  it('joins names with comma when <= 3', () => {
    const list = ['Jean <j@e.com>', 'Marie <m@e.com>'];
    expect(summarizeRecipients(list)).toBe('Jean, Marie');
  });

  it('truncates and adds "et N autres" when > 3', () => {
    const list = [
      'Jean <j@e.com>',
      'Marie <m@e.com>',
      'Paul <p@e.com>',
      'Lisa <l@e.com>',
    ];
    expect(summarizeRecipients(list)).toBe('Jean, Marie et 2 autres');
  });

  it('returns empty on empty input', () => {
    expect(summarizeRecipients([])).toBe('');
    expect(summarizeRecipients(null)).toBe('');
  });
});
