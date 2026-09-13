import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades a section in the first time it scrolls into view.
 * Falls back to visible immediately when IntersectionObserver is unavailable.
 */
export function Reveal({
  children,
  className = "",
  as: Tag = "div",
  delay = 0,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
  delay?: number;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const Component = Tag as "div";
  return (
    <Component
      ref={ref as React.Ref<HTMLDivElement>}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Component>
  );
}
