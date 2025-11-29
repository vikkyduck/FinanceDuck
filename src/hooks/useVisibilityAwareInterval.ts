import { useState, useEffect } from "react";

const DEFAULT_INTERVAL = 120000;

export function useVisibilityAwareInterval(interval = DEFAULT_INTERVAL) {
  const [isVisible, setIsVisible] = useState(document.visibilityState === "visible");
  
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return isVisible ? interval : false;
}
