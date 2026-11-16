'use client';

import { Suspense } from 'react';
import { AssistantHome } from '@/features/home/components/AssistantHome';
import { MailboxShell } from '@/features/mailbox/components/MailboxShell';
import { TodosPage } from '@/features/todos/components/TodosPage';
import { HASH_ROUTING, useNav } from '@/app-shell/nav';

/**
 * Accueil = Assistant IA. En mode « page unique » (démo partagée), cette
 * page affiche aussi la Mailbox et la To-do selon l'ancre (#mailbox, #todos).
 */
function SinglePage() {
  const { view } = useNav();
  if (view === 'mailbox') return <MailboxShell />;
  if (view === 'todos') return <TodosPage />;
  return <AssistantHome />;
}

export default function HomePage() {
  if (!HASH_ROUTING) return <AssistantHome />;
  return (
    <Suspense fallback={null}>
      <SinglePage />
    </Suspense>
  );
}
