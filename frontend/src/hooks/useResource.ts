import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';

// `externalReloadKey` lets a component outside this hook's owner (e.g. an
// import panel mounted as a sibling modal) force a refresh — without it, a
// mutation done elsewhere in the tree would leave this data stale until the
// consuming view happens to change its own `path`.
export function useResource<T>(path: string | null, externalReloadKey: unknown = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Erreur de chargement');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version, externalReloadKey]);

  return { data, loading, error, refetch };
}
