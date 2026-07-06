import { LOCAL_STORAGE_KEYS } from './constants';

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

export const getToken = () => {
  const token = localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN) || "";
  if (!token) {
    window.dispatchEvent(eventLogout);
  }
  return token;
};

export const handle401 = (res: Response) => {
  if (res.status === 401) {
    localStorage.removeItem(LOCAL_STORAGE_KEYS.TOKEN);
    window.dispatchEvent(eventLogout);
  }
};

export const GET = <T>(url: string, options?: OptionsExtraRequest) => {
  const params = options?.params || {};
  const token = getToken();

  const uri = new URL(api + url);

  if (params) {
    Object.keys(params)
      .filter((key) => params[key] !== undefined && params[key] !== null)
      .forEach((key) => {
        const value = params[key];
        if (Array.isArray(value)) {
          value.forEach((v) => uri.searchParams.append(key, String(v)));
        } else {
          uri.searchParams.append(key, value);
        }
      });
  }

  return new Promise<T>((resolve, reject) => {
    return fetch(uri, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then(async (res) => {
        handle401(res);
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
          // Si no llega un mensaje del servidor, usar el mensaje genérico
          const errorMessage =
            json.message ||
            json.error ||
            json.errorMessage ||
            options?.msgError ||
            "Error en la solicitud";
          if (!options?.hideNotification) {
            window.messageApi?.error(errorMessage);
          }
          return reject(json);
        }
        if (options?.msgSuccess && !options?.hideNotification) {
          window.messageApi?.success(options.msgSuccess);
        }
        return resolve(json);
      })
      .catch((err) => {
        if (!options?.hideNotification) {
          window.messageApi?.error(err?.message || err);
        }
        return reject(err);
      });
  });
};

export const POST = <T>(url: string, options: OptionsExtraRequest) => {
  const token = getToken();
  return new Promise<T>((resolve, reject) => {
    return fetch(api + url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(options?.params || {}),
    })
      .then(async (res) => {
        handle401(res);
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
          // Si no llega un mensaje del servidor, usar el mensaje genérico
          const errorMessage =
            json.message ||
            json.error ||
            json.errorMessage ||
            options?.msgError ||
            "Error en la solicitud";
          if (!options?.hideNotification) {
            window.messageApi?.error(errorMessage);
          }
          return reject(json as T);
        }
        if (options?.msgSuccess && !options?.hideNotification && window.messageApi) {
          window.messageApi?.success(options.msgSuccess);
        }
        return resolve(json as T);
      })
      .catch((err) => {
        if (!options?.hideNotification) {
          window.messageApi?.error(err?.message || err);
        }
        return reject(err as T);
      });
  });
};

export const PUT = <T>(url: string, options: OptionsExtraRequest) => {
  const token = getToken();
  return new Promise<T>((resolve, reject) => {
    return fetch(api + url, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(options?.params || {}),
    })
      .then(async (res) => {
        handle401(res);
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
          // Si no llega un mensaje del servidor, usar el mensaje genérico
          const errorMessage =
            json.message ||
            json.error ||
            json.errorMessage ||
            options?.msgError ||
            "Error en la solicitud";
          if (!options?.hideNotification) {
            window.messageApi?.error(errorMessage);
          }
          return reject(json as T);
        }
        if (options?.msgSuccess && !options?.hideNotification) {
          window.messageApi?.success(options.msgSuccess);
        }
        return resolve(json as T);
      })
      .catch((err) => {
        window.messageApi?.error(err?.message || err);
        return reject(err);
      });
  });
};

export const PATCH = <T>(url: string, options: OptionsExtraRequest) => {
  const token = getToken();
  return new Promise<T>((resolve, reject) => {
    return fetch(api + url, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(options?.params || {}),
    })
      .then(async (res) => {
        handle401(res);
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
          const errorMessage =
            json.message ||
            json.error ||
            json.errorMessage ||
            options?.msgError ||
            "Error en la solicitud";
          if (!options?.hideNotification) {
            window.messageApi?.error(errorMessage);
          }
          return reject(json as T);
        }
        if (options?.msgSuccess && !options?.hideNotification) {
          window.messageApi?.success(options.msgSuccess);
        }
        return resolve(json as T);
      })
      .catch((err) => {
        window.messageApi?.error(err?.message || err);
        return reject(err);
      });
  });
};

export const DELETE = (url: string, options: OptionsExtraRequest) => {
  const token = getToken();
  const uri = new URL(api + url);
  if (options?.params) {
    Object.keys(options.params)
      .filter(
        (key) =>
          options.params[key] !== undefined && options.params[key] !== null,
      )
      .forEach((key) => uri.searchParams.append(key, options.params[key]));
  }
  return new Promise((resolve, reject) => {
    return fetch(uri, {
      method: "DELETE",
      credentials: "include",
      headers: {
        // 'Content-Type': 'application/json',
        Authorization: "Bearer " + token,
      },
      // body: JSON.stringify(options?.params || {})
    })
      .then(async (res) => {
        handle401(res);
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
          // Si no llega un mensaje del servidor, usar el mensaje genérico
          const errorMessage =
            json.message ||
            json.error ||
            json.errorMessage ||
            options?.msgError ||
            "Error en la solicitud";
          if (!options?.hideNotification) {
            window.messageApi?.error(errorMessage);
          }
          return reject(json);
        }
        if (options?.msgSuccess && !options?.hideNotification) {
          window.messageApi?.success(options.msgSuccess);
        }
        return resolve(json);
      })
      .catch((err) => {
        window.messageApi?.error(err?.message || err);
        return reject(err);
      });
  });
};

export const POSTFormData = <T>(url: string, options: OptionsExtraRequest) => {
  const token = getToken();
  return new Promise<T>((resolve, reject) => {
    return fetch(api + url, {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: "Bearer " + token,
      },
      body: options.params,
    })
      .then(async (res) => {
        handle401(res);
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
          // Si no llega un mensaje del servidor, usar el mensaje genérico
          const errorMessage =
            json.message ||
            json.error ||
            json.errorMessage ||
            options?.msgError ||
            "Error en la solicitud";
          if (!options?.hideNotification) {
            window.messageApi?.error(errorMessage);
          }
          return reject(json);
        }
        if (options?.msgSuccess && !options?.hideNotification) {
          window.messageApi?.success(options.msgSuccess);
        }
        return resolve(json);
      })
      .catch((err) => {
        window.messageApi?.error(err?.message || err);
        return reject(err);
      });
  });
};

export const PUTFormData = <T>(url: string, options: OptionsExtraRequest) => {
  const token = getToken();
  return new Promise<T>((resolve, reject) => {
    return fetch(api + url, {
      method: "PUT",
      credentials: "include",
      headers: {
        Authorization: "Bearer " + token,
      },
      body: options.params,
    })
      .then(async (res) => {
        handle401(res);
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
          const errorMessage =
            json.message ||
            json.error ||
            json.errorMessage ||
            options?.msgError ||
            "Error en la solicitud";
          if (!options?.hideNotification) {
            window.messageApi?.error(errorMessage);
          }
          return reject(json);
        }
        if (options?.msgSuccess && !options?.hideNotification) {
          window.messageApi?.success(options.msgSuccess);
        }
        return resolve(json);
      })
      .catch((err) => {
        window.messageApi?.error(err?.message || err);
        return reject(err);
      });
  });
};
