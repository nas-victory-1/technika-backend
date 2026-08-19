import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Message normalisation
// The mobile app sends messages where content is either a plain string (text
// only) or an array of typed parts using our internal schema:
//   { type: "text",         content: "..." }
//   { type: "image_base64", data: "...", mimeType: "image/jpeg" }
//
// Each provider needs a different wire format, so we normalise per-provider.
// Plain string content is passed through unchanged — both APIs accept it.
// ---------------------------------------------------------------------------

function toOpenAIContent(content) {
    if (typeof content === "string") return content;
    return content.map((part) => {
        if (part.type === "text") {
            return { type: "text", text: part.content };
        }
        return {
            type: "image_url",
            image_url: { url: `data:${part.mimeType};base64,${part.data}` },
        };
    });
}

function toClaudeContent(content) {
    if (typeof content === "string") return content;
    return content.map((part) => {
        if (part.type === "text") {
            return { type: "text", text: part.content };
        }
        return {
            type: "image",
            source: { type: "base64", media_type: part.mimeType, data: part.data },
        };
    });
}

// ---------------------------------------------------------------------------
// Provider implementations
// Each provider exposes call(systemPrompt, messages) and returns a plain
// string. Throw on any failure so the runner falls through to the next.
// ---------------------------------------------------------------------------

const openaiProvider = {
    name: "openai",
    _client: null,
    client() {
        if (!this._client)
            this._client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        return this._client;
    },
    async call(systemPrompt, messages) {
        const normalised = messages.map((m) => ({
            role: m.role,
            content: toOpenAIContent(m.content),
        }));
        const response = await this.client().chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }, ...normalised],
            max_tokens: 1024,
        });
        return response.choices[0].message.content.trim();
    },
};

const claudeProvider = {
    name: "claude",
    _client: null,
    client() {
        if (!this._client)
            this._client = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });
        return this._client;
    },
    async call(systemPrompt, messages) {
        const normalised = messages.map((m) => ({
            role: m.role,
            content: toClaudeContent(m.content),
        }));
        const response = await this.client().messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            system: systemPrompt,
            messages: normalised,
        });
        return response.content[0].text.trim();
    },
};

// Order controls priority: index 0 is primary, rest are fallbacks.
const PROVIDERS = [openaiProvider, claudeProvider];


// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(context = {}, documents = []) {
    const { technicianName = "Technician", task } = context;

    let taskSection = "The technician currently has no active task.";
    if (task) {
        taskSection = `
The technician is currently working on the following task:
- Title: ${task.title}
- Description: ${task.description || "N/A"}
- Priority: ${task.priority}
- Company / Client: ${task.companyName || "N/A"}
- Location: ${task.location?.address || "N/A"}
- Status: ${task.status}
`.trim();
    }

    let ragSection = "";
    if (documents.length > 0) {
        ragSection = `\n\nRelevant reference material:\n${documents.map((d, i) => `[${i + 1}] ${d}`).join("\n")}`;
    }

    return `You are Techi, a specialist AI assistant embedded in the Technika field operations platform. Your only role is to support field technicians with technical problems they encounter on the job.

Strictly limit your responses to:
- Troubleshooting equipment and electrical/mechanical faults
- Step-by-step repair and diagnostic guidance
- Safety procedures relevant to field work
- Interpreting error codes or fault descriptions

Do not answer questions unrelated to technical field work. If asked anything outside this scope, politely redirect the technician to focus on their task.

Technician name: ${technicianName}
${taskSection}${ragSection}

Keep responses concise and practical. The technician is in the field and needs direct, actionable guidance.`;
}

// ---------------------------------------------------------------------------
// Public interface
// messages: { role: "user"|"assistant", content: string | Part[] }[]
// context:  { technicianName, task }
// documents: string[] — RAG chunks, unused until RAG is implemented
// ---------------------------------------------------------------------------

async function chat_with_llm(messages, context = {}, documents = []) {
    const systemPrompt = buildSystemPrompt(context, documents);

    let lastError;
    for (const provider of PROVIDERS) {
        try {
            const reply = await provider.call(systemPrompt, messages);
            return { reply, provider: provider.name };
        } catch (err) {
            console.error(
                `[llmService] Provider "${provider.name}" failed:`,
                err.message,
            );
            lastError = err;
        }
    }

    const error = new Error("All AI providers failed. Please try again later.");
    error.statusCode = 503;
    throw error;
}

export { chat_with_llm };
