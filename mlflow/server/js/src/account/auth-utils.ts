export const AUTH_HEADER_COOKIE = 'mlflow-request-header-Authorization';
export const MLFLOW_USER_COOKIE = 'mlflow_user';

const AUTH_COOKIE_NAMES = [MLFLOW_USER_COOKIE, AUTH_HEADER_COOKIE];

/**
 * Cookie deletion does an exact path match, so cover root + the app's
 * base path (with and without trailing slash) - otherwise cookies set
 * under a static prefix like ``/mlflow/`` survive a ``path=/`` delete.
 */
export const getAuthCookiePaths = (): string[] => {
  const paths = new Set<string>(['/']);
  const basePath = new URL('.', window.location.href).pathname;
  if (basePath) {
    paths.add(basePath);
    const stripped = basePath.replace(/\/$/, '');
    if (stripped) paths.add(stripped);
  }
  return Array.from(paths);
};

export const clearAuthCookies = () => {
  const expiresAttr = 'expires=Thu, 01 Jan 1970 00:00:00 UTC';
  for (const name of AUTH_COOKIE_NAMES) {
    for (const path of getAuthCookiePaths()) {
      document.cookie = `${name}=; ${expiresAttr}; path=${path};`;
    }
  }
};

/**
 * Basic Auth now keeps a server session (``mlflow_session``) for the browser
 * login page. Logout clears that cookie via ``/logout``, which also overwrites
 * any realm credentials the browser cached from the old native prompt.
 * ``clearAuthCookies`` still drops the dev user-switcher cookies; the session
 * cookie itself is HttpOnly and only the server can expire it.
 */
export const performLogout = (queryClient?: { clear: () => void }) => {
  clearAuthCookies();
  queryClient?.clear();
  const base = new URL('.', window.location.href);
  window.location.assign(new URL('logout', base).toString());
};
