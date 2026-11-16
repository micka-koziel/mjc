'use client';

import { cn } from '@/shared/utils/cn';
import { Spinner } from './Spinner';

/**
 * Button — repris de Trendl. KHentik : le variant primary suit la couleur
 * de marque configurée (variables CSS --q-*), sans effet « glow » Trendl.
 */

const VARIANT_CLASSES = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-strong transition-colors shadow-sm',
  secondary: 'border border-border bg-transparent text-foreground hover:bg-elevated transition-colors',
  danger: 'bg-danger text-danger-foreground hover:opacity-90 active:opacity-95 transition-all',
  ghost: 'bg-transparent text-muted hover:text-foreground hover:bg-elevated transition-colors',
};

const SIZE_CLASSES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

/**
 * Button — Bouton réutilisable, thème de marque configurable.
 *
 * @param {object} props
 * @param {'primary'|'secondary'|'danger'|'ghost'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.isLoading=false]
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className]
 * @param {'button'|'submit'|'reset'} [props.type='button']
 * @param {React.ReactNode} props.children
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  className,
  type = 'button',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {isLoading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}
