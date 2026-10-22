"use client";

import type { MouseEvent, ReactNode } from "react";

interface ScrollToSectionLinkProps {
  href: `#${string}`;
  className?: string;
  children: ReactNode;
}

export default function ScrollToSectionLink({
  href,
  className,
  children,
}: ScrollToSectionLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(href.slice(1));

    if (!target) return;

    event.preventDefault();

    target.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    if (window.location.hash !== href) {
      window.history.pushState(null, "", href);
    }
  };

  return (
    <a href={href} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
