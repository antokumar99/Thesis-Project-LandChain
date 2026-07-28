"use client";

import Link from "next/link";
import { LogOut, ShieldCheck, UserCircle } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

export function Navbar() {
  const { token, user, logout } = useAuth();

  return (
    <header className="border-b border-[#d8dfda] bg-white">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4">
        <Link className="flex items-center gap-2 text-lg font-bold text-[#17201b]" href="/">
          <ShieldCheck size={24} className="text-[#244b36]" />
          LandChain
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm font-semibold text-[#4d5f55]">
          {token ? (
            <>
              <Link className="rounded-md px-3 py-2 hover:bg-[#eef2ed]" href="/dashboard">
                Dashboard
              </Link>
              <Link className="rounded-md px-3 py-2 hover:bg-[#eef2ed]" href="/lands">
                Lands
              </Link>
              {user?.role === "USER" ? (
                <>
                  <Link className="rounded-md px-3 py-2 hover:bg-[#eef2ed]" href="/lands/request">
                    Register Land
                  </Link>
                  <Link className="rounded-md px-3 py-2 hover:bg-[#eef2ed]" href="/proofs/generate">
                    Generate Proof
                  </Link>
                </>
              ) : null}
              <Link className="rounded-md px-3 py-2 hover:bg-[#eef2ed]" href="/proofs">
                ZK Outputs
              </Link>
              <Link className="rounded-md px-3 py-2 hover:bg-[#eef2ed]" href="/transactions">
                Ledger
              </Link>
              <span className="flex items-center gap-1 rounded-md px-3 py-2 text-[#244b36]">
                <UserCircle size={16} />
                {user?.name ?? user?.role ?? "Account"}
              </span>
              <button className="rounded-md px-3 py-2 hover:bg-[#eef2ed]" onClick={logout} type="button" aria-label="Log out">
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              <Link className="rounded-md px-3 py-2 hover:bg-[#eef2ed]" href="/auth/login">
                Login
              </Link>
              <Link className="rounded-md px-3 py-2 hover:bg-[#eef2ed]" href="/auth/register">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
