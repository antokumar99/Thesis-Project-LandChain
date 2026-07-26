"use client";

import { create } from "zustand";
import type { AuthUser } from "../types/auth.types";

type AuthState = {
  token: string;
  user: AuthUser | null;
  hydrated: boolean;
  hydrate: () => void;
  setSession: (session: { token: string; user: AuthUser }) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: "",
  user: null,
  hydrated: false,
  hydrate: () => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem("landchain.auth");
    if (!raw) {
      set({ hydrated: true });
      return;
    }
    try {
      const session = JSON.parse(raw) as { token: string; user: AuthUser };
      set({ token: session.token, user: session.user, hydrated: true });
    } catch {
      window.sessionStorage.removeItem("landchain.auth");
      set({ token: "", user: null, hydrated: true });
    }
  },
  setSession: (session) => {
    if (typeof window !== "undefined") window.sessionStorage.setItem("landchain.auth", JSON.stringify(session));
    set({ token: session.token, user: session.user, hydrated: true });
  },
  logout: () => {
    if (typeof window !== "undefined") window.sessionStorage.removeItem("landchain.auth");
    set({ token: "", user: null, hydrated: true });
  }
}));
