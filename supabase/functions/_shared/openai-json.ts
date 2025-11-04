// Lightweight OpenAI Responses client with schema-first JSON handling.
// Works in Deno or Node (ESM). No external dependencies.

export type MessageRole = 'system' | 'user' | 'assistant';

export type InputContent =
  | { type: 'input_text'; text: string }
  // Future-extend here (images, tools, etc.)
  ;

export interface Message {
  role: MessageRole;
  content: InputContent[];
}

export type JsonSchemaFormat = {
  type: 'json_schema';
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
};

export type JsonObjectFormat = {
  type: 'json_object';
};

export type TextFormat = {
  format: JsonSchemaFormat | JsonObjectFormat;
};

export interface ResponsesRequest {
  model: string;
  input: Message[];
  max_output_tokens?: number;
  text?: TextFormat;
  // Allow passing optional tools or future fields without tight typing
  tools?: Array<Record<string, unknown>>;
}

export interface OpenAIResponsePayload extends Record<string, unknown> {
  status?: string; // e.g., "incomplete"
  incomplete_details?: { reason?: string; [k: string]: unknown };
  output_text?: string | string[];
  output?: Array<Record<string, unknown>>;
  choices?: Array<Record<string, unknown>>;
  refusal?: Record<string, unknown>;
  error?: { message?: string; [k: string]: unknown };
}

/** ———————————————————————————————————————————————————————— */
/** Utilities                                                         */
/** ———————————————————————————————————————————————————————— */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const extractResponseText = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null;

  // 1) New Responses "output_text"
  const ot = payload.output_text;
  if (typeof ot === 'string' && ot.trim()) return ot;
  if (Array.isArray(ot)) {
    for (const s of ot) if (typeof s === 'string' && s.trim()) return s;
  }

  // 2) New Responses "output[].content[].text"
  const output = payload.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!isRecord(item)) continue;
      const content = item.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (isRecord(part) && typeof part.text === 'string' && part.text.trim()) {
            return part.text;
          }
        }
      }
    }
  }

  // 3) Legacy "choices[0].message.content"
  const choices = payload.choices;
  if (Array.isArray(choices) && choices.length > 0 && isRecord(choices[0])) {
    const msg = (choices[0] as Record<string, unknown>).message;
    if (isRecord(msg) && typeof msg.content === 'string' && msg.content.trim()) {
      return msg.content;
    }
  }
  return null;
};

const extractRefusal = (payload: unknown): Record<string, unknown> | null => {
  if (!isRecord(payload)) return null;

  // Scan Responses "output[..]" trees for a refusal-like object.
  const inspect = (entry: unknown): Record<string, unknown> | null => {
    if (!isRecord(entry)) return null;
    if (
      entry.type === 'refusal' ||
      entry.reason === 'refusal' ||
      typeof entry.refusal === 'string'
    ) {
      return entry;
    }
    return null;
  };

  const output = payload.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const d = inspect(item);
      if (d) return d;
      if (isRecord(item) && Array.isArray(item.content)) {
        for (const part of item.content) {
          const nd = inspect(part);
          if (nd) return nd;
        }
      }
    }
  }

  // Top-level refusal
  if ('refusal' in payload && isRecord(payload.refusal)) return payload.refusal;
  return null;
};

/** ———————————————————————————————————————————————————————— */
/** Client                                                           */
/** ———————————————————————————————————————————————————————— */

export type OpenAIJsonClientOptions = {
  apiKey: string;
  baseUrl?: string; // default https://api.openai.com/v1
  defaultModel?: string; // e.g. 'gpt-4o-2024-08-06'
  fallbackModel?: string; // e.g. 'gpt-4o-mini-2024-07-18'
  maxOutputTokens?: number;
};

export class OpenAIJsonClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private fallbackModel: string | undefined;
  private defaultMaxTokens: number | undefined;

  constructor(opts: OpenAIJsonClientOptions) {
    if (!opts?.apiKey) throw new Error('OpenAI apiKey is required');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.defaultModel = opts.defaultModel ?? 'gpt-4o-2024-08-06';
    this.fallbackModel = opts.fallbackModel ?? 'gpt-4o-mini-2024-07-18';
    this.defaultMaxTokens = opts.maxOutputTokens;
  }

  /** Low-level call to /responses with raw body. Throws on non-2xx or non-JSON. */
  async callResponses(body: ResponsesRequest): Promise<OpenAIResponsePayload> {
    const res = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    if (!res.ok) {
      try {
        const parsed = JSON.parse(raw);
        if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === 'string') {
          throw new Error(`OpenAI API error (${res.status}): ${parsed.error.message}`);
        }
      } catch { /* ignore */ }
      throw new Error(`OpenAI API error (${res.status}): ${raw}`);
    }

    try {
      const parsed = JSON.parse(raw);
      if (!isRecord(parsed)) throw new Error('OpenAI API returned non-object JSON');
      return parsed as OpenAIResponsePayload;
    } catch {
      throw new Error('OpenAI API returned non-JSON payload');
    }
  }

  /** Build a JSON-mode fallback body (json_object) when json_schema is rejected by a model. */
  private buildJsonModeFallback(primary: ResponsesRequest): ResponsesRequest {
    const { text: _ignored, ...rest } = primary;
    return {
      ...rest,
      text: { format: { type: 'json_object' } },
    };
  }

  /** Heuristic check if error indicates schema mode unsupported. */
  private looksLikeSchemaUnsupported(errMsg: string) {
    const msg = errMsg.toLowerCase();
    return msg.includes('json_schema') || (msg.includes('schema') && (msg.includes('unsupported') || msg.includes('not supported')));
  }

  /** Call /responses and, on schema rejection, retry once in JSON mode. */
  private async callWithFallback(body: ResponsesRequest) {
    try {
      return await this.callResponses(body);
    } catch (e) {
      const msg = e instanceof Error ? String(e.message || '') : '';
      if (this.looksLikeSchemaUnsupported(msg)) {
        const fb = this.buildJsonModeFallback(body);
        return await this.callResponses(fb);
      }
      throw e;
    }
  }

  /** High-level: get **structured JSON** according to your JSON Schema. */
  async generateJSON<T = unknown>(args: {
    model?: string;
    system?: string;
    user: string;
    schemaName: string;
    schema: Record<string, unknown>;
    strict?: boolean; // default true
    maxOutputTokens?: number;
    // optional assistant turns / multi-turn
    messages?: Omit<Message, 'role'>[]; // additional content blocks merged after system/user
    // optional tools passthrough (e.g., web_search)
    tools?: Array<Record<string, unknown>>;
  }): Promise<T> {
    const {
      model = this.defaultModel,
      system,
      user,
      schemaName,
      schema,
      strict = true,
      maxOutputTokens = this.defaultMaxTokens,
      messages = [],
      tools,
    } = args;

    const input: Message[] = [];

    if (system) {
      input.push({ role: 'system', content: [{ type: 'input_text', text: system }] });
    }

    input.push({ role: 'user', content: [{ type: 'input_text', text: user }] });

    // Optional extra blocks (e.g., previous HTML, hints). They’ll be appended as assistant messages.
    for (const block of messages) {
      input.push({ role: 'assistant', content: block.content as InputContent[] });
    }

    const body: ResponsesRequest = {
      model,
      input,
      ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
      text: {
        format: {
          type: 'json_schema',
          name: schemaName,
          strict,
          schema,
        },
      },
      ...(tools ? { tools } : {}),
    };

    const payload = await this.callWithFallback(body);

    if (payload?.status === 'incomplete') {
      const reason = payload?.incomplete_details?.reason ?? 'unknown';
      throw new Error(`OpenAI response incomplete: ${reason}`);
    }

    const refusal = extractRefusal(payload);
    if (refusal) throw new Error(`OpenAI refused the request: ${JSON.stringify(refusal)}`);

    const text = extractResponseText(payload);
    if (!text) throw new Error('No response content returned by OpenAI');

    // When JSON mode fallback kicked in, model may return a JSON object as text.
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(`Model did not return JSON-parsable text: ${String(e)}`);
    }
    return parsed as T;
  }

  /** High-level: get **plain text** completion. Useful for prompts without schema. */
  async generateText(args: {
    model?: string;
    messages: Message[];
    maxOutputTokens?: number;
  }): Promise<string> {
    const { model = this.defaultModel, messages, maxOutputTokens = this.defaultMaxTokens } = args;

    const body: ResponsesRequest = {
      model,
      input: messages,
      ...(maxOutputTokens ? { max_output_tokens: maxOutput_tokensToInt(maxOutputTokens) } : {}),
    };

    const payload = await this.callResponses(body);

    if (payload?.status === 'incomplete') {
      const reason = payload?.incomplete_details?.reason ?? 'unknown';
      throw new Error(`OpenAI response incomplete: ${reason}`);
    }

    const refusal = extractRefusal(payload);
    if (refusal) throw new Error(`OpenAI refused the request: ${JSON.stringify(refusal)}`);

    const text = extractResponseText(payload);
    if (!text) throw new Error('No response content returned by OpenAI');
    return text;
  }
}

function maxOutput_tokensToInt(v?: number) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : undefined;
}
