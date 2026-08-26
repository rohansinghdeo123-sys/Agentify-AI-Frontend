"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Restores a predictable reading position after navigating between Exam workspaces. */
export function useRouteHeadingFocus<T extends HTMLElement = HTMLHeadingElement>() {
  const pathname = usePathname();
  const headingRef = useRef<T>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return headingRef;
}
