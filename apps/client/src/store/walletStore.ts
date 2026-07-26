import { create } from "zustand";

type WalletState = {
  address: string;
  setAddress: (address: string) => void;
};

export const useWalletStore = create<WalletState>((set) => ({
  address: "",
  setAddress: (address) => set({ address })
}));
