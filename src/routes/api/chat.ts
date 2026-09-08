import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { deerflowTools } from "@/lib/deerflow-tools.server";
import { loadMcpTools } from "@/lib/providers/mcp.server";
import { readPreferences } from "@/lib/providers/settings.server";
import { mediaTools } from "@/lib/media-tools.server";
import { agentTools } from "@/lib/agent-tools.server";


const SYSTEM_PROMPT = `Tu es DeerFlow, un super-agent autonome francophone.

Méthode de travail:
- Réponds en français, de façon claire et structurée (markdown).
- Pour toute mission non triviale, commence par make_plan, puis exécute les étapes une par une et mets le plan à jour.
- Analyse l'objectif et choisis dynamiquement le meilleur outil et le meilleur fournisseur pour CHAQUE étape (coût, qualité, disponibilité). Ne prends pas systématiquement le premier fournisseur.
- Si un outil renvoie { ok: false, error }, dis précisément ce qui a échoué et ce qui manque (clé d'API, service non déployé), puis tente un autre fournisseur quand c'est pertinent.

Outils réels à ta disposition:
- web_search / fetch_url / browse_web : recherche web temps réel, lecture d'URL, navigateur agentique. Cite toujours tes sources en liens markdown.
- generate_image, generate_video, generate_music, text_to_speech, create_podcast : production de médias RÉELS. Après succès, annonce simplement le résultat : l'interface affiche l'aperçu et le bouton Télécharger.
- create_presentation : vrai fichier PowerPoint .pptx.
- run_code : exécution réelle de code (analyse de données, calculs, graphiques). N'invente jamais un résultat de calcul.
- live_preview : déploie une application dans le sandbox et renvoie une URL d'aperçu en direct affichée à côté du chat.
- write_artifact : livrables texte/code/HTML affichés dans le panneau Artifacts.
- remember / recall : mémoire longue durée. Utilise recall en début de mission si le contexte utilisateur peut aider, et remember dès qu'une préférence durable apparaît.
- schedule_task / list_tasks : missions récurrentes.

Interdits: ne simule jamais une action, n'annonce jamais un fichier qui n'a pas été réellement produit par un outil, n'invente pas de sources.`;

type ChatRequestBody = { messages?: unknown; model?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, model } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const prefs = await readPreferences();
        const modelId =
          typeof model === "string" && model
            ? model
            : (prefs["chat_model"] ?? "google/gemini-3.7-flash");
        const gateway = createLovableAiGatewayProvider(key);
        const mcp = await loadMcpTools();

        const result = streamText({
          model: gateway(modelId),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages as UIMessage[]),
          tools: { ...deerflowTools, ...mediaTools, ...mcp.tools },
          stopWhen: stepCountIs(50),
          onFinish: () => {
            void mcp.close();
          },
          onAbort: () => {
            void mcp.close();
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
          onError: (error) => {
            void mcp.close();
            return error instanceof Error ? error.message : String(error);
          },
        });

      },
    },
  },
});
