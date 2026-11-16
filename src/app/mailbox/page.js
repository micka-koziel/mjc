'use client';

import { Suspense } from 'react';
import { MailboxShell } from '@/features/mailbox/components/MailboxShell';

export default function MailboxPage() {
  // Suspense : MailboxShell lit ?thread= (useSearchParams).
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Chargement de la Mailbox…</div>}>
      <MailboxShell />
    </Suspense>
  );
}
