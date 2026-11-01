// Embeds site content in the HTML shell so the first render already shows it (no flash of old content).
// The JSON is escaped so that nothing inside it can end the script element or start markup.
const separators = new RegExp(`[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, 'g');

export function siteDataScript(data) {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(separators, match => `\\u${match.charCodeAt(0).toString(16)}`);
  return `<script id="fa-site-data" type="application/json">${json}</script>`;
}

export function injectSiteData(html, data) {
  const script = siteDataScript(data);
  return html.includes('</head>') ? html.replace('</head>', () => `${script}</head>`) : `${script}${html}`;
}
