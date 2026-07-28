"use client";

import { useState } from "react";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string }) => Promise<string[]>;
    };
  }
}

export function useWallet() {
  const [address, setAddress] = useState("");

  async function connect() {
    if (!window.ethereum) return;
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    setAddress(accounts[0] ?? "");
  }

  return { address, connect };
}
