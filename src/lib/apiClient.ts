type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export async function apiRequest<T>(path: string, options?: { method?: string; body?: JsonValue }): Promise<T> {
  const response = await fetch(path, {
    method: options?.method ?? 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function safeReadError(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { error?: string };
    return data?.error ?? null;
  } catch {
    return null;
  }
}
