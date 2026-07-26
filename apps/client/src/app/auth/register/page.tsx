"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Navbar } from "../../../components/common/Navbar";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { api } from "../../../lib/api";
import { useAuthStore } from "../../../store/authStore";
import type { AuthResponse } from "../../../types/auth.types";

export default function RegisterPage() {
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
      const session = await api<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          walletAddress: form.get("walletAddress"),
          nid: form.get("nid"),
          phone: form.get("phone"),
          address: form.get("address")
        })
      });
      setSession(session);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto grid max-w-md gap-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Create Account</h1>
          <p className="mt-1 text-sm text-[#65766b]">
            Every account is a citizen account. The land registry authority is a fixed, pre-configured account.
          </p>
        </div>
        <Card>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <Input label="Full Name" name="name" required />
            <Input label="Email" name="email" type="email" required />
            <Input label="Password (min 8 chars)" name="password" type="password" minLength={8} required />
            <Input label="Wallet Address" name="walletAddress" placeholder="0x..." required />
            <Input label="National ID (NID)" name="nid" required />
            <p className="-mt-2 text-xs text-[#65766b]">Your NID is hashed before storage — the plain number is never saved.</p>
            <Input label="Phone (optional)" name="phone" />
            <Input label="Address (optional)" name="address" />
            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
            <Button disabled={loading} type="submit">{loading ? "Creating..." : "Register"}</Button>
          </form>
        </Card>
      </main>
    </>
  );
}
