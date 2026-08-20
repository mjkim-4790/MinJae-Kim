// 운영자 REST API 호출 헬퍼. 세션 쿠키를 항상 포함한다.
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { 'Content-Type': 'application/json', ...options.headers },
  });

  const data = await res.json().catch(() => ({ ok: false, error: 'INVALID_RESPONSE' }));
  if (!res.ok || !data.ok) {
    const error = new Error(data.error ?? `HTTP_${res.status}`);
    error.code = data.error ?? `HTTP_${res.status}`;
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: ({ email, password, name, accountType }) =>
    request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, accountType }),
    }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  listEvents: () => request('/events'),
  getEvent: (id) => request(`/events/${id}`),
  createEvent: (formData) => request('/events', { method: 'POST', body: formData }),
  startEvent: (id) => request(`/events/${id}/start`, { method: 'POST' }),
  endEvent: (id) => request(`/events/${id}/end`, { method: 'POST' }),
  assignTeams: (id, teamCount) =>
    request(`/events/${id}/teams/assign`, {
      method: 'POST',
      body: JSON.stringify({ teamCount }),
    }),
};
