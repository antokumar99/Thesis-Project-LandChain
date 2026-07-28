"use client";

import { Wallet } from "lucide-react";
import { Button } from "../ui/Button";
import { useWallet } from "../../hooks/useWallet";

export function ConnectWalletButton() {
  const { address, connect } = useWallet();
  return (
    <Button icon={<Wallet size={16} />} onClick={connect} variant={address ? "secondary" : "primary"}>
      {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Connect"}
    </Button>
  );
}
