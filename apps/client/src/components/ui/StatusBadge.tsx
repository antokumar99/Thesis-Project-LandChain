const COLORS: Record<string, string> = {
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  PENDING: "bg-amber-100 text-amber-800",
  PROOF_SUBMITTED: "bg-blue-100 text-blue-800",
  REGISTERED: "bg-emerald-100 text-emerald-800",
  VERIFIED: "bg-emerald-100 text-emerald-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  LISTED_FOR_SALE: "bg-indigo-100 text-indigo-800",
  LISTED: "bg-indigo-100 text-indigo-800",
  REJECTED: "bg-red-100 text-red-700",
  FAILED: "bg-red-100 text-red-700",
  DECLINED: "bg-gray-200 text-gray-700",
  CANCELLED: "bg-gray-200 text-gray-700"
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLORS[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
