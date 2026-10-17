

import { cva } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        // bv-sheen — перелив «Без Воды»: световая полоса за курсором (раздел 10).
        // Только заливные кнопки; ghost и link остаются без материала.
        default: "bv-sheen relative isolate overflow-hidden bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        destructive: "bv-sheen relative isolate overflow-hidden bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
        outline: "bv-sheen relative isolate overflow-hidden border border-input bg-background hover:bg-muted/80",
        secondary: "bv-sheen relative isolate overflow-hidden bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-muted/80",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export { buttonVariants };
