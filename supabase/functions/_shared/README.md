```typescript
import { OpenAIJsonClient } from "./openai-json.ts";

const client = new OpenAIJsonClient({
  apiKey: Deno.env.get("OPENAI_API_KEY")!,
});

const text = await client.generateText({
  messages: [
    { role: "system", content: [{ type: "input_text", text: "Be concise." }] },
    {
      role: "user",
      content: [
        { type: "input_text", text: "List 3 risks of prompt injection." },
      ],
    },
  ],
  maxOutputTokens: 512,
});

console.log(text);
```

```typescript
import { OpenAIJsonClient } from "./openai-json.ts";

const client = new OpenAIJsonClient({
  apiKey: Deno.env.get("OPENAI_API_KEY")!, // or process.env in Node
  defaultModel: Deno.env.get("OPENAI_GENERATION_MODEL") ?? "gpt-4o-2024-08-06",
  fallbackModel: Deno.env.get("OPENAI_FIX_MODEL") ?? "gpt-4o-mini-2024-07-18",
  maxOutputTokens: 100_000,
});

type InfographicResponse = { generatedHtml: string };

const schema = {
  type: "object",
  properties: {
    generatedHtml: { type: "string", description: "Complete HTML page" },
  },
  required: ["generatedHtml"],
  additionalProperties: false,
};

const json = await client.generateJSON<InfographicResponse>({
  schemaName: "infographic_html",
  schema,
  strict: true,
  system: [
    "You are an expert infographic & data-visualization designer.",
    "Return ONLY JSON conforming to the schema.",
  ].join("\n"),
  user: `
Create a single, self-contained HTML5 slide about "LLM Safety".
Make it responsive, accessible, and visually polished.
  `.trim(),
});

console.log(json.generatedHtml);
```
