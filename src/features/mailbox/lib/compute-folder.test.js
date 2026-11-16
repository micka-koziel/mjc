import { describe, it, expect } from 'vitest';
import {
  computeFolder,
  filterByFolder,
  countByFolder,
  MAILBOX_FOLDER_IDS,
} from './compute-folder';

describe('computeFolder', () => {
  it('returns archive when no labels', () => {
    expect(computeFolder({})).toBe('archive');
    expect(computeFolder({ labels: [] })).toBe('archive');
    expect(computeFolder(null)).toBe('archive');
  });

  it('returns inbox when INBOX label present', () => {
    expect(computeFolder({ labels: ['INBOX'] })).toBe('inbox');
    expect(computeFolder({ labels: ['INBOX', 'IMPORTANT'] })).toBe('inbox');
  });

  it('returns spam when SPAM label present, even with INBOX', () => {
    expect(computeFolder({ labels: ['SPAM'] })).toBe('spam');
    expect(computeFolder({ labels: ['INBOX', 'SPAM'] })).toBe('spam');
  });

  it('returns sent when SENT label present (without TRASH or SPAM)', () => {
    expect(computeFolder({ labels: ['SENT'] })).toBe('sent');
  });

  it('returns trash when TRASH label present, overriding all others', () => {
    expect(computeFolder({ labels: ['INBOX', 'TRASH'] })).toBe('trash');
    expect(computeFolder({ labels: ['SPAM', 'TRASH'] })).toBe('trash');
  });

  it('returns archive when labels do not match any standard folder', () => {
    expect(computeFolder({ labels: ['Label_123'] })).toBe('archive');
    expect(computeFolder({ labels: ['CATEGORY_PROMOTIONS'] })).toBe('archive');
  });
});

describe('filterByFolder', () => {
  const messages = [
    { id: '1', labels: ['INBOX'] },
    { id: '2', labels: ['SPAM'] },
    { id: '3', labels: ['SENT'] },
    { id: '4', labels: [] },
    { id: '5', labels: ['INBOX', 'TRASH'] },
  ];

  it('returns only inbox messages', () => {
    const result = filterByFolder(messages, 'inbox');
    expect(result).toEqual([{ id: '1', labels: ['INBOX'] }]);
  });

  it('returns only spam messages', () => {
    const result = filterByFolder(messages, 'spam');
    expect(result.map((m) => m.id)).toEqual(['2']);
  });

  it('returns only trash messages', () => {
    const result = filterByFolder(messages, 'trash');
    expect(result.map((m) => m.id)).toEqual(['5']);
  });

  it('returns archive for messages without standard label', () => {
    const result = filterByFolder(messages, 'archive');
    expect(result.map((m) => m.id)).toEqual(['4']);
  });

  it('returns all messages when folderId is falsy', () => {
    expect(filterByFolder(messages, null)).toHaveLength(5);
    expect(filterByFolder(messages, '')).toHaveLength(5);
  });

  it('returns empty array on non-array input', () => {
    expect(filterByFolder(null, 'inbox')).toEqual([]);
  });
});

describe('countByFolder', () => {
  it('counts messages per folder', () => {
    const messages = [
      { labels: ['INBOX'] },
      { labels: ['INBOX'] },
      { labels: ['SPAM'] },
      { labels: ['SENT'] },
      { labels: [] },
    ];
    const counts = countByFolder(messages);
    expect(counts.inbox).toBe(2);
    expect(counts.spam).toBe(1);
    expect(counts.sent).toBe(1);
    expect(counts.archive).toBe(1);
    expect(counts.trash).toBe(0);
  });

  it('returns zeros for empty input', () => {
    const counts = countByFolder([]);
    expect(counts.inbox).toBe(0);
    expect(counts.spam).toBe(0);
  });
});

describe('MAILBOX_FOLDER_IDS', () => {
  it('exposes string constants', () => {
    expect(MAILBOX_FOLDER_IDS.INBOX).toBe('inbox');
    expect(MAILBOX_FOLDER_IDS.SPAM).toBe('spam');
    expect(MAILBOX_FOLDER_IDS.SENT).toBe('sent');
    expect(MAILBOX_FOLDER_IDS.TRASH).toBe('trash');
    expect(MAILBOX_FOLDER_IDS.ARCHIVE).toBe('archive');
  });
});

// ===== Sprint 82.2 — dossier par CONVERSATION + compteurs cohérents =========
// Règle produit (22/07, session GoLive) : un email reçu reste dans l'Inbox
// quoi qu'il arrive autour. Le brouillon Gmail créé par la réponse IA
// (ingéré par le watch, label DRAFT) éjectait toute la conversation.
import { computeThreadFolder, countThreadsByFolder } from './compute-folder';

describe('computeThreadFolder — Sprint 82.2', () => {
  const inboxMsg = { labels: ['INBOX', 'UNREAD'] };
  const draftMsg = { labels: ['DRAFT'] };
  const sentMsg = { labels: ['SENT'] };

  it('un brouillon en fin de fil ne sort PAS la conversation de l’Inbox', () => {
    expect(computeThreadFolder([inboxMsg, draftMsg])).toBe('inbox');
  });

  it('une réponse envoyée en fin de fil ne sort PAS la conversation de l’Inbox', () => {
    expect(computeThreadFolder([inboxMsg, sentMsg])).toBe('inbox');
  });

  it('fil 100 % sortant (prospection) → repli sur le dernier message (sent)', () => {
    expect(computeThreadFolder([sentMsg, draftMsg])).toBe('archive'); // dernier = DRAFT
    expect(computeThreadFolder([draftMsg, sentMsg])).toBe('sent');
  });

  it('le dernier ENTRANT fait foi (spam reste spam même avec brouillon)', () => {
    expect(computeThreadFolder([{ labels: ['SPAM'] }, draftMsg])).toBe('spam');
  });

  it('robuste aux entrées dégénérées', () => {
    expect(computeThreadFolder([])).toBe('archive');
    expect(computeThreadFolder(null)).toBe('archive');
  });
});

describe('countThreadsByFolder — Sprint 82.2', () => {
  it('compte des conversations avec la même règle que la liste', () => {
    const threads = [
      { messages: [{ labels: ['INBOX'] }, { labels: ['DRAFT'] }] },
      { messages: [{ labels: ['INBOX'] }] },
      { messages: [{ labels: ['TRASH'] }] },
    ];
    const counts = countThreadsByFolder(threads);
    expect(counts.inbox).toBe(2);
    expect(counts.trash).toBe(1);
    expect(counts.archive).toBe(0);
  });
});
