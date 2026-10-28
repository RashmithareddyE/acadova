// Framework-agnostic API client. It only uses fetch, so the same module can be
// reused by the React Native app later (which would pass a Bearer token instead
// of relying on the browser's httpOnly cookie).
const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, errors = {} } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors; // field-level messages, e.g. { email: '...' }
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      // Sends and receives the httpOnly auth cookie.
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the Acadova server. Check your connection and try again.');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON response; handled below.
  }

  if (!response.ok) {
    throw new ApiError(data?.message || 'Something went wrong. Please try again.', {
      status: response.status,
      errors: data?.errors,
    });
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  put: (path, body) => request(path, { method: 'PUT', body: body ?? {} }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export const academicApi = {
  list: (resource) => api.get(`/academic/${resource}`),
  create: (resource, values) => api.post(`/academic/${resource}`, values),
  update: (resource, id, values) => api.put(`/academic/${resource}/${id}`, values),
  remove: (resource, id) => api.delete(`/academic/${resource}/${id}`),
};

export const attendanceApi = {
  today: (date) => api.get(`/attendance/today?date=${encodeURIComponent(date)}`),
  summary: () => api.get('/attendance/summary'),
  target: () => api.get('/attendance/target'),
  setTarget: (target) => api.put('/attendance/target', { target }),
  schedule: (from, days = 1) => api.get(`/attendance/schedule?from=${encodeURIComponent(from)}&days=${days}`),
  records: (date) => api.get(`/attendance/records?date=${encodeURIComponent(date)}`),
  setIntention: (timetableEntry, date, intention) => api.put('/attendance/intentions', { timetableEntry, date, intention }),
  removeIntention: (id) => api.delete(`/attendance/intentions/${encodeURIComponent(id)}`),
  create: (values) => api.post('/attendance/records', values),
  update: (id, values) => api.put(`/attendance/records/${id}`, values),
  remove: (id) => api.delete(`/attendance/records/${id}`),
  project: (subject, attend, miss) => api.get(`/attendance/projection?subject=${encodeURIComponent(subject)}&attend=${attend}&miss=${miss}`),
};

export const studyPlannerApi = {
  preferences: () => api.get('/study-planner/preferences'),
  savePreferences: (values) => api.put('/study-planner/preferences', values),
  overview: () => api.get('/study-planner/overview'),
  dashboard: () => api.get('/study-planner/dashboard'),
  sessions: () => api.get('/study-planner/sessions'),
  preview: () => api.post('/study-planner/preview', {}),
  generate: (values) => api.post('/study-planner/generate', values),
  updateSession: (id, values) => api.put(`/study-planner/sessions/${id}`, values),
  removeSession: (id) => api.delete(`/study-planner/sessions/${id}`),
};

export const organizerApi = {
  list: (filters = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    const query = params.toString();
    return api.get(`/tasks${query ? `?${query}` : ''}`);
  },
  create: (values) => api.post('/tasks', values),
  update: (id, values) => api.put(`/tasks/${encodeURIComponent(id)}`, values),
  remove: (id) => api.delete(`/tasks/${encodeURIComponent(id)}`),
};

export const copilotApi = {
  ask: (question) => api.post('/copilot/ask', { question }),
};

export const documentImportApi = {
  async preview(kind, file) {
    const extension = file.name.split('.').pop().toLowerCase();
    const mimeByExtension = { pdf: 'application/pdf', csv: 'text/csv', tsv: 'text/tab-separated-values', txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    let response;
    try { response = await fetch(`${BASE_URL}/imports/${kind}/preview`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || mimeByExtension[extension] || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file }); }
    catch { throw new ApiError('Cannot reach the Acadova server. Check your connection and try again.'); }
    let data = null; try { data = await response.json(); } catch {}
    if (!response.ok) throw new ApiError(data?.message || 'The document could not be processed.', { status: response.status, errors: data?.errors });
    return data;
  },
  async previewTimetable(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    const mimeByExtension = { pdf: 'application/pdf', csv: 'text/csv', tsv: 'text/tab-separated-values', txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    let response;
    try {
      response = await fetch(`${BASE_URL}/imports/timetable/preview`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': file.type || mimeByExtension[extension] || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        body: file,
      });
    } catch {
      throw new ApiError('Cannot reach the Acadova server. Check your connection and try again.');
    }
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new ApiError(data?.message || 'The timetable file could not be processed.', { status: response.status, errors: data?.errors });
    return data;
  },
};

export const authApi = {
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};
