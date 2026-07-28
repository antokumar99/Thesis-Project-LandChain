import { shortAddress } from "../../lib/utils";

export function WalletInfo({ address }: { address?: string }) {
  return <p className="text-sm font-semibold text-[#4d5f55]">{address ? shortAddress(address) : "No wallet connected"}</p>;
}
