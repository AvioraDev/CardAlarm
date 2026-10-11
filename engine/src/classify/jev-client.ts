/**
 * Minimal client for TypeSafe's System One endpoint (the Jev model).
 *
 * Jev does not generate text. It answers typed questions about a state: a Choice picks one of the options
 * we supply, a Noul returns the probability that a statement is true. Everything it returns is therefore
 * drawn from closed sets defined by our code.
 */

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 8000;
export const MAX_CHOICE_OPTIONS = 255;

export type JevText = string | Record<string, unknown> | unknown[];

export interface ChoiceQuestion {
  type: 'choice';
  instructions: JevText;
  /** Option key -> description, or null when the key is self-explanatory. */
  criteria: Record<string, string | null>;
}

export interface NoulQuestion {
  type: 'noul';
  instructions: JevText;
  criteria?: { true?: string; false?: string };
}

export type JevQuestion = ChoiceQuestion | NoulQuestion;

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

export type JevAnswer = ChoiceAnswer | NoulAnswer;

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

export interface JevClient {
  ask(state: JevText, questions: Record<string, JevQuestion>): Promise<JevResponse>;
}

export class JevError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface JevClientOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 529 || status >= 500;
}

export function createJevClient(options: JevClientOptions = {}): JevClient {
  const apiKey = options.apiKey ?? process.env.TYPESAFE_KEY ?? process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new JevError('TYPESAFE_KEY is required to classify listings with Jev', null);

  // Pin a versioned model with CARDALARM_JEV_MODEL once confidence thresholds are tuned against it.
  const model = options.model ?? process.env.CARDALARM_JEV_MODEL ?? 'jev-latest';
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));

  return {
    async ask(state, questions) {
      const body = JSON.stringify({ model, state, questions });
      let lastError: JevError | null = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const response = await fetchImpl(ENDPOINT, {
            method: 'POST',
            headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
            body,
          });
          if (response.ok) return (await response.json()) as JevResponse;

          const detail = (await response.text()).slice(0, 300);
          lastError = new JevError(`Jev request failed with HTTP ${response.status}: ${detail}`, response.status);
          if (!isRetryable(response.status)) throw lastError;

          const retryAfter = Number(response.headers.get('retry-after'));
          const backoff = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
          if (attempt < MAX_ATTEMPTS) await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff);
        } catch (error) {
          if (error instanceof JevError && (error.status === null || !isRetryable(error.status))) throw error;
          if (!(error instanceof JevError)) {
            lastError = new JevError(`Jev request failed: ${error instanceof Error ? error.message : String(error)}`, null);
            if (attempt < MAX_ATTEMPTS) await sleep(Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempt - 1)));
          }
        }
      }

      throw lastError ?? new JevError('Jev request failed', null);
    },
  };
}

export function choiceAnswer(response: JevResponse, id: string): ChoiceAnswer | null {
  const answer = response.answers[id];
  return answer && answer.type === 'choice' ? answer : null;
}

export function noulAnswer(response: JevResponse, id: string): number | null {
  const answer = response.answers[id];
  return answer && answer.type === 'noul' ? answer.noul : null;
}
