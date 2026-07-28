import Link from "next/link";
import { BadgeCheck, Blocks, FilePlus2, LayoutDashboard, MessagesSquare, ScrollText } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/lands/request", label: "Register Land", icon: FilePlus2 },
  { href: "/proofs/generate", label: "Generate Proof", icon: BadgeCheck },
  { href: "/proofs", label: "ZK Outputs", icon: MessagesSquare },
  { href: "/transactions", label: "Ledger", icon: ScrollText },
  { href: "/explorer", label: "Block Explorer", icon: Blocks }
];

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#d8dfda] bg-[#f0f4f0] p-4 md:block">
      <div className="grid gap-1">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-[#34433b] hover:bg-white"
            href={href}
            key={href}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
