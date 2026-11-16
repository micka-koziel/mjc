import { describe, it, expect } from 'vitest';
import { buildWorkList, freshnessPoints, threadAwaitsReply, PRIORITY_RULES } from './work-list';
import { groupByThread } from '@/features/mailbox/lib/threads';
import { buildDemoMessages, buildDemoTodos } from '@/services/demo/demo-data';

const NOW = Date.parse('2026-11-16T12:00:00Z');

describe('work-list (règle provisoire)', () => {
  const threads = groupByThread(buildDemoMessages(NOW));
  const todos = buildDemoTodos(NOW);
  const list = buildWorkList({ threads, todos, now: NOW });

  it('ne garde que les fils dont le dernier message est entrant, en boîte de réception', () => {
    const keys = list.filter((i) => i.kind === 'email').map((i) => i.thread.threadId);
    expect(keys).toContain('t-dupont');
    expect(keys).not.toContain('t-transport'); // on a répondu en dernier
    expect(keys).not.toContain('t-news'); // newsletter
    expect(keys).not.toContain('t-spam-1');
    expect(keys).not.toContain('t-trash');
  });

  it('classe un mail récent avec action avant un mail ancien', () => {
    const order = list.filter((i) => i.kind === 'email').map((i) => i.thread.threadId);
    expect(order.indexOf('t-dupont')).toBeLessThan(order.indexOf('t-candidat'));
  });

  it('ajoute les tâches échues (ponctuelle du jour, récurrentes) mais pas les futures ni les faites', () => {
    const ids = list.filter((i) => i.kind === 'todo').map((i) => i.todo.id);
    expect(ids).toContain('todo-devis');
    expect(ids).not.toContain('todo-stock');
    expect(ids).not.toContain('todo-vitrine');
  });

  it('expose ses règles (aucune règle cachée)', () => {
    expect(freshnessPoints(0)).toBe(PRIORITY_RULES.fresh.d0);
    expect(freshnessPoints(30)).toBe(PRIORITY_RULES.fresh.d22plus);
    expect(threadAwaitsReply({ messages: [] })).toBe(false);
  });
});
