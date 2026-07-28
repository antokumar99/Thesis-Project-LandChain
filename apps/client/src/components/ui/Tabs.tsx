"use client";

import { ReactNode, useState } from "react";

export type TabItem = {
  id: string;
  label: ReactNode;
  content: ReactNode;
};

export function Tabs({ tabs, initialTab }: { tabs: TabItem[]; initialTab?: string }) {
  const [active, setActive] = useState(initialTab ?? tabs[0]?.id);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1 border-b border-[#d8dfda]" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === current?.id}
            onClick={() => setActive(tab.id)}
            className={`-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-semibold transition ${
              tab.id === current?.id
                ? "border-[#244b36] bg-[#eef2ed] text-[#17201b]"
                : "border-transparent text-[#65766b] hover:bg-[#f0f4f0]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
