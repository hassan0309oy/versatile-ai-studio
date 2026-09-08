import { useChat } from "@ai-sdk/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowUp,
  CheckCircle2,
  Circle,
  Clock,
  Code2,
  FileText,
  Globe,
  Image as ImageIcon,
  Link2,
  ListChecks,
  Loader2,
  Mic,
  Monitor,
  Music,
  Paperclip,
  Presentation,
  Brain,
  Sparkles,
  Square,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Markdown } from "@/components/deerflow/Markdown";
import { CodeOutput, isFailure, MediaResult, ToolError } from "@/components/deerflow/MediaResult";
import { ChartResult, type ChartData } from "@/components/deerflow/ChartResult";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DeerFlow — Super-agent IA multimédia et recherche" },
      {
        name: "description",
        content:
          "DeerFlow : agent IA autonome qui planifie, cherche sur le web, exécute du code et produit images, vidéos, podcasts et PowerPoint téléchargeables.",
      },
      { property: "og:title", content: "DeerFlow — Super-agent IA multimédia" },
      {
        property: "og:description",
        content:
          "Planification, recherche web, sandbox, images, vidéos, podcasts et PowerPoint produits par un agent IA autonome.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});

const MODELS = [
  { id: "google/gemini-3.7-flash", label: "Gemini 3.7 Flash — rapide" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro — raisonnement" },
  { id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra — équilibré" },
  { id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol — le plus puissant" },
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite — économique" },
];

const SUGGESTIONS = [
  "Fais une veille sur les agents IA open source et rends-moi un rapport sourcé.",
  "Crée une présentation PowerPoint de 6 slides sur le marché du café en 2026.",
  "Génère une illustration futuriste puis un court podcast à deux voix qui la présente.",
  "Analyse ces chiffres avec du Python et trace le graphique correspondant.",
];

type Artifact = { path: string; language: string; content: string };
type PlanStep = { step: string; done: boolean };
type AppBuild = { name: string; previewUrl: string; files: Array<{ path: string; content: string }> };
type Capability = {
  id: string;
  label: string;
  ready: boolean;
  missing: string[];
  providers?: Array<{ name: string; ready: boolean }>;
};

function Workspace() {
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODELS[0]!.id);
  const [openArtifact, setOpenArtifact] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [caps, setCaps] = useState<Capability[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, stop, error } = useChat({ transport });

  const busy = status === "submitted" || status === "streaming";
  const { artifacts, plan, previewUrl, app } = useMemo(() => collectState(messages), [messages]);
  const current = artifacts.find((a) => a.path === openArtifact) ?? null;
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [openFile, setOpenFile] = useState<string | null>(null);
  const appFile = app?.files.find((f) => f.path === openFile) ?? app?.files[0] ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    fetch("/api/capabilities")
      .then((r) => r.json())
      .then((d: { capabilities?: Capability[] }) => setCaps(d.capabilities ?? []))
      .catch(() => setCaps([]));
  }, []);

  function submit() {
    const text = input.trim();
    if ((!text && !files?.length) || busy) return;
    setInput("");
    const attached = files;
    setFiles(null);
    if (fileRef.current) fileRef.current.value = "";
    void sendMessage(
      attached && attached.length > 0 ? { text, files: attached } : { text },
      { body: { model } },
    );
  }

  return (
    <div className="dark flex h-[100dvh] flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-semibold">DeerFlow</h1>
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              Recherche, médias, code et livrables
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="max-w-[10rem] rounded-md border border-border bg-card px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring sm:max-w-none"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <Link
            to="/settings"
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-accent"
          >
            Réglages
          </Link>

          <button
            onClick={() => setPanel((v) => !v)}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs lg:hidden"
          >
            Panneau
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto w-full max-w-3xl space-y-6">
              {messages.length === 0 && (
                <div className="space-y-6 pt-6 text-center sm:pt-10">
                  <h2 className="text-2xl font-semibold">Que voulez-vous accomplir&nbsp;?</h2>
                  <p className="text-sm text-muted-foreground">
                    DeerFlow planifie la mission, cherche sur le web, exécute du code et produit de vrais
                    fichiers : images, vidéos, podcasts, PowerPoint.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="rounded-xl border border-border bg-card p-3 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <MessageRow key={m.id} message={m} onOpenArtifact={setOpenArtifact} />
              ))}

              {busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> DeerFlow travaille…
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
                  {error.message}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="shrink-0 border-t border-border bg-background px-4 py-3">
            <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-2">
              {files && files.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1.5 px-1">
                  {Array.from(files).map((f) => (
                    <span
                      key={f.name}
                      className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {f.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,text/*"
                  className="hidden"
                  onChange={(e) => setFiles(e.target.files)}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
                  aria-label="Joindre un fichier"
                >
                  <Paperclip className="size-4" />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  rows={1}
                  placeholder="Décrivez votre mission…"
                  className="max-h-40 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground"
                />
                {busy ? (
                  <button
                    onClick={() => void stop()}
                    className="flex size-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"
                    aria-label="Arrêter"
                  >
                    <Square className="size-4" />
                  </button>
                ) : (
                  <button
                    onClick={submit}
                    disabled={!input.trim() && !files?.length}
                    className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                    aria-label="Envoyer"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>

        <aside
          className={`${panel ? "fixed inset-y-0 right-0 z-40 flex w-80 max-w-[85vw]" : "hidden"} shrink-0 flex-col gap-5 overflow-y-auto border-l border-border bg-sidebar p-4 lg:static lg:flex lg:w-80`}
        >
          <button
            onClick={() => setPanel(false)}
            className="self-end text-muted-foreground lg:hidden"
            aria-label="Fermer le panneau"
          >
            <X className="size-4" />
          </button>

          {previewUrl && (
            <section>
              <SectionTitle icon={<Monitor className="size-3.5" />}>Aperçu en direct</SectionTitle>
              <iframe
                src={previewUrl}
                title="Aperçu en direct"
                className="h-56 w-full rounded-lg border border-border bg-white"
              />
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate text-[11px] text-primary hover:underline"
              >
                {previewUrl}
              </a>
            </section>
          )}

          <section>
            <SectionTitle icon={<ListChecks className="size-3.5" />}>Plan</SectionTitle>
            {plan.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun plan pour l'instant.</p>
            ) : (
              <ul className="space-y-1.5">
                {plan.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    {s.done ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    ) : (
                      <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.step}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionTitle icon={<FileText className="size-3.5" />}>Artifacts</SectionTitle>
            {artifacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Les fichiers produits apparaîtront ici.</p>
            ) : (
              <ul className="space-y-1.5">
                {artifacts.map((a) => (
                  <li key={a.path}>
                    <button
                      onClick={() => setOpenArtifact(a.path)}
                      className="w-full truncate rounded-md border border-border bg-card px-2.5 py-2 text-left text-xs hover:border-primary/50"
                    >
                      {a.path}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionTitle icon={<Sparkles className="size-3.5" />}>Capacités</SectionTitle>
            <ul className="space-y-1.5">
              {caps.map((c) => (
                <li key={c.id} className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span>{c.label}</span>
                    <span className={c.ready ? "text-primary" : "text-muted-foreground"}>
                      {c.ready ? "prêt" : "clé manquante"}
                    </span>
                  </div>
                  {!c.ready && c.missing.length > 0 && (
                    <p className="mt-0.5 text-muted-foreground">Manque : {c.missing.join(", ")}</p>
                  )}
                  {c.providers && (
                    <p className="mt-0.5 text-muted-foreground">
                      {c.providers.map((p) => `${p.ready ? "✓" : "✕"} ${p.name}`).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6">
          <div className="flex h-full max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="truncate text-sm font-medium">{current.path}</span>
              <div className="flex items-center gap-3">
                <a
                  href={`data:text/plain;charset=utf-8,${encodeURIComponent(current.content)}`}
                  download={current.path.split("/").pop() ?? "fichier.txt"}
                  className="text-xs text-primary hover:underline"
                >
                  Télécharger
                </a>
                <button onClick={() => setOpenArtifact(null)} aria-label="Fermer">
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {current.language === "html" ? (
                <iframe
                  title={current.path}
                  srcDoc={current.content}
                  className="h-full min-h-80 w-full rounded-lg border border-border bg-white"
                />
              ) : current.language === "markdown" ? (
                <Markdown>{current.content}</Markdown>
              ) : (
                <pre className="text-xs whitespace-pre-wrap">{current.content}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {icon}
      {children}
    </h3>
  );
}

const TOOL_LABELS: Record<string, { icon: React.ReactNode; label: string; field?: string }> = {
  "tool-web_search": { icon: <Globe className="size-3.5" />, label: "Recherche web", field: "query" },
  "tool-fetch_url": { icon: <Link2 className="size-3.5" />, label: "Lecture", field: "url" },
  "tool-browse_web": { icon: <Globe className="size-3.5" />, label: "Navigateur", field: "url" },
  "tool-make_plan": { icon: <ListChecks className="size-3.5" />, label: "Plan", field: "title" },
  "tool-generate_image": { icon: <ImageIcon className="size-3.5" />, label: "Image", field: "prompt" },
  "tool-generate_video": { icon: <Video className="size-3.5" />, label: "Vidéo", field: "prompt" },
  "tool-generate_music": { icon: <Music className="size-3.5" />, label: "Musique", field: "prompt" },
  "tool-text_to_speech": { icon: <Mic className="size-3.5" />, label: "Voix", field: "text" },
  "tool-create_podcast": { icon: <Mic className="size-3.5" />, label: "Podcast", field: "title" },
  "tool-create_presentation": {
    icon: <Presentation className="size-3.5" />,
    label: "PowerPoint",
    field: "title",
  },
  "tool-run_code": { icon: <Code2 className="size-3.5" />, label: "Exécution de code" },
  "tool-live_preview": { icon: <Monitor className="size-3.5" />, label: "Aperçu en direct" },
  "tool-remember": { icon: <Brain className="size-3.5" />, label: "Mémorisation", field: "content" },
  "tool-recall": { icon: <Brain className="size-3.5" />, label: "Rappel mémoire", field: "query" },
  "tool-schedule_task": { icon: <Clock className="size-3.5" />, label: "Tâche programmée", field: "title" },
  "tool-list_tasks": { icon: <Clock className="size-3.5" />, label: "Tâches programmées" },
};

function MessageRow({
  message,
  onOpenArtifact,
}: {
  message: UIMessage;
  onOpenArtifact: (path: string) => void;
}) {
  if (message.role === "user") {
    const text = message.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();
    const attachments = message.parts.filter((p) => p.type === "file") as Array<{
      type: "file";
      url: string;
      mediaType: string;
      filename?: string;
    }>;
    return (
      <div className="flex flex-col items-end gap-1.5">
        {attachments.map((f, i) =>
          f.mediaType?.startsWith("image/") ? (
            <img key={i} src={f.url} alt={f.filename ?? "pièce jointe"} className="max-w-[60%] rounded-xl" />
          ) : (
            <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
              {f.filename ?? "fichier"}
            </span>
          ),
        )}
        {text && (
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
            {text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {message.parts.map((part, i) => {
        if (part.type === "text") return <Markdown key={i}>{part.text}</Markdown>;

        if (part.type === "tool-write_artifact") {
          const p = part.input as { path?: string } | undefined;
          return (
            <button
              key={i}
              onClick={() => p?.path && onOpenArtifact(p.path)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs hover:border-primary/50"
            >
              <FileText className="size-3.5 text-primary" />
              {p?.path ?? "fichier"}
            </button>
          );
        }

        const meta = TOOL_LABELS[part.type];
        if (!meta) return null;

        const tp = part as unknown as {
          state?: string;
          input?: Record<string, unknown>;
          output?: Record<string, unknown>;
        };
        const detail = meta.field ? String(tp.input?.[meta.field] ?? "") : "";
        const running = tp.state !== "output-available" && tp.state !== "output-error";
        const output = tp.output;

        return (
          <div key={i} className="space-y-2">
            <ToolChip
              icon={running ? <Loader2 className="size-3.5 animate-spin" /> : meta.icon}
              label={`${meta.label}${detail ? ` : ${detail.slice(0, 90)}` : ""}${running ? " …" : ""}`}
            />
            {output && isFailure(output) && <ToolError result={output} />}
            {output && !isFailure(output) && part.type === "tool-run_code" && <CodeOutput result={output} />}
            {output && !isFailure(output) && typeof output["url"] === "string" && (
              <MediaResult result={output} />
            )}
            {output && !isFailure(output) && typeof output["previewUrl"] === "string" && (
              <a
                href={output["previewUrl"] as string}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-xs text-primary hover:underline"
              >
                Ouvrir l'aperçu en direct ↗
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ToolChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 truncate rounded-full border border-border bg-muted px-3 py-1 text-[11px] text-muted-foreground">
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function collectState(messages: UIMessage[]) {
  const artifacts: Artifact[] = [];
  let plan: PlanStep[] = [];
  let previewUrl: string | null = null;
  for (const m of messages) {
    for (const part of m.parts) {
      if (part.type === "tool-write_artifact") {
        const input = part.input as Artifact | undefined;
        if (input?.path && typeof input.content === "string") {
          const idx = artifacts.findIndex((a) => a.path === input.path);
          const entry = {
            path: input.path,
            language: input.language ?? "markdown",
            content: input.content,
          };
          if (idx >= 0) artifacts[idx] = entry;
          else artifacts.push(entry);
        }
      }
      if (part.type === "tool-make_plan") {
        const input = part.input as { steps?: PlanStep[] } | undefined;
        if (Array.isArray(input?.steps)) plan = input.steps;
      }
      if (part.type === "tool-live_preview") {
        const out = (part as unknown as { output?: { previewUrl?: string } }).output;
        if (out?.previewUrl) previewUrl = out.previewUrl;
      }
    }
  }
  return { artifacts, plan, previewUrl };
}
