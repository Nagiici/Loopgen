import type { ChatMessage, ModelClient, ModelClientConfig } from "./types.js";

export function createModelClient(config: ModelClientConfig): ModelClient {
  return config.adapterId === "ollama" ? new OllamaClient(config) : new OpenAiCompatibleClient(config);
}

abstract class HttpModelClient implements ModelClient {
  constructor(protected readonly config: ModelClientConfig) {}

  abstract chat(messages: ChatMessage[]): Promise<string>;

  protected async post(url: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      throw connectionError(this.config.baseUrl, error);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new Error(`Local model returned HTTP ${response.status} from ${this.config.baseUrl}`);
    }
    return response.json();
  }

  protected authHeader(): Record<string, string> {
    if (!this.config.apiKeyEnv) return {};
    const value = process.env[this.config.apiKeyEnv];
    if (!value) {
      throw new Error(`Environment variable ${this.config.apiKeyEnv} is not set (needed for the local model API key).`);
    }
    return { Authorization: `Bearer ${value}` };
  }
}

class OllamaClient extends HttpModelClient {
  async chat(messages: ChatMessage[]): Promise<string> {
    const json = (await this.post(
      `${trimSlash(this.config.baseUrl)}/api/chat`,
      { model: this.config.model, stream: false, format: "json", messages },
      {}
    )) as { message?: { content?: string } };
    return json.message?.content ?? "";
  }
}

class OpenAiCompatibleClient extends HttpModelClient {
  async chat(messages: ChatMessage[]): Promise<string> {
    const json = (await this.post(
      `${trimSlash(this.config.baseUrl)}/chat/completions`,
      { model: this.config.model, messages, response_format: { type: "json_object" } },
      this.authHeader()
    )) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? "";
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function connectionError(baseUrl: string, error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);
  if (/abort/i.test(reason)) {
    return new Error(`Local model request to ${baseUrl} timed out.`);
  }
  return new Error(`Could not reach the local model at ${baseUrl} (is Ollama or your server running?).`);
}
