"use client";

import { Navbar } from "../../components/common/Navbar";
import { ProtectedRoute } from "../../components/common/ProtectedRoute";
import { AuthorityDashboard } from "../../components/dashboard/AuthorityDashboard";
import { UserDashboard } from "../../components/dashboard/UserDashboard";
import { useAuth } from "../../hooks/useAuth";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <ProtectedRoute>
      <Navbar />
      <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">
            {user?.role === "AUTHORITY" ? "Authority Dashboard" : `Welcome, ${user?.name ?? "User"}`}
          </h1>
          <p className="mt-1 text-sm text-[#65766b]">
            {user?.role === "AUTHORITY"
              ? "Review registration requests, manage the registry tree, and audit the ledger."
              : "Manage your lands, trade on the marketplace, and settle ownership questions with zero-knowledge proofs."}
          </p>
        </div>
        {user?.role === "AUTHORITY" ? <AuthorityDashboard /> : <UserDashboard />}
      </main>
    </ProtectedRoute>
  );
}
