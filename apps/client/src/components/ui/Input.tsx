import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[#34433b]">
      {label}
      <input
        className={`h-10 rounded-md border border-[#c6d0c9] bg-white px-3 text-sm text-[#17201b] outline-none focus:border-[#244b36] ${className}`}
        {...props}
      />
    </label>
  );
}
