import { brandConfig } from '@/features/brand/brand';
import { cn } from '@/shared/utils/cn';

const SIZES = { sm: 'h-7 w-7 text-xs', md: 'h-10 w-10 text-lg', lg: 'h-14 w-14 text-2xl' };

/**
 * Visage de l'assistant : l'avatar de l'instance (public/brand/, installé par
 * config:apply) ou, à défaut, une pastille aux couleurs de la marque.
 */
export function AssistantAvatar({ size = 'md', className }) {
  const { avatar, name } = brandConfig.assistant;
  if (avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatar} alt="" aria-hidden="true" className={cn('shrink-0 rounded-full object-cover ring-2 ring-primary/20', SIZES[size], className)} title={name} />
    );
  }
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground', SIZES[size], className)} aria-hidden="true">
      ✦
    </span>
  );
}
