// Client-side API helpers for authenticated requests
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    console.error('[apiFetch] Unauthorized request:', path);
    throw new ApiError('Unauthorized', 401);
  }

  if (!response.ok && response.status !== 400) {
    let errorMessage = 'Request failed';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch (e) {
      // Response body is not JSON
    }
    throw new ApiError(errorMessage, response.status);
  }

  return response;
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const response = await apiFetch(path, { method: 'GET' });
  return response.json();
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const response = await apiFetch(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

export async function apiPut<T = any>(path: string, body?: any): Promise<T> {
  const response = await apiFetch(path, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  const response = await apiFetch(path, { method: 'DELETE' });
  return response.json();
}

export async function apiPatch<T = any>(path: string, body?: any): Promise<T> {
  const response = await apiFetch(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}
