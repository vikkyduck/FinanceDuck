import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

interface PageTransitionProps {
  children: React.ReactNode;
}

export const PageTransition = ({ children }: PageTransitionProps) => {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setTransitionStage("exit");
    }
  }, [location, displayLocation]);

  const handleAnimationEnd = () => {
    if (transitionStage === "exit") {
      setDisplayLocation(location);
      setTransitionStage("enter");
    }
  };

  return (
    <div
      className={`page-transition-wrapper ${
        transitionStage === "enter" ? "page-enter" : "page-exit"
      }`}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  );
};
