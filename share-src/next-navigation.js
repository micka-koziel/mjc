// Remplaçant de next/navigation pour la page unique partagée : la navigation
// passe par l'ancre (src/app-shell/nav.js, mode HASH_ROUTING).
export const usePathname = () => '/';
export const useRouter = () => ({ push() {}, replace() {} });
export const useSearchParams = () => null;
