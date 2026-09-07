import { optionalEnv } from "./errors.server";

/**
 * Lance un modèle Replicate et attend le résultat.
 * Accepte « owner/name » (dernière version publique) ou un hash de version.
 */
export async function replicateRun(
  modelRef: string,
  input: Record<string, unknown>,
  timeoutMs = 8 * 60 * 1000,
): Promise<string> {
  const key = optionalEnv("REPLICATE_API_TOKEN");
  if (!key) throw new Error("REPLICATE_API_TOKEN absente");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const isVersionHash = /^[0-9a-f]{40,}$/i.test(modelRef);
  const [refBeforeColon, versionAfterColon] = modelRef.split(":");
  const url = isVersionHash
    ? "https://api.replicate.com/v1/predictions"
    : `https://api.replicate.com/v1/models/${refBeforeColon}/predictions`;
  const body = isVersionHash
    ? { version: modelRef, input }
    : versionAfterColon
      ? { version: versionAfterColon, input }
      : { input };

  const createRes = await fetch(
    versionAfterColon && !isVersionHash ? "https://api.replicate.com/v1/predictions" : url,
    { method: "POST", headers, body: JSON.stringify(body) },
  );
  const createdText = await createRes.text();
  if (!createRes.ok) throw new Error(`Replicate [${createRes.status}] ${createdText.slice(0, 400)}`);
  const created = JSON.parse(createdText) as { id?: string; detail?: string };
  if (!created.id) throw new Error(created.detail ?? "Replicate a refusé la demande");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${created.id}`, { headers });
    const status = (await res.json()) as {
      status: string;
      output?: string | string[] | { url?: string };
      error?: string;
    };
    if (status.status === "succeeded") {
      const out = status.output;
      const outUrl =
        typeof out === "string"
          ? out
          : Array.isArray(out)
            ? out[0]
            : typeof out === "object" && out
              ? out.url
              : undefined;
      if (!outUrl) throw new Error("Replicate n'a renvoyé aucun fichier");
      return outUrl;
    }
    if (status.status === "failed" || status.status === "canceled") {
      throw new Error(`Replicate a échoué : ${status.error ?? status.status}`);
    }
  }
  throw new Error("Replicate : délai dépassé");
}

export async function downloadBytes(url: string, fallbackMime: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement du fichier échoué [${res.status}]`);
  const mime = res.headers.get("content-type")?.split(";")[0] || fallbackMime;
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: mime };
}
