// Getting a critic's JSON out of what an agent replied: the object may sit in a code fence or
// between sentences, and a long reply is safest taken from the agent's transcript.

/** Every balanced {...} in the text (outermost first, by position), honouring JSON strings. */
function objects(text) {
  const out = [];
  for (let i = text.indexOf('{'); i >= 0; i = text.indexOf('{', i + 1)) {
    let depth = 0; let inStr = false; let esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { out.push(text.slice(i, j + 1)); i = j; break; }
    }
  }
  return out;
}

/** The largest JSON object in the text that is the wanted kind (by default: has a findings array), or null. */
export function extractJson(text, wanted = (d) => Array.isArray(d.findings)) {
  const found = objects(String(text || ''))
    .map((s) => { try { return JSON.parse(s); } catch { return null; } })
    .filter((d) => d && typeof d === 'object' && wanted(d));
  return found.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0] || null;
}

/** The last assistant text in a Claude Code transcript (.jsonl) that holds a JSON object. */
export function replyFromTranscript(jsonl, wanted) {
  const texts = [];
  for (const line of String(jsonl || '').split('\n')) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const msg = ev?.message;
    if (!msg || (msg.role !== 'assistant' && ev.type !== 'assistant')) continue;
    // The reply is the text, or what the agent handed back through a final-report tool call.
    const parts = typeof msg.content === 'string' ? [msg.content] : (msg.content || []).flatMap((c) => (
      c?.type === 'text' ? [c.text]
        : c?.type === 'tool_use' && /hand-?back|final|result|report/i.test(c.name || '') ? Object.values(c.input || {}).filter((v) => typeof v === 'string')
          : []));
    const t = parts.join('\n');
    if (t.includes('{')) texts.push(t);
  }
  return texts.reverse().find((t) => extractJson(t, wanted)) || '';
}
