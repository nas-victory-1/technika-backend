import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const openaiProvider = {
    name: "openai",
    _client: null,
    client() {
        if (!this._client)
            this._client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        return this._client;
    },
    async call(systemPrompt, messages) {
        const response = await this.client().chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }, ...messages],
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
        const response = await this.client().messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            system: systemPrompt,
            messages,
        });
        return response.content[0].text.trim();
    },
};

const PROVIDERS = [openaiProvider, claudeProvider];


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

    // All providers exhausted
    const error = new Error("All AI providers failed. Please try again later.");
    error.statusCode = 503;
    throw error;
}

export { chat_with_llm };
