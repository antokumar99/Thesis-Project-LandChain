"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function JsonViewer({ value, maxHeight = "24rem" }: { value: unknown; maxHeight?: string }) {
  const [copied, setCopied] = useState(false);
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="relative rounded-md border border-[#d8dfda] bg-[#0f1713]">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md bg-[#244b36] p-1.5 text-white hover:bg-[#1b3a29]"
        aria-label="Copy JSON"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <pre className="overflow-auto p-4 text-xs leading-5 text-[#c9e5d2]" style={{ maxHeight }}>
        {text}
      </pre>
    </div>
  );
}
