// Server-side Gemini AI editorial assistant service for Foreign Africa CMS.
// Credentials and API key are never exposed to the client.

const SYSTEM_INSTRUCTIONS = `You are the Foreign Africa Editorial Assistant, an expert writing and editorial partner for Foreign Africa (foreignafrica.org).
Foreign Africa is a premier African-led institutional publication and platform connecting enterprise, policy, diplomacy, and economic opportunity across Africa.

EDITORIAL GUIDELINES:
- Voice: Authoritative, objective, nuanced, pan-African, and forward-looking. Suitable for business leaders, policymakers, scholars, and global partners.
- Language: International/British English spelling (e.g. programmes, organisation, labour, centre, dialogue, prioritise).
- Rigour: Ensure all assertions are supported by reason and evidence. Avoid empty buzzwords, hyperbole, or vague generalisations.
- Integrity: Never invent citations, dates, statistics, quotes, or historical facts. If facts or claims are uncertain or unverified, explicitly flag them for human editorial verification.
- Formatting: Return clean text or clean HTML tags (<p>, <strong>, <em>, <ul>, <li>, <blockquote>) suitable for article insertion when generating body content. For metadata (headlines, tags, excerpt), return clean plain text without surrounding quotes.`;

const ACTION_PROMPTS = {
  improve: 'Improve the selected text for clarity, flow, precision, and impact while preserving the core facts, meaning, and voice.',
  shorten: 'Condense the selected text into a tighter, punchier version without losing essential information.',
  expand: 'Expand the selected text with deeper context, analytical nuance, and relevant illustrative detail, maintaining institutional rigor.',
  tone_institutional: 'Rewrite the selected text in a polished, diplomatic institutional tone suitable for policy briefs and high-level publications.',
  simplify: 'Simplify any dense jargon or overly complex phrasing in the selected text so it is clear and engaging for a broad readership.',
  rewrite: 'Provide a compelling alternative phrasing or fresh angle for the selected text.',
  headlines: 'Suggest 5 distinct, strong article headlines based on the content and topic. Provide a mix of direct, analytical, and visionary styles. Return each headline on a new line, numbered 1 to 5.',
  excerpt: 'Write a compelling, concise 2-sentence summary (under 250 characters) suitable for article cards, email newsletters, and RSS feeds.',
  seo: 'Provide an SEO title (under 60 characters) and a meta description (under 160 characters) optimised for search engine visibility and click-through rate.',
  tags: 'Suggest 5 to 8 relevant topical tags and the best fitting category for this article. Format as a comma-separated list.',
  social: 'Generate an engaging LinkedIn post (with 2-3 key takeaways and a thought-provoking opening) and a tweet thread starter based on this article.',
  grammar: 'Review the text for grammatical precision, punctuation, British English spelling consistency, passive voice overuse, and readability. List specific suggestions clearly.',
  factcheck: 'Analyze this article to identify any specific claims, dates, statistics, or institutional assertions that require human source verification. Clearly flag each point.',
  draft: 'Using the provided title and context, write a well-structured first draft of an article with an introduction, analytical sections with subheadings, and a forward-looking conclusion.',
  custom: 'Address the user\'s specific editorial request for this article.',
};

export async function assistEditorial({
  action = 'custom',
  prompt = '',
  selectedText = '',
  context = {},
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) {
    return {
      ok: false,
      error: 'GEMINI_API_KEY is not configured on this server. Set GEMINI_API_KEY in the hosting environment to enable AI assistance.',
      code: 'API_KEY_MISSING',
    };
  }

  const actionPrompt = ACTION_PROMPTS[action] || ACTION_PROMPTS.custom;
  const userRequest = prompt.trim() ? `${actionPrompt}\n\nUser instructions: ${prompt.trim()}` : actionPrompt;

  // Build context payload
  const articleInfo = {
    title: String(context.title || '').slice(0, 500),
    type: String(context.type || 'news'),
    category: String(context.category || ''),
    tags: Array.isArray(context.tags) ? context.tags.slice(0, 20) : [],
    summary: String(context.summary || '').slice(0, 1000),
    selectedText: String(selectedText || '').slice(0, 8000),
    articleBodyPreview: String(context.body || '').slice(0, 25000),
  };

  const userContent = [
    `TASK: ${userRequest}`,
    '',
    articleInfo.selectedText ? `SELECTED TEXT:\n"""\n${articleInfo.selectedText}\n"""\n` : '',
    articleInfo.title ? `ARTICLE TITLE: ${articleInfo.title}` : '',
    articleInfo.category ? `CATEGORY: ${articleInfo.category}` : '',
    articleInfo.summary ? `CURRENT SUMMARY: ${articleInfo.summary}` : '',
    articleInfo.articleBodyPreview ? `FULL ARTICLE CONTEXT:\n${articleInfo.articleBodyPreview}` : '',
  ].filter(Boolean).join('\n');

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        systemInstruction: {
          parts: [{text: SYSTEM_INSTRUCTIONS}],
        },
        contents: [
          {
            role: 'user',
            parts: [{text: userContent}],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      return {
        ok: false,
        error: `Gemini API returned status ${response.status}: ${errBody.slice(0, 200)}`,
        code: 'API_ERROR',
      };
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts
      ?.filter(p => !p.thought)
      ?.map(p => p.text || '')
      ?.join('')
      ?.trim() || '';

    if (!resultText) {
      return {
        ok: false,
        error: 'Gemini returned an empty response. Please try rephrasing your request.',
        code: 'EMPTY_RESPONSE',
      };
    }

    return {
      ok: true,
      result: resultText,
      action,
      usage: data.usageMetadata || null,
    };
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return {
        ok: false,
        error: 'Gemini took too long to respond (timeout after 25s). Please try again.',
        code: 'TIMEOUT',
      };
    }
    return {
      ok: false,
      error: error.message || 'Gemini service is currently unavailable.',
      code: 'UNAVAILABLE',
    };
  }
}
