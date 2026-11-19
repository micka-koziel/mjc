/**
 * Point d'entrée unique de la couche services (voir contract.js).
 * NEXT_PUBLIC_DATA_MODE = « demo » (défaut) ou « firebase ».
 */
import { createDemoService } from './demo/demo-service';

let instance = null;

export const DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE === 'firebase' ? 'firebase' : 'demo';

/**
 * NEXT_PUBLIC_MAILBOX = « simulated » : instance de DÉMONSTRATION en mode réel
 * (Firebase et IA réels, e-mails fictifs, rien n'est envoyé).
 */
export const SIMULATED_MAILBOX = DATA_MODE === 'firebase' && process.env.NEXT_PUBLIC_MAILBOX === 'simulated';

export async function getMailService() {
  if (instance) return instance;
  if (DATA_MODE === 'firebase') {
    const { createFirebaseService } = await import('./firebase/firebase-service');
    instance = createFirebaseService();
  } else {
    instance = createDemoService();
  }
  return instance;
}
