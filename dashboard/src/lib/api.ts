const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://mc-v3-api.saurabh-198.workers.dev';
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || 'mc-v3-token-2026';

export async function fetchAPI<T = any>(path: string, options?: RequestInit): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    clearTimeout(timeout);
    return res.json();
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      console.error('Request timeout:', path);
      return null;
    }
    throw e;
  }
}
