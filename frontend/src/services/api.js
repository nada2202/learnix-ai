import { readStoredObject } from "./roles";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getAuthToken() {
  try {
    return globalThis.localStorage?.getItem("learnixToken") || "";
  } catch {
    return "";
  }
}

export function setAuthSession(token, user, role) {
  const storage = globalThis.localStorage;
  if (!storage) return;
  if (token) {
    storage.setItem("learnixToken", token);
  }
  const storageKey = role === "teacher" || role === "school_director" || role === "general_admin" || role === "guest_teacher"
    ? "teacherUser"
    : "studentUser";
  storage.removeItem(storageKey === "teacherUser" ? "studentUser" : "teacherUser");
  storage.setItem(storageKey, JSON.stringify(user));
}

export function clearAuthSession() {
  try {
    globalThis.localStorage?.removeItem("learnixToken");
    globalThis.localStorage?.removeItem("teacherUser");
    globalThis.localStorage?.removeItem("studentUser");
  } catch {
    // Ignore storage cleanup failures.
  }
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getAuthToken();

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
  });
  const method = String(options.method || "GET").toUpperCase();
  if (response.ok && ["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    window.dispatchEvent(new CustomEvent("learnix:data-updated", { detail: { path, method } }));
  }
  return response;
}

export function updateStoredUser(user) {
  if (!user) return;
  const role = user.role || user.level;
  const key = role === "teacher" || role === "school_director" || role === "general_admin" || role === "guest_teacher" ? "teacherUser" : "studentUser";
  const current = readStoredObject(key);
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify({ ...current, ...user }));
  } catch {
    // Keep the in-memory UI usable even if storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent("learnix:user-updated", { detail: { user: { ...current, ...user } } }));
}

export async function readApiJson(response, fallbackMessage = "Server error") {
  let data;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    return {
      success: false,
      ...data,
      status: response.status,
      message: data.message || fallbackMessage,
    };
  }

  return data;
}

export function apiErrorMessage(error, t) {
  if (error instanceof TypeError) {
    return t.apiConnectionError || "Cannot connect to the Learnix AI server. Check that Flask is running on http://127.0.0.1:5000.";
  }

  return t.serverError || "Server error";
}

export function frontendUrl(path = "") {
  return `${window.location.origin}${path}`;
}
