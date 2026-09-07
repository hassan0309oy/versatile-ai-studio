import { storeAsset, type StoredAsset } from "./storage.server";
import { optionalEnv, withFallback } from "./errors.server";

const ELEVEN_DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"; // Rachel

/** ElevenLabs — synthèse vocale. */
async function elevenTts(text: string, voiceId?: string) {
  const key = optionalEnv("ELEVENLABS_API_KEY");
  if (!key) throw new Error("ELEVENLABS_API_KEY absente");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || ELEVEN_DEFAULT_VOICE}`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.45, similarity_boost: 0.8 },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs [${res.status}] ${(await res.text()).slice(0, 400)}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
}

/** Kokoro — via Hugging Face (hexgrad/Kokoro-82M) ou un serveur auto-hébergé. */
async function kokoroTts(text: string, voiceId?: string) {
  const base = optionalEnv("KOKORO_API_URL");
  if (!base) {
    const token = optionalEnv("HF_TOKEN");
    if (!token) throw new Error("Ni KOKORO_API_URL ni HF_TOKEN ne sont configurées");
    const { InferenceClient } = await import("@huggingface/inference");
    const blob = (await new InferenceClient(token).textToSpeech({
      model: optionalEnv("HF_TTS_MODEL") ?? "hexgrad/Kokoro-82M",
      inputs: text,
    })) as unknown as Blob;
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mimeType: blob.type || "audio/wav",
    };
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/v1/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(optionalEnv("KOKORO_API_KEY") ? { Authorization: `Bearer ${optionalEnv("KOKORO_API_KEY")}` } : {}),
    },
    body: JSON.stringify({ model: "model_q8f16", input: text, voice: voiceId || "af_heart" }),
  });
  if (!res.ok) throw new Error(`Kokoro [${res.status}] ${(await res.text()).slice(0, 300)}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
}


/** Piper (serveur auto-hébergé, URL configurable). */
async function piperTts(text: string, voiceId?: string) {
  const base = optionalEnv("PIPER_API_URL");
  if (!base) throw new Error("PIPER_API_URL absente (serveur Piper non déployé)");
  const res = await fetch(`${base.replace(/\/$/, "")}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: voiceId || "fr_FR-siwis-medium" }),
  });
  if (!res.ok) throw new Error(`Piper [${res.status}] ${(await res.text()).slice(0, 300)}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/wav" };
}

/** Passerelle Lovable AI — voix intégrée, aucune clé fournisseur à saisir. */
async function lovableTts(text: string, voiceId?: string) {
  const key = optionalEnv("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY absente");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: text,
      voice: voiceId && /^[a-z]+$/.test(voiceId) ? voiceId : "alloy",
      response_format: "mp3",
    }),
  });
  if (!res.ok) throw new Error(`Passerelle Lovable [${res.status}] ${(await res.text()).slice(0, 400)}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
}

const TTS: Record<string, (t: string, v?: string) => Promise<{ bytes: Uint8Array; mimeType: string }>> = {
  elevenlabs: elevenTts,
  kokoro: kokoroTts,
  piper: piperTts,
  lovable: lovableTts,
};

const TTS_ORDER = ["elevenlabs", "kokoro", "piper", "lovable"];

export const TTS_PROVIDERS = Object.keys(TTS);


export async function synthesizeSpeech(params: {
  text: string;
  voiceId?: string;
  provider?: string;
}): Promise<StoredAsset> {
  const order =
    params.provider && params.provider !== "auto" ? [params.provider] : TTS_ORDER;
  const result = await withFallback(
    "la synthèse vocale",
    order.filter((n) => TTS[n]).map((name) => ({ name, run: () => TTS[name]!(params.text, params.voiceId) })),
  );
  return storeAsset({
    kind: "audio",
    data: result.bytes,
    mimeType: result.mimeType,
    provider: result.provider,
    prompt: params.text.slice(0, 500),
  });
}

/** Podcast multi-voix : chaque réplique est réellement synthétisée puis assemblée. */
export async function synthesizePodcast(params: {
  title: string;
  segments: Array<{ speaker: string; voiceId?: string; text: string }>;
  provider?: string;
}): Promise<StoredAsset & { segments: number }> {
  if (params.segments.length === 0) throw new Error("Le podcast doit contenir au moins une réplique.");
  const order =
    params.provider && params.provider !== "auto" ? [params.provider] : TTS_ORDER;

  const chunks: Uint8Array[] = [];
  let usedProvider = "";
  let mimeType = "audio/mpeg";
  for (const seg of params.segments) {
    const res = await withFallback(
      `la voix de « ${seg.speaker} »`,
      order.filter((n) => TTS[n]).map((name) => ({ name, run: () => TTS[name]!(seg.text, seg.voiceId) })),
    );
    chunks.push(res.bytes);
    usedProvider = res.provider;
    mimeType = res.mimeType;
  }

  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }

  const asset = await storeAsset({
    kind: "audio",
    data: merged,
    mimeType,
    provider: usedProvider,
    prompt: params.title,
    metadata: { podcast: true, segments: params.segments.length },
  });
  return { ...asset, segments: params.segments.length };
}

/** Musique — Hugging Face (MusicGen / Stable Audio), modèle configurable. */
export async function generateMusic(params: {
  prompt: string;
  provider?: string;
  durationSeconds?: number;
}): Promise<StoredAsset> {
  const hf = async () => {
    const token = optionalEnv("HF_TOKEN");
    if (!token) throw new Error("HF_TOKEN absente");
    const model = optionalEnv("HF_MUSIC_MODEL") ?? "facebook/musicgen-small";
    const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: params.prompt,
        parameters: { duration: params.durationSeconds ?? 15 },
      }),
    });
    if (!res.ok) throw new Error(`Hugging Face [${res.status}] ${(await res.text()).slice(0, 400)}`);
    const type = res.headers.get("content-type") ?? "audio/wav";
    if (type.includes("json")) throw new Error(`Hugging Face : ${(await res.text()).slice(0, 300)}`);
    return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: type.split(";")[0]! };
  };

  const replicate = async () => {
    const key = optionalEnv("REPLICATE_API_TOKEN");
    if (!key) throw new Error("REPLICATE_API_TOKEN absente");
    const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    const created = (await (
      await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          version: optionalEnv("REPLICATE_MUSIC_MODEL") ?? "meta/musicgen",
          input: { prompt: params.prompt, duration: params.durationSeconds ?? 15 },
        }),
      })
    ).json()) as { id?: string; detail?: string };
    if (!created.id) throw new Error(created.detail ?? "Replicate a refusé la demande");
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      const st = (await (
        await fetch(`https://api.replicate.com/v1/predictions/${created.id}`, { headers })
      ).json()) as { status: string; output?: string; error?: string };
      if (st.status === "succeeded" && st.output) {
        const f = await fetch(st.output);
        return { bytes: new Uint8Array(await f.arrayBuffer()), mimeType: "audio/wav" };
      }
      if (st.status === "failed") throw new Error(st.error ?? "échec Replicate");
    }
    throw new Error("Replicate : délai dépassé");
  };

  const map: Record<string, () => Promise<{ bytes: Uint8Array; mimeType: string }>> = {
    huggingface: hf,
    replicate,
  };
  const order = params.provider && params.provider !== "auto" ? [params.provider] : ["huggingface", "replicate"];
  const result = await withFallback(
    "la génération de musique",
    order.filter((n) => map[n]).map((name) => ({ name, run: map[name]! })),
  );
  return storeAsset({
    kind: "audio",
    data: result.bytes,
    mimeType: result.mimeType,
    provider: result.provider,
    prompt: params.prompt,
    metadata: { music: true },
  });
}
