const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4002';

export async function api(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (err) {
    throw new Error('No se pudo conectar con el servidor. Revisa que el backend esté encendido.');
  }

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?expirada=1';
      }
    }
    throw new Error('Tu sesión venció. Inicia sesión de nuevo.');
  }

  if (response.status === 403) {
    throw new Error('No tienes permiso para esta acción.');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message?.toString() ?? 'No se pudo completar la operación');
  }
  return data;
}
