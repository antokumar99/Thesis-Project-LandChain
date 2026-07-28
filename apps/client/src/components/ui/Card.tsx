import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-[#d8dfda] bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}
