import {useEffect, useState} from 'react';

function useGet(url) {
  const [state, setState] = useState({status: 'loading', data: null, error: ''});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();
    setState(current => ({...current, status: 'loading', error: ''}));
    fetch(url, {signal: controller.signal})
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Published content could not be loaded.');
        setState({status: 'ready', data, error: ''});
      })
      .catch(error => {
        if (error.name !== 'AbortError') setState({status: 'error', data: null, error: error.message || 'Published content could not be loaded.'});
      });
    return () => controller.abort();
  }, [url, attempt]);
  return {...state, retry: () => setAttempt(value => value + 1)};
}

export function usePublished(type) {
  const result = useGet(`/api/public/content?type=${encodeURIComponent(type)}&pageSize=100`);
  return {...result, items: result.data?.items ?? []};
}

export function useArticle(type, slug) {
  const result = useGet(slug ? `/api/public/content/${type}/${encodeURIComponent(slug)}` : '');
  return {...result, item: result.data?.item ?? null};
}
