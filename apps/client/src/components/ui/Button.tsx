import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ icon, variant = "primary", className = "", children, ...props }: ButtonProps) {
  const styles = {
    primary: "bg-[#244b36] text-white hover:bg-[#1b3a29]",
    secondary: "border border-[#a7b5ad] bg-white text-[#17201b] hover:bg-[#eef2ed]",
    ghost: "text-[#244b36] hover:bg-[#e7ede7]"
  };

  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition ${styles[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
