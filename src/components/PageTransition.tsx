import { useEffect, useRef } from "react";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className = "" }: PageTransitionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      // Trigger animation on mount
      ref.current.style.animation = "none";
      setTimeout(() => {
        if (ref.current) {
          ref.current.style.animation = "";
        }
      }, 10);
    }
  }, [children]);

  return (
    <div 
      ref={ref}
      className={`page-transition ${className}`}
    >
      {children}
    </div>
  );
}
