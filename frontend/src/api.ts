export interface LoginResponse {
  token: string;
  user: {
    id: string;
    tenantId: string;
    username: string;
    name: string;
    role: string;
  };
  tenant: {
    id: string;
    name: string;
    timezone: string;
  };
}

let activeToken = 'token-acme-alice-123';
let activeBaseUrl = '';

export function setApiToken(token: string): void {
  activeToken = token;
}

export function getApiToken(): string {
  return activeToken;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (activeToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${activeToken}`);
  }

  const response = await fetch(`${activeBaseUrl}${endpoint}`, {
    ...options,
    headers
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMsg = (isJson && data?.error) ? data.error : `Request failed with status ${response.status}`;
    const error: any = new Error(errorMsg);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  setApiToken(res.token);
  return res;
}

export async function getLeads(q?: string) {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiRequest<{ leads: any[] }>(`/api/leads${query}`);
}

export async function getLead(id: string) {
  return apiRequest<{ lead: any }>(`/api/leads/${id}`);
}

export async function getContacts(q?: string) {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiRequest<{ contacts: any[] }>(`/api/contacts${query}`);
}

export async function getContact(id: string) {
  return apiRequest<{ contact: any }>(`/api/contacts/${id}`);
}

export async function getTimeline(type: 'lead' | 'contact', id: string, limit = 100, offset = 0) {
  const path = type === 'lead' ? `/api/leads/${id}/timeline` : `/api/contacts/${id}/timeline`;
  return apiRequest<{ total: number; limit: number; offset: number; events: any[] }>(
    `${path}?limit=${limit}&offset=${offset}&order=asc`
  );
}

export async function importWhatsAppChat(
  type: 'lead' | 'contact',
  id: string,
  file: File | Blob,
  dateFormat: string,
  timezone: string
) {
  const formData = new FormData();
  formData.append('file', file, (file as File).name || 'export.txt');
  formData.append('dateFormat', dateFormat);
  formData.append('timezone', timezone);
  formData.append('destinationType', type);
  formData.append('destinationId', id);

  const path = type === 'lead' ? `/api/leads/${id}/whatsapp-import` : `/api/contacts/${id}/whatsapp-import`;

  return apiRequest<any>(path, {
    method: 'POST',
    body: formData
  });
}

