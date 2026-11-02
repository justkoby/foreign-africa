// Server-side Gemini AI editorial assistant service for Foreign Africa CMS.
// Credentials and API key are never exposed to the client.

import {classifyResponseKind} from '../src/studio/editor/gemini-format.js';

const SYSTEM_INSTRUCTIONS = `You are the Foreign Africa Editorial Assistant, an expert writing and editorial partner for Foreign Africa (foreignafrica.org).
Foreign Africa is a premier African-led institutional publication and platform connecting enterprise, policy, diplomacy, and economic opportunity across Africa.

EDITORIAL GUIDELINES:
- Voice: Authoritative, objective, nuanced, pan-African, and forward-looking. Suitable for business leaders, policymakers, scholars, and global partners.
- Language: International/British English spelling (e.g. programmes, organisation, labour, centre, dialogue, prioritise).
- Rigour: Ensure all assertions are supported by reason and evidence. Avoid empty buzzwords, hyperbole, or vague generalisations.
- Integrity: Never invent citations, dates, statistics, quotes, or historical facts. If facts or claims are uncertain or unverified, explicitly flag them for human editorial verification.
- Formatting: Write in clean, natural Markdown (use ## or ### for section headings, **bold** for emphasis, *italics* for nuance, - or 1. for lists, and > for blockquotes). NEVER output raw HTML tags such as <p>, <h3>, <strong>, <ul>, or <li>, and NEVER wrap your response in markdown code fences (\`\`\`html or \`\`\`markdown).`;

const ACTION_PROMPTS = {
  improve: 'Improve the selected text for clarity, flow, precision, and impact while preserving the core facts, meaning, and voice. Return ONLY the improved passage in clean Markdown without introductory commentary.',
  shorten: 'Condense the selected text into a tighter, punchier version without losing essential information. Return ONLY the condensed passage in clean Markdown.',
  expand: 'Expand the selected text with deeper context, analytical nuance, and relevant illustrative detail, maintaining institutional rigour. Return ONLY the expanded passage in clean Markdown.',
  tone_institutional: 'Rewrite the selected text in a polished, diplomatic institutional tone suitable for policy briefs and high-level publications. Return ONLY the rewritten passage in clean Markdown.',
  simplify: 'Simplify any dense jargon or overly complex phrasing in the selected text so it is clear and engaging for a broad readership. Return ONLY the simplified passage in clean Markdown.',
  rewrite: 'Provide a compelling alternative phrasing or fresh angle for the selected text. Return ONLY the rewritten passage in clean Markdown.',
  headlines: 'Suggest 5 distinct, strong article headlines based on the content and topic. Provide a mix of direct, analytical, and visionary styles. Return each headline on a new line, numbered 1 to 5, without surrounding quotes.',
  excerpt: 'Write a compelling, concise 2-sentence summary (under 250 characters) suitable for article cards, email newsletters, and RSS feeds. Return ONLY the excerpt text without quotes or labels.',
  seo: 'Provide an optimised SEO title (under 60 characters) and a meta description (under 160 characters) on two lines formatted as:\nSEO Title: <title>\nMeta Description: <description>',
  tags: 'Suggest the best fitting category and 5 to 8 relevant topical tags for this article, formatted as:\nCategory: <category>\nTags: <tag1>, <tag2>, <tag3>, ...',
  social: 'Generate an engaging LinkedIn post (with 2-3 key takeaways and a thought-provoking opening) and a short X/Twitter post based on this article, separated by a heading.',
  grammar: 'Review the text for grammatical precision, punctuation, British English spelling consistency, passive voice overuse, and readability. Present your review using clear headings and bullet points.',
  factcheck: 'Analyse this article to identify any specific claims, dates, statistics, or institutional assertions that require human source verification. Present each flagged point as a clear bullet item with why it should be verified.',
  draft: 'Using the provided title and context, write a well-structured article draft in clean Markdown with an engaging introduction, analytical sections using ### subheadings, and a forward-looking conclusion. Return ONLY the article draft.',
  custom: 'Address the user\'s specific editorial request for this article using clean Markdown formatting.',
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
    let resultText = data.candidates?.[0]?.content?.parts
      ?.filter(p => !p.thought)
      ?.map(p => p.text || '')
      ?.join('')
      ?.trim() || '';

    // Strip outer code fences if the model wrapped the output
    const fenceMatch = resultText.match(/^```(?:html|markdown|md|text)?\s*\n([\s\S]*?)\n```$/i);
    if (fenceMatch) {
      resultText = fenceMatch[1].trim();
    }

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
      responseKind: classifyResponseKind(action, prompt),
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
