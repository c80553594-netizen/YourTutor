import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps): React.ReactElement {
  const base =
    'inline-flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none';
  const sizing = size === 'sm' ? 'px-2.5 py-1.5 text-xs min-h-[34px]' : 'px-3.5 py-2 text-sm min-h-[40px]';

  let styleClasses = '';
  let inlineStyle: React.CSSProperties = { borderRadius: 'var(--yt-radius-control)' };

  if (variant === 'primary') {
    styleClasses = 'shadow-xs';
    inlineStyle = {
      ...inlineStyle,
      backgroundColor: 'var(--yt-accent)',
      color: 'var(--yt-accent-foreground)',
    };
  } else if (variant === 'secondary') {
    styleClasses = 'border';
    inlineStyle = {
      ...inlineStyle,
      backgroundColor: 'var(--yt-bg-surface)',
      borderColor: 'var(--yt-border-strong)',
      color: 'var(--yt-text-primary)',
    };
  } else if (variant === 'danger') {
    styleClasses = 'border';
    inlineStyle = {
      ...inlineStyle,
      backgroundColor: 'var(--yt-mastery-weak-bg)',
      borderColor: 'var(--yt-mastery-weak)',
      color: 'var(--yt-mastery-weak)',
    };
  } else {
    inlineStyle = {
      ...inlineStyle,
      color: 'var(--yt-text-secondary)',
    };
  }

  return (
    <button
      type={type}
      className={`${base} ${sizing} ${styleClasses} ${className}`}
      style={{ ...inlineStyle, ...props.style }}
      {...props}
    />
  );
}

export interface BadgeProps {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'weak' | 'consolidating' | 'mastered';
  className?: string;
}

export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps): React.ReactElement {
  const toneStyles: Record<NonNullable<BadgeProps['tone']>, React.CSSProperties> = {
    neutral: {
      backgroundColor: 'var(--yt-bg-elevated)',
      color: 'var(--yt-text-secondary)',
    },
    accent: {
      backgroundColor: 'var(--yt-accent-soft)',
      color: 'var(--yt-accent)',
    },
    weak: {
      backgroundColor: 'var(--yt-mastery-weak-bg)',
      color: 'var(--yt-mastery-weak)',
    },
    consolidating: {
      backgroundColor: 'var(--yt-mastery-consolidating-bg)',
      color: 'var(--yt-mastery-consolidating)',
    },
    mastered: {
      backgroundColor: 'var(--yt-mastery-mastered-bg)',
      color: 'var(--yt-mastery-mastered)',
    },
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={toneStyles[tone]}
    >
      {children}
    </span>
  );
}

export interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps): React.ReactElement {
  return (
    <div
      className={`border p-4 ${className}`}
      style={{
        backgroundColor: 'var(--yt-bg-surface)',
        borderColor: 'var(--yt-border)',
        borderRadius: 'var(--yt-radius-card)',
      }}
    >
      {children}
    </div>
  );
}

export interface ProgressBarProps {
  value: number;
  tone?: 'accent' | 'weak' | 'consolidating' | 'mastered';
}

export function ProgressBar({ value, tone = 'accent' }: ProgressBarProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, value));
  const colorVar =
    tone === 'weak'
      ? 'var(--yt-mastery-weak)'
      : tone === 'consolidating'
        ? 'var(--yt-mastery-consolidating)'
        : tone === 'mastered'
          ? 'var(--yt-mastery-mastered)'
          : 'var(--yt-accent)';

  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: 'var(--yt-bg-elevated)' }}
    >
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${clamped}%`, backgroundColor: colorVar }}
      />
    </div>
  );
}
