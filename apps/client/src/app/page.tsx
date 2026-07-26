import Link from "next/link";
import { BadgeCheck, Fingerprint, KeyRound, MessageSquareLock, Ruler, ShieldCheck } from "lucide-react";
import { Navbar } from "../components/common/Navbar";
import { Footer } from "../components/common/Footer";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

const proofWays = [
  {
    icon: KeyRound,
    title: "1 · Commitment Opening",
    text: "Prove you know the secret behind a land's on-registry Poseidon commitment — without revealing the secret."
  },
  {
    icon: Fingerprint,
    title: "2 · Registry Membership",
    text: "Prove you own SOME land in the official Merkle registry without revealing which one. Emits a nullifier instead of an identity."
  },
  {
    icon: MessageSquareLock,
    title: "3 · Challenge–Response",
    text: "A buyer sends a one-time nonce; the seller binds it into the proof. Replay-proof evidence that the seller is the authentic current owner."
  },
  {
    icon: Ruler,
    title: "4 · Area Range",
    text: "Prove the committed land area is at least a threshold (e.g. ≥ 1000 m²) while keeping the exact area private."
  }
];

const steps = [
  "Register an account with your identity details (NID is stored only as a hash).",
  "Submit a land registration request with your deed and a private owner secret.",
  "The fixed authority reviews your identity and approves — your commitment enters the Poseidon Merkle tree and the root is anchored on Ethereum.",
  "List your land for sale. Buyers challenge you with a one-time nonce.",
  "Answer with a Groth16 zero-knowledge proof. The buyer verifies it cryptographically.",
  "The buyer purchases; the land is instantly re-committed to their new secret."
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8">
        <section className="grid gap-5 rounded-lg border border-[#d8dfda] bg-[#e9efe9] p-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="grid content-center gap-4">
            <p className="text-sm font-bold uppercase tracking-wide text-[#65766b]">
              Privacy-preserving land registry
            </p>
            <h1 className="max-w-2xl text-4xl font-bold text-[#17201b]">LandChain</h1>
            <p className="max-w-2xl text-base leading-7 text-[#34433b]">
              A hybrid smart-contract land registry where ownership lives as Poseidon commitments in a Merkle tree,
              roots are anchored on Ethereum, and every ownership claim is settled with Groth16 zero-knowledge
              proofs — four different ways.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/auth/register">
                <Button icon={<BadgeCheck size={16} />}>Create Account</Button>
              </Link>
              <Link href="/auth/login">
                <Button variant="secondary">Login</Button>
              </Link>
            </div>
          </div>
          <div className="grid min-h-56 place-items-center rounded-lg bg-[#244b36] p-6 text-white">
            <div className="grid gap-3 text-center">
              <ShieldCheck size={56} className="mx-auto" />
              <p className="text-sm font-semibold text-[#dfe9df]">
                Users request. The authority approves. Owners prove. Buyers verify. Secrets never leave their owner.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          <h2 className="text-xl font-bold text-[#17201b]">Four ways zero-knowledge proofs power LandChain</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {proofWays.map(({ icon: Icon, title, text }) => (
              <Card key={title}>
                <Icon className="text-[#244b36]" size={24} />
                <h3 className="mt-3 font-bold text-[#17201b]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#34433b]">{text}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-4">
          <h2 className="text-xl font-bold text-[#17201b]">How it works</h2>
          <Card>
            <ol className="grid gap-3">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-6 text-[#34433b]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#244b36] text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </Card>
        </section>
      </main>
      <Footer />
    </div>
  );
}
