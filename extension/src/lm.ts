import * as vscode from 'vscode';

export function resolveFamily(): string {
  return vscode.workspace
    .getConfiguration('hacklm-memory')
    .get<string>('lmFamily', 'gpt-5-mini');
}

/**
 * Resolve the configured model family to a chat model instance.
 * Returns null if no matching model is available (Copilot not signed in, etc.).
 */
export async function resolveModel(): Promise<vscode.LanguageModelChat | null> {
  try {
    const models = await vscode.lm.selectChatModels({ family: resolveFamily() });
    return models[0] ?? null;
  } catch {
    return null;
  }
}

export interface SendLmRequestOptions {
  justification: string;
  token?: vscode.CancellationToken;
  timeoutMs?: number;
}

/**
 * Send a request to a language model and stream the full response to a string.
 * - Forwards the cancellation token so users can cancel long calls.
 * - Cleans up the timeout handle via clearTimeout to avoid leaks.
 * - Returns null on any error, timeout, or cancellation (callers fail open).
 */
export async function sendLmRequest(
  model: vscode.LanguageModelChat,
  messages: vscode.LanguageModelChatMessage[],
  options: SendLmRequestOptions
): Promise<string | null> {
  const { justification, token, timeoutMs } = options;

  try {
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const requestPromise = model.sendRequest(messages, { justification }, token);

    const responsePromise = (async (): Promise<string | null> => {
      const response = await requestPromise;
      let result = '';
      for await (const chunk of response.text) {
        if (timedOut) { return null; }
        result += chunk;
      }
      return result;
    })();

    if (!timeoutMs) {
      return await responsePromise;
    }

    const timeoutPromise = new Promise<null>(resolve => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        resolve(null);
      }, timeoutMs);
    });

    const result = await Promise.race([responsePromise, timeoutPromise]);
    clearTimeout(timeoutHandle);
    return result;
  } catch {
    return null;
  }
}
