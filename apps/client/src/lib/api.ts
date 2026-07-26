import { API_URL } from "./constants";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  const isFormData = options?.body instanceof FormData;
  const token = getStoredAuthToken();

  if (!isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.message ?? `Request failed: ${response.status}`);
  return json.data as T;
}

/** CID recorded when a land request was submitted without a deed document. */
export const EMPTY_DEED_CID = "local-e3b0c44298fc1c14";

/**
 * Open a deed document (PDF/image) in a new tab. Fetched with the auth token
 * and shown via an object URL, since a plain <a href> cannot carry the
 * Authorization header.
 */
export async function openDeed(cid: string): Promise<void> {
  const response = await fetch(`${API_URL}/ipfs/deeds/${cid}`, {
    headers: { Authorization: `Bearer ${getStoredAuthToken()}` }
  });
  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.message ?? `Deed not available (${response.status}).`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    // Popup blocked: fall back to downloading the file.
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "deed";
    anchor.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function getStoredAuthToken(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.sessionStorage.getItem("landchain.auth");
    return raw ? JSON.parse(raw).token ?? "" : "";
  } catch {
    return "";
  }
}
