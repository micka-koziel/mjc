// Police de charte (Work Sans), embarquée avec l'application : aucun appel à un service externe.
import '@fontsource/work-sans/300.css';
import '@fontsource/work-sans/400.css';
import '@fontsource/work-sans/600.css';
import './globals.css';
import { Suspense } from 'react';
import { AppProviders } from '@/app-shell/AppProviders';
import { AppShell } from '@/app-shell/AppShell';
import { brandConfig, brandDataset, brandVariables } from '@/features/brand/brand';

export const metadata = {
  title: brandConfig.client.productName,
  description: `${brandConfig.client.productName} — gestion des e-mails assistée par IA`,
};

/**
 * Racine : la configuration de marque est appliquée AVANT le premier rendu
 * (variables CSS + thème sur <html>), sans flash de couleurs par défaut.
 */
export default function RootLayout({ children }) {
  return (
    <html
      lang={brandConfig.assistant.language === 'en' ? 'en' : 'fr'}
      {...brandDataset}
      style={brandVariables}
    >
      <body>
        <AppProviders>
          {/* Suspense : la navigation lit l'adresse (useSearchParams). */}
          <Suspense fallback={null}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </AppProviders>
      </body>
    </html>
  );
}
