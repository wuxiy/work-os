import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'
import { cn } from './cn'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-app text-[13px] font-medium transition-colors select-none outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-app-accent text-app-accent-fg hover:bg-app-accent/90',
        secondary: 'bg-app-panel2 text-app-fg hover:bg-app-border',
        outline: 'border border-app-border bg-transparent hover:bg-app-panel2',
        ghost: 'bg-transparent hover:bg-app-panel2 text-app-fg',
        danger: 'bg-app-danger text-white hover:opacity-90',
      },
      size: {
        sm: 'h-7 px-2.5',
        md: 'h-8 px-3',
        lg: 'h-9 px-4',
        icon: 'h-7 w-7 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
))
Button.displayName = 'Button'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-app border border-app-border bg-app-panel px-2.5 text-[13px] outline-none placeholder:text-app-fg-dim focus:border-app-accent',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-app border border-app-border bg-app-panel px-2.5 py-2 text-[13px] outline-none placeholder:text-app-fg-dim focus:border-app-accent',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export function Badge({
  className,
  tone = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'default' | 'accent' | 'success' | 'warn' | 'danger' }) {
  const tones: Record<string, string> = {
    default: 'bg-app-panel2 text-app-fg-dim',
    accent: 'bg-app-accent/15 text-app-accent',
    success: 'bg-app-success/15 text-app-success',
    warn: 'bg-app-warn/15 text-app-warn',
    danger: 'bg-app-danger/15 text-app-danger',
  }
  return (
    <span
      className={cn('inline-flex items-center rounded-app px-1.5 py-0.5 text-[11px] font-medium', tones[tone], className)}
      {...props}
    />
  )
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-app border border-app-border bg-app-panel', className)} {...props} />
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-app-border bg-app-panel2 px-1 font-mono text-[11px] text-app-fg-dim',
        className,
      )}
      {...props}
    />
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-app-border border-t-app-accent', className)}
    />
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 py-10 text-app-fg-dim">
      <p className="text-[13px]">{title}</p>
      {hint ? <p className="text-[12px]">{hint}</p> : null}
    </div>
  )
}
