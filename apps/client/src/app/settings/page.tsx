import { Navbar } from "../../components/common/Navbar";
import { Card } from "../../components/ui/Card";
import { CHAIN_ID, LAND_REGISTRY_ADDRESS } from "../../lib/constants";

export default function SettingsPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto grid max-w-5xl gap-5 px-4 py-6">
        <h1 className="text-2xl font-bold">Network Settings</h1>
        <Card>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="font-semibold text-[#65766b]">Chain ID</dt>
              <dd>{CHAIN_ID}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#65766b]">LandRegistry</dt>
              <dd className="break-all">{LAND_REGISTRY_ADDRESS || "Not configured"}</dd>
            </div>
          </dl>
        </Card>
      </main>
    </>
  );
}
