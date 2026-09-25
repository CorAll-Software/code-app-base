import { LOCAL_STORAGE_KEYS } from './constants';
import { reportarErrorApi } from './sentry';

const api = window._routeApi;

/**
 * Forma estándar de respuesta paginada del backend.
 * La devuelven los procedimientos que usan paginación de servidor
 * (ej. maestros.get_comerciantes) → { data, total, page, page_size }.
 */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}

interface OptionsExtraRequest {
  msgSuccess?: string;
  msgError?: string;
  hideNotification?: boolean;
  params?: any;
  headers?: Record<string, string>;
}

const eventLogout = new Event("logout");

/** Se emite tras renovar la sesión, con el usuario fresco que devuelve el backend. */
export const SESSION_REFRESHED_EVENT = "session-refreshed";

export const getToken = () => {
  const token = localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN) || "";
  if (!token) {
    window.dispatchEvent(eventLogout);
  }
  return token;
};

export const getRefreshToken = () =>
  localStorage.getItem(LOCAL_STORAGE_KEYS.REFRESH_TOKEN) || "";

export const storeSession = (token: string, refreshToken?: string) => {
  localStorage.setItem(LOCAL_STORAGE_KEYS.TOKEN, token);
  if (refreshToken) {
    localStorage.setItem(LOCAL_STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  }
};

export const clearSession = () => {
  localStorage.removeItem(LOCAL_STORAGE_KEYS.TOKEN);
  localStorage.removeItem(LOCAL_STORAGE_KEYS.REFRESH_TOKEN);
};

export const handle401 = (res: Response) => {
  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(eventLogout);
  }
};

/*
  Renovación transparente del access token.

  El access token dura minutos; cuando vence, el backend responde 401 y aquí se
  canjea el refresh token por uno nuevo y se reintenta la petición UNA vez. El
  usuario no ve nada. `refreshInFlight` garantiza que N peticiones en paralelo
  compartan una sola renovación: el refresh es rotativo y dos canjes simultáneos
  del mismo token dispararían la detección de reuso en el backend.
*/
let refreshInFlight: Promise<boolean> | null = null;

const doRefresh = async (): Promise<boolean> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${api}auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const json = await res.json();
    if (!json?.token) return false;

    storeSession(json.token, json.refreshToken);
    window.dispatchEvent(new CustomEvent(SESSION_REFRESHED_EVENT, { detail: json }));
    return true;
  } catch {
    return false;
  }
};

export const refreshSession = (): Promise<boolean> => {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

/* ─── Núcleo de las peticiones ──────────────────────────────────────────────
   Todos los verbos comparten este helper: inyecta el token, renueva la sesión
   ante un 401, muestra los toasts y normaliza los errores. */

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const buildUrl = (url: string, params?: any) => {
  const uri = new URL(api + url);
  if (params) {
    Object.keys(params)
      .filter((key) => params[key] !== undefined && params[key] !== null)
      .forEach((key) => {
        const value = params[key];
        if (Array.isArray(value)) {
          value.forEach((v) => { uri.searchParams.append(key, String(v)); });
        } else {
          uri.searchParams.append(key, value);
        }
      });
  }
  return uri;
};

interface RequestConfig {
  method: Method;
  url: string;
  options?: OptionsExtraRequest;
  /** Los params van en la query en vez del body (GET y DELETE). */
  paramsInQuery?: boolean;
  /** El body es un FormData: el navegador pone el Content-Type con su boundary. */
  formData?: boolean;
}

const request = async <T>(config: RequestConfig): Promise<T> => {
  const { method, url, options, paramsInQuery, formData } = config;

  const send = (token: string) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    };
    if (!formData && !paramsInQuery) headers["Content-Type"] = "application/json";

    return fetch(paramsInQuery ? buildUrl(url, options?.params) : api + url, {
      method,
      credentials: "include",
      headers,
      body: paramsInQuery
        ? undefined
        : formData
          ? options?.params
          : JSON.stringify(options?.params || {}),
    });
  };

  const notifyError = (message: string) => {
    if (!options?.hideNotification) window.messageApi?.error(message);
  };

  try {
    let res = await send(getToken());

    // Access token vencido: renovar y reintentar una sola vez.
    if (res.status === 401 && (await refreshSession())) {
      res = await send(localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN) || "");
    }

    handle401(res);

    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (parseError) {
      // El servidor contestó algo que no es JSON: una pasarela devolviendo
      // HTML, un proxy mal configurado, una respuesta truncada. Eso sí es un
      // defecto, y sin esto se confundiría con un fallo de red en el catch.
      reportarErrorApi(parseError, { endpoint: url, metodo: method, status: res.status });
      notifyError(options?.msgError || "Respuesta inesperada del servidor");
      return Promise.reject(parseError);
    }

    if (!res.ok) {
      // Si no llega un mensaje del servidor, usar el mensaje genérico
      const errorMessage =
        json.message ||
        json.error ||
        json.errorMessage ||
        options?.msgError ||
        "Error en la solicitud";
      notifyError(errorMessage);

      /*
        Qué se reporta y qué no.

        Solo los 5xx. Un 4xx es el servidor diciendo que la petición estaba mal
        —validación, permiso denegado, no encontrado, sesión vencida— y eso es
        la aplicación funcionando: si entrara en la bitácora, la llenaría de
        cosas que nadie va a arreglar y dejaríamos de mirarla.

        El cuerpo rechazado se marca SIEMPRE —también en los 5xx— porque viaja
        hasta quien llamó, y si alguien olvida el `.catch` acabaría como
        `unhandledrejection`. La marca hace que `beforeSend` lo descarte: el
        5xx ya lo reportamos aquí arriba con su contexto, y el cuerpo suelto
        solo sería el mismo fallo contado dos veces.
      */
      if (res.status >= 500) {
        reportarErrorApi(
          new Error(`${method} ${url} → ${res.status}: ${errorMessage}`),
          { endpoint: url, metodo: method, status: res.status }
        );
      }

      // Solo si hay dónde colgar la marca: un cuerpo que parsea a texto,
      // número o null no admite propiedades y haría reventar la petición.
      if (json && typeof json === 'object') {
        Object.defineProperty(json, '__esperado', { value: true, enumerable: false });
      }

      return Promise.reject(json as T);
    }

    if (options?.msgSuccess && !options?.hideNotification) {
      window.messageApi?.success(options.msgSuccess);
    }
    return json as T;
  } catch (err: any) {
    // Errores de red (los del servidor y los de parseo ya se trataron arriba).
    // No se reportan a propósito: son la conexión del usuario, no un defecto
    // nuestro, y reportarlos llenaría la bitácora de gente con mala cobertura.
    if (err && (err.message || err.error || err.errorMessage)) return Promise.reject(err);
    notifyError(err?.message || String(err));
    return Promise.reject(err);
  }
};

export const GET = <T>(url: string, options?: OptionsExtraRequest) =>
  request<T>({ method: "GET", url, options, paramsInQuery: true });

export const POST = <T>(url: string, options: OptionsExtraRequest) =>
  request<T>({ method: "POST", url, options });

export const PUT = <T>(url: string, options: OptionsExtraRequest) =>
  request<T>({ method: "PUT", url, options });

export const PATCH = <T>(url: string, options: OptionsExtraRequest) =>
  request<T>({ method: "PATCH", url, options });

export const DELETE = (url: string, options: OptionsExtraRequest) =>
  request<unknown>({ method: "DELETE", url, options, paramsInQuery: true });

export const POSTFormData = <T>(url: string, options: OptionsExtraRequest) =>
  request<T>({ method: "POST", url, options, formData: true });

export const PUTFormData = <T>(url: string, options: OptionsExtraRequest) =>
  request<T>({ method: "PUT", url, options, formData: true });
