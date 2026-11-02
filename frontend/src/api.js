const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/$/, "")

export async function api(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(typeof options.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...(localStorage.getItem("mesaAuthToken") ? { Authorization: `Bearer ${localStorage.getItem("mesaAuthToken")}` } : {}),
        ...options.headers
      }
    })
  } catch {
    throw new Error(`Não foi possível conectar à API em ${API_BASE}. Confirme se o backend está iniciado.`)
  }

  const text = await response.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `A API respondeu com erro ${response.status}.`)
  }
  return data
}

export { API_BASE }
