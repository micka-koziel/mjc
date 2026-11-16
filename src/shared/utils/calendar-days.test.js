import { describe, it, expect } from 'vitest';
import { calendarDaysSince } from './calendar-days';

describe('calendarDaysSince (heure de Paris)', () => {
  const now = Date.parse('2026-10-20T06:03:00Z'); // 20/10 8 h 03 à Paris
  it('la veille compte 1 jour, même à moins de 24 h', () => {
    expect(calendarDaysSince(Date.parse('2026-10-19T08:17:00Z'), now)).toBe(1);
    expect(calendarDaysSince(Date.parse('2026-10-19T21:59:00Z'), now)).toBe(1);
  });
  it('après minuit à Paris, c’est aujourd’hui', () => {
    expect(calendarDaysSince(Date.parse('2026-10-19T22:01:00Z'), now)).toBe(0);
  });
  it('date absente → null', () => {
    expect(calendarDaysSince(null, now)).toBeNull();
  });
});
