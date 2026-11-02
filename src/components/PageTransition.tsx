import { useState, type AnimationEvent, type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

export const PageTransition = ({ children }: PageTransitionProps) => {
  const [transitionStage, setTransitionStage] = useState<"enter" | "idle">(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "idle" : "enter",
  );

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && event.animationName === "page-slide-in-up") {
      setTransitionStage("idle");
    }
  };

  return (
    <div
      className={`page-transition-wrapper${transitionStage === "enter" ? " page-enter" : ""}`}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  );
};
