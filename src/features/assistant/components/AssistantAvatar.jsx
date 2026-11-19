import { brandConfig } from '@/features/brand/brand';
import { cn } from '@/shared/utils/cn';

const SIZES = { sm: 'h-7 w-7 text-xs', md: 'h-10 w-10 text-lg', lg: 'h-14 w-14 text-2xl', xl: 'h-28 w-28 text-5xl' };

/**
 * Visage de l'assistant : l'avatar de l'instance (public/brand/, installé par
 * config:apply) ou, à défaut, une pastille aux couleurs de la marque.
 * `live` : halo qui respire + pastille « en ligne » (effets coupés si
 * l'utilisateur a demandé à réduire les animations). L'avatar SVG peut porter
 * ses propres animations, qu'il ne joue qu'affiché en grand.
 */
export function AssistantAvatar({ size = 'md', live = false, className }) {
  const { avatar, name } = brandConfig.assistant;
  const face = avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatar} alt="" aria-hidden="true" className={cn('shrink-0 rounded-full object-cover ring-2 ring-primary/20', SIZES[size], !live && className)} title={name} />
  ) : (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground', SIZES[size], !live && className)} aria-hidden="true">
      ✦
    </span>
  );
  if (!live) return face;
  return (
    <span className={cn('assistant-live relative inline-flex shrink-0 rounded-full', className)}>
      {face}
      <span className="absolute bottom-1.5 right-1.5 flex h-4 w-4" aria-hidden="true">
        <span className="assistant-live-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
        <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-surface bg-success" />
      </span>
    </span>
  );
}
