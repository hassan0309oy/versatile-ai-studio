import { storeAsset, type StoredAsset } from "./storage.server";
import { httpJson, optionalEnv, withFallback } from "./errors.server";

type Gen = { prompt: string; provider?: string; durationSeconds?: number };

const RUNWAY_VERSION = "2024-11-06";

/** Runway text-to-video (poll jusqu'à obtention du fichier). */
async function runwayVideo({ prompt, durationSeconds }: Gen) {
  const key = optionalEnv("RUNWAY_API_KEY");
  if (!key) throw new Error("RUNWAY_API_KEY absente");
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "X-Runway-Version": RUNWAY_VERSION,
  };

  const task = await httpJson<{ id: string }>("https://api.dev.runwayml.com/v1/text_to_video", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "veo3",
      promptText: prompt,
      ratio: "1280:720",
      duration: durationSeconds ?? 8,
    }),
  });

  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await httpJson<{
      status: string;
      output?: string[];
      failure?: string;
      failureCode?: string;
    }>(`https://api.dev.runwayml.com/v1/tasks/${task.id}`, { headers });
    if (status.status === "SUCCEEDED" && status.output?.[0]) {
      const file = await fetch(status.output[0]);
      if (!file.ok) throw new Error(`Téléchargement de la vidéo échoué [${file.status}]`);
      return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: "video/mp4" };
    }
    if (status.status === "FAILED") {
      throw new Error(`Runway a échoué : ${status.failure ?? status.failureCode ?? "raison inconnue"}`);
    }
  }
  throw new Error("Runway : délai dépassé (plus de 8 minutes)");
}

/** Replicate, si une clé est fournie (fournisseur interchangeable). */
async function replicateVideo({ prompt }: Gen) {
  const key = optionalEnv("REPLICATE_API_TOKEN");
  if (!key) throw new Error("REPLICATE_API_TOKEN absente");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const created = await httpJson<{ id: string }>("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      version: optionalEnv("REPLICATE_VIDEO_MODEL") ?? "minimax/video-01",
      input: { prompt },
    }),
  });
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await httpJson<{ status: string; output?: string | string[]; error?: string }>(
      `https://api.replicate.com/v1/predictions/${created.id}`,
      { headers },
    );
    if (status.status === "succeeded") {
      const url = Array.isArray(status.output) ? status.output[0] : status.output;
      if (!url) throw new Error("Replicate n'a renvoyé aucune vidéo");
      const file = await fetch(url);
      return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: "video/mp4" };
    }
    if (status.status === "failed" || status.status === "canceled") {
      throw new Error(`Replicate a échoué : ${status.error ?? status.status}`);
    }
  }
  throw new Error("Replicate : délai dépassé");
}

const PROVIDERS: Record<string, (g: Gen) => Promise<{ bytes: Uint8Array; mimeType: string }>> = {
  runway: runwayVideo,
  replicate: replicateVideo,
};

export const VIDEO_PROVIDERS = Object.keys(PROVIDERS);

export async function generateVideo(gen: Gen): Promise<StoredAsset> {
  const order = gen.provider && gen.provider !== "auto" ? [gen.provider] : ["runway", "replicate"];
  const result = await withFallback(
    "la génération de vidéo",
    order.filter((n) => PROVIDERS[n]).map((name) => ({ name, run: () => PROVIDERS[name]!(gen) })),
  );
  return storeAsset({
    kind: "video",
    data: result.bytes,
    mimeType: result.mimeType,
    provider: result.provider,
    prompt: gen.prompt,
  });
}
