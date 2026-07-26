"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Navbar } from "../../../components/common/Navbar";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { api } from "../../../lib/api";
import type { AuthResponse } from "../../../types/auth.types";
import { useAuthStore } from "../../../store/authStore";

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const session = await api<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password")
        })
      });
      setSession(session);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto grid max-w-md gap-5 px-4 py-6">
        <h1 className="text-2xl font-bold">Login</h1>
        <Card>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <Input label="Email" name="email" type="email" />
            <Input label="Password" name="password" type="password" />
            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
            <Button disabled={loading} type="submit">{loading ? "Signing in..." : "Login"}</Button>
          </form>
        </Card>
      </main>
    </>
  );
}
