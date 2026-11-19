/**
 * Point d'entrée de la DÉMO partageable (page unique, sans Next.js) :
 * mêmes composants que l'application, données fictives, navigation par ancre.
 */
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@/app-shell/AppProviders';
import { AppShell } from '@/app-shell/AppShell';
import HomePage from '@/app/page';
import { brandConfig, brandDataset, brandVariables } from '@/features/brand/brand';

const html = document.documentElement;
html.lang = brandConfig.assistant.language === 'en' ? 'en' : 'fr';
for (const [k, v] of Object.entries(brandDataset)) html.setAttribute(k, v);
for (const [k, v] of Object.entries(brandVariables)) html.style.setProperty(k, v);
document.title = `${brandConfig.client.productName} — démonstration`;

createRoot(document.getElementById('root')).render(
  <AppProviders>
    <AppShell>
      <HomePage />
    </AppShell>
  </AppProviders>
);
