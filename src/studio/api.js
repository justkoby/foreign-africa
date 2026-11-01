export async function api(path, options = {}) {
  const {body, ...rest} = options;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(path, {credentials: 'same-origin', ...rest, headers: isForm ? rest.headers : {'Content-Type': 'application/json', ...rest.headers}, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data;
}
