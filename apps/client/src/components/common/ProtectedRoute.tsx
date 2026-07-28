"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, hydrated } = useAuth();

  useEffect(() => {
    if (hydrated && !token) router.replace("/auth/login");
  }, [hydrated, router, token]);

  if (!hydrated) return null;
  if (!token) return null;

  return <>{children}</>;
}
