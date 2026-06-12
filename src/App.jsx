import { useState, useEffect, useCallback, useRef } from 'react';
import * as d3 from 'd3';
import {
  Menu, X, Plus, Eye, Edit3, Trash2, GitBranch,
  Search, Mic, MicOff, Calendar, FileText,
  ZoomIn, ZoomOut, Maximize2, Send, Key,
  RefreshCw, ChevronDown, CloudOff, Cloud, Loader
} from 'lucide-react';
import { initGitHub, saveNotes, REPO } from './services/github.js';

// ─── TOKENS ──────────────────────────────────────────────────────────────────
const C = {
  bg:           '#0d0d0d',
  sidebar:      '#141414',
  surface:      '#1a1a1a',
  surfaceHover: '#202020',
  border:       '#242424',
  text:         '#f0f0f0',
  textSub:      '#a0a0a0',
  textMuted:    '#505050',
  orange:       '#f97316',
  orangeHover:  '#fb923c',
  orangeDim:    'rgba(249,115,22,0.10)',
  orangeBorder: 'rgba(249,115,22,0.28)',
  green:        '#22c55e',
  red:          '#ef4444',
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const uid      = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const todayStr = () => new Date().toISOString().split('T')[0];
const fmtShort = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtLong  = (d = new Date()) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

function passesDate(note, filter) {
  if (filter === 'all') return true;
  const days = { '7d': 7, '30d': 30, '3m': 90, '6m': 180 }[filter];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  return new Date(note.updatedAt) >= cutoff;
}

function parseWikiLinks(text = '') {
  return [...text.matchAll(/\[\[(.+?)\]\]/g)].map(m => m[1].trim().toLowerCase());
}

function getSnippet(content = '', query = '') {
  const clean = content.replace(/[#*`\[\]>]/g, '').replace(/\n+/g, ' ').trim();
  if (!query) return clean.slice(0, 110) + (clean.length > 110 ? '…' : '');
  const idx = clean.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return clean.slice(0, 110) + (clean.length > 110 ? '…' : '');
  const s = Math.max(0, idx - 35), e = Math.min(clean.length, idx + query.length + 75);
  return (s > 0 ? '…' : '') + clean.slice(s, e) + (e < clean.length ? '…' : '');
}

function buildAIContext(notes, query = '') {
  const q = query.toLowerCase();
  const relevant = q ? notes.filter(n =>
    n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
  ).slice(0, 12) : [];
  const recent = notes
    .filter(n => !relevant.find(r => r.id === n.id))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 20 - relevant.length);
  return [...relevant, ...recent]
    .map(n => `[${n.type === 'daily' ? 'Daily' : 'Note'}: "${n.title || 'Untitled'}" | ${fmtShort(n.updatedAt)}]\n${n.content.slice(0, 700)}`)
    .join('\n\n───\n\n');
}

// ─── MARKDOWN ────────────────────────────────────────────────────────────────
function fmtInline(t) {
  return t
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${C.text};font-weight:600">$1</strong>`)
    .replace(/\*(.+?)\*/g, `<em style="color:#c0c0c0">$1</em>`)
    .replace(/`(.+?)`/g, `<code style="background:#1e1e1e;border:1px solid #333;border-radius:4px;padding:1px 6px;font-family:monospace;font-size:.82em;color:${C.orangeHover}">$1</code>`)
    .replace(/\[\[(.+?)\]\]/g, `<span data-wiki="$1" style="color:${C.orange};border-bottom:1px solid ${C.orangeBorder};cursor:pointer;font-weight:500">$1</span>`);
}
function renderMd(raw = '') {
  if (!raw.trim()) return `<p style="color:${C.textMuted};font-style:italic">Nothing written yet.</p>`;
  const esc = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = '', inList = false;
  for (const line of esc.split('\n')) {
    const end = () => { if (inList) { html += '</ul>'; inList = false; } };
    if      (/^### (.+)/.test(line)) { end(); html += `<h3 style="font-size:1rem;font-weight:600;color:${C.text};margin:1.1rem 0 .25rem">${fmtInline(line.replace(/^### /, ''))}</h3>`; }
    else if (/^## (.+)/.test(line))  { end(); html += `<h2 style="font-size:1.22rem;font-weight:700;color:${C.text};margin:1.4rem 0 .3rem;padding-bottom:.25rem;border-bottom:1px solid ${C.border}">${fmtInline(line.replace(/^## /, ''))}</h2>`; }
    else if (/^# (.+)/.test(line))   { end(); html += `<h1 style="font-size:1.65rem;font-weight:800;color:${C.text};margin:1rem 0 .4rem;letter-spacing:-.02em">${fmtInline(line.replace(/^# /, ''))}</h1>`; }
    else if (/^&gt; (.+)/.test(line)){ end(); html += `<blockquote style="border-left:3px solid ${C.orange};margin:.7rem 0;padding:.45rem .7rem;color:${C.textSub};background:${C.orangeDim};border-radius:0 6px 6px 0">${fmtInline(line.replace(/^&gt; /, ''))}</blockquote>`; }
    else if (line.trim() === '---')  { end(); html += `<hr style="border:none;border-top:1px solid ${C.border};margin:1.4rem 0">`; }
    else if (/^[-*] (.+)/.test(line)){ if (!inList) { html += `<ul style="margin:.4rem 0;padding:0;list-style:none">`; inList = true; } html += `<li style="display:flex;align-items:flex-start;gap:.45rem;padding:.12rem 0;color:#d0d0d0;font-size:.88rem"><span style="color:${C.orange};margin-top:.32rem;flex-shrink:0">▸</span><span>${fmtInline(line.replace(/^[-*] /, ''))}</span></li>`; }
    else if (line.trim() === '')     { end(); html += `<div style="height:.45rem"></div>`; }
    else                             { end(); html += `<p style="margin:.18rem 0;color:#d0d0d0;line-height:1.75;font-size:.88rem">${fmtInline(line)}</p>`; }
  }
  if (inList) html += '</ul>';
  return html;
}

// ─── GRAPH VIEW ───────────────────────────────────────────────────────────────
function GraphView({ notes, activeId, onSelect }) {
  const svgRef  = useRef(null);
  const wrapRef = useRef(null);
  const zoomRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !wrapRef.current) return;
    const W = wrapRef.current.clientWidth || 800;
    const H = wrapRef.current.clientHeight || 600;
    const nodeMap = {}; notes.forEach(n => { nodeMap[n.id] = { ...n, connections: 0 }; });
    const seen = new Set(), links = [];
    notes.forEach(src => {
      parseWikiLinks(src.content).forEach(tt => {
        const tgt = notes.find(n => (n.title || '').toLowerCase().trim() === tt);
        if (!tgt || tgt.id === src.id) return;
        const key = [src.id, tgt.id].sort().join('||');
        if (seen.has(key)) return;
        seen.add(key); links.push({ source: src.id, target: tgt.id });
        nodeMap[src.id].connections++; nodeMap[tgt.id].connections++;
      });
    });
    const nodes = Object.values(nodeMap);
    const svg = d3.select(svgRef.current); svg.selectAll('*').remove(); svg.attr('width', W).attr('height', H);
    const g = svg.append('g');
    const zoom = d3.zoom().scaleExtent([0.15, 4]).on('zoom', ev => g.attr('transform', ev.transform));
    svg.call(zoom); zoomRef.current = zoom;
    const defs = svg.append('defs'); const gf = defs.append('filter').attr('id', 'gl');
    gf.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'b');
    const fm = gf.append('feMerge'); fm.append('feMergeNode').attr('in', 'b'); fm.append('feMergeNode').attr('in', 'SourceGraphic');
    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(110))
      .force('charge', d3.forceManyBody().strength(-290))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(30));
    const le = g.append('g').selectAll('line').data(links).join('line').attr('stroke', 'rgba(249,115,22,0.22)').attr('stroke-width', 1.2).attr('stroke-linecap', 'round');
    const ne = g.append('g').selectAll('g').data(nodes).join('g').style('cursor', 'pointer')
      .on('click', (ev, d) => { ev.stopPropagation(); onSelect(d.id); })
      .call(d3.drag()
        .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    ne.filter(d => d.id === activeId).append('circle').attr('r', 22).attr('fill', 'none').attr('stroke', 'rgba(249,115,22,0.15)').attr('stroke-width', 7);
    const r    = d => d.id === activeId ? 14 : d.connections > 3 ? 12 : d.connections > 0 ? 9 : 6;
    const fill = d => d.id === activeId ? C.orange : d.type === 'daily' ? 'rgba(249,115,22,0.32)' : d.connections > 3 ? 'rgba(249,115,22,0.52)' : d.connections > 0 ? 'rgba(249,115,22,0.2)' : '#1e1e1e';
    ne.append('circle').attr('r', r).attr('fill', fill).attr('stroke', d => d.connections === 0 && d.id !== activeId ? 'rgba(249,115,22,0.3)' : C.orange).attr('stroke-width', d => d.id === activeId ? 2.5 : 1.2).attr('filter', d => d.id === activeId || d.connections > 2 ? 'url(#gl)' : null);
    ne.append('text').text(d => { const t = d.title || 'Untitled'; return t.length > 20 ? t.slice(0, 19) + '…' : t; }).attr('font-size', '9.5px').attr('fill', d => d.id === activeId ? C.orange : '#5a5a5a').attr('text-anchor', 'middle').attr('dy', d => r(d) + 13).attr('font-family', 'system-ui,-apple-system,sans-serif').attr('pointer-events', 'none');
    sim.on('tick', () => {
      le.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      ne.attr('transform', d => `translate(${d.x},${d.y})`);
    });
    return () => sim.stop();
  }, [notes, activeId, onSelect]);

  const zoomBy = k => { if (zoomRef.current && svgRef.current) d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, k); };
  const reset  = () => { if (zoomRef.current && svgRef.current) d3.select(svgRef.current).transition().call(zoomRef.current.transform, d3.zoomIdentity); };

  return (
    <div ref={wrapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: C.bg }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[[<ZoomIn size={13} />, () => zoomBy(1.4)], [<ZoomOut size={13} />, () => zoomBy(0.7)], [<Maximize2 size={13} />, reset]].map(([icon, fn], i) => (
          <button key={i} onClick={fn} style={{ width: 30, height: 30, borderRadius: 7, background: C.surface, border: `1px solid ${C.border}`, color: C.textSub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</button>
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 14, right: 14, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.6rem 0.8rem', fontSize: '0.67rem', color: C.textMuted, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <div style={{ fontWeight: 700, color: C.textSub, marginBottom: 1 }}>Legend</div>
        {[[C.orange, 'Active'], ['rgba(249,115,22,0.52)', 'Hub (3+)'], ['rgba(249,115,22,0.2)', 'Linked'], ['#1e1e1e', 'Isolated']].map(([col, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: col, border: `1.5px solid ${C.orange}`, flexShrink: 0 }} /> {label}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 14, left: 14, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: '0.35rem 0.65rem', fontSize: '0.68rem', color: C.textMuted, display: 'flex', gap: '0.6rem' }}>
        <span>📄 {notes.length}</span><span style={{ color: C.border }}>|</span>
        <span>🔗 {notes.reduce((a, n) => a + parseWikiLinks(n.content).length, 0)}</span>
      </div>
      {notes.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.6rem', color: C.textMuted }}><div style={{ fontSize: '3rem', opacity: 0.25 }}>🕸️</div><p style={{ fontSize: '0.82rem', margin: 0 }}>Create notes to see your graph</p></div>}
      {notes.length > 0 && !notes.some(n => parseWikiLinks(n.content).length > 0) && (
        <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: '0.5rem 0.9rem', fontSize: '0.73rem', color: C.textMuted, textAlign: 'center', whiteSpace: 'nowrap' }}>
          💡 Type <code style={{ color: C.orange, background: C.bg, padding: '1px 4px', borderRadius: 3 }}>[[Note Title]]</code> to create graph connections
        </div>
      )}
    </div>
  );
}

// ─── AI CHAT VIEW ─────────────────────────────────────────────────────────────
const FREE_MODELS = [
  { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B · Fast' },
  { id: 'deepseek/deepseek-r1:free',              label: 'DeepSeek R1 · Smart' },
  { id: 'google/gemma-3-12b-it:free',            label: 'Gemma 3 12B' },
  { id: 'mistralai/mistral-7b-instruct:free',     label: 'Mistral 7B · Lite' },
];

function ChatView({ notes, apiKey, onUpdateApiKey }) {
  const [messages, setMessages]     = useState(null);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [model, setModel]           = useState(() => localStorage.getItem('sb_model') || FREE_MODELS[0].id);
  const [keyDraft, setKeyDraft]     = useState('');
  const [showKey, setShowKey]       = useState(false);
  const [showDrop, setShowDrop]     = useState(false);
  const bottomRef = useRef(null);
  const textaRef  = useRef(null);

  useEffect(() => {
    if (messages !== null) return;
    setMessages([{ id: uid(), role: 'assistant', content: `Hi! 👋 I'm your second brain.\n\nI have access to all **${notes.length} note${notes.length !== 1 ? 's' : ''}** saved in your GitHub repo. Try asking:\n\n- "What did I write about [topic] last month?"\n- "Summarize my daily notes this week"\n- "What are my main ideas about [project]?"\n- "Find notes related to [subject]"` }]);
  }, [notes.length, messages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async () => {
    if (!input.trim() || loading || !apiKey) return;
    const userText = input.trim();
    const userMsg  = { id: uid(), role: 'user', content: userText };
    const updated  = [...(messages || []), userMsg];
    setMessages(updated); setInput(''); setLoading(true);
    if (textaRef.current) textaRef.current.style.height = 'auto';

    const ctx = buildAIContext(notes, userText);
    const sys = `You are a personal AI second brain. You have full access to the user's notes stored on GitHub.\n\nToday: ${fmtLong()}\nTotal notes: ${notes.length}\n\n──── USER'S NOTES ────\n${ctx}\n──────────────────────\n\nInstructions:\n- Reference specific note titles when relevant (e.g. "in your note 'Title'")\n- If the info isn't in their notes, say so before answering from general knowledge\n- Be concise, specific, and helpful\n- Use markdown formatting`;

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.origin, 'X-Title': 'Second Brain' },
        body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: 'system', content: sys }, ...updated.slice(-10).map(m => ({ role: m.role, content: m.content }))] })
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
      const data  = await res.json();
      const reply = data?.choices?.[0]?.message?.content;
      if (!reply) throw new Error('Empty response. Try again.');
      setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: `⚠️ **Error:** ${err.message}` }]);
    } finally { setLoading(false); }
  };

  const CHIPS = ['Summarize my recent daily notes', 'What ideas do I have?', 'What have I been working on?', 'Connect my recent thoughts'];

  // Setup screen
  if (!apiKey && !showKey) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: C.bg }}>
      <div style={{ maxWidth: 380, width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🤖</div>
        <h3 style={{ color: C.text, margin: '0 0 0.45rem', fontSize: '1.1rem', fontWeight: 700 }}>Connect OpenRouter AI</h3>
        <p style={{ color: C.textSub, fontSize: '0.81rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>Add a free API key to chat with your notes. Stored only in your browser — never sent anywhere except OpenRouter.</p>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.8rem', marginBottom: '1.2rem', textAlign: 'left' }}>
          {[['✅', '100% free — no credit card needed'], ['🔒', 'Key stays in your browser only'], ['🧠', 'AI answers questions using your notes']].map(([i, t]) => (
            <div key={t} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.38rem' }}>
              <span style={{ fontSize: '0.8rem' }}>{i}</span>
              <span style={{ color: C.textSub, fontSize: '0.74rem' }}>{t}</span>
            </div>
          ))}
        </div>
        <button onClick={() => setShowKey(true)} style={{ width: '100%', padding: '0.72rem', background: C.orange, color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.87rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}
          onMouseOver={e => e.currentTarget.style.background = C.orangeHover} onMouseOut={e => e.currentTarget.style.background = C.orange}>
          <Key size={14} /> Add API Key
        </button>
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: C.orange, fontSize: '0.76rem', textDecoration: 'none' }}>Get a free key at openrouter.ai/keys →</a>
      </div>
    </div>
  );

  if (showKey) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: C.bg }}>
      <div style={{ maxWidth: 380, width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.2rem' }}><Key size={16} color={C.orange} /><h3 style={{ color: C.text, margin: 0, fontSize: '1rem', fontWeight: 700 }}>{apiKey ? 'Update' : 'Enter'} API Key</h3></div>
        <input value={keyDraft} onChange={e => setKeyDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && keyDraft.trim()) { onUpdateApiKey(keyDraft.trim()); setShowKey(false); } }} placeholder="sk-or-v1-..." type="password" autoFocus style={{ width: '100%', padding: '0.65rem 0.75rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, color: C.text, fontSize: '0.82rem', outline: 'none', marginBottom: '0.75rem', boxSizing: 'border-box', fontFamily: 'monospace' }} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setShowKey(false)} style={{ flex: 1, padding: '0.62rem', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 9, color: C.textSub, fontSize: '0.82rem', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { if (keyDraft.trim()) { onUpdateApiKey(keyDraft.trim()); setShowKey(false); } }} disabled={!keyDraft.trim()} style={{ flex: 2, padding: '0.62rem', background: keyDraft.trim() ? C.orange : '#252525', color: keyDraft.trim() ? '#fff' : C.textMuted, border: 'none', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700, cursor: keyDraft.trim() ? 'pointer' : 'not-allowed' }}>Save Key</button>
        </div>
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', color: C.textMuted, fontSize: '0.72rem', textDecoration: 'none', marginTop: '0.9rem' }}>openrouter.ai/keys — it's free ↗</a>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
      {/* Header */}
      <div style={{ padding: '0.5rem 1rem', borderBottom: `1px solid ${C.border}`, background: C.sidebar, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: C.orangeDim, border: `1px solid ${C.orangeBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>🤖</div>
          <span style={{ color: C.textSub, fontSize: '0.76rem', fontWeight: 500 }}>AI Second Brain</span>
          <span style={{ color: C.textMuted, fontSize: '0.68rem' }}>· {notes.length} notes</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.38rem', position: 'relative' }}>
          <button onClick={() => setShowDrop(!showDrop)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.22rem 0.5rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, color: C.textSub, fontSize: '0.68rem', cursor: 'pointer' }}>
            {FREE_MODELS.find(m => m.id === model)?.label || 'Model'} <ChevronDown size={10} />
          </button>
          {showDrop && (
            <div style={{ position: 'absolute', top: '110%', right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.28rem', minWidth: 200, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
              {FREE_MODELS.map(m => (
                <div key={m.id} onClick={() => { setModel(m.id); localStorage.setItem('sb_model', m.id); setShowDrop(false); }} style={{ padding: '0.42rem 0.7rem', borderRadius: 7, cursor: 'pointer', background: model === m.id ? C.orangeDim : 'transparent', color: model === m.id ? C.orange : C.textSub, fontSize: '0.73rem', fontWeight: model === m.id ? 600 : 400 }}
                  onMouseOver={e => { if (model !== m.id) e.currentTarget.style.background = C.surfaceHover; }} onMouseOut={e => { if (model !== m.id) e.currentTarget.style.background = 'transparent'; }}>
                  {m.label}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setMessages([{ id: uid(), role: 'assistant', content: `Chat cleared. Still have **${notes.length} notes** — ask me anything!` }])} style={{ padding: '0.22rem 0.42rem', background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><RefreshCw size={11} /></button>
          <button onClick={() => { setShowKey(true); setKeyDraft(''); }} style={{ padding: '0.22rem 0.42rem', background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Key size={11} /></button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {(messages || []).map(msg => (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '0.5rem' }}>
            {msg.role === 'assistant' && <div style={{ width: 26, height: 26, borderRadius: 8, background: C.orangeDim, border: `1px solid ${C.orangeBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0, marginBottom: 2 }}>🧠</div>}
            <div style={{ maxWidth: '76%', padding: '0.62rem 0.82rem', borderRadius: msg.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px', background: msg.role === 'user' ? C.orange : C.surface, border: msg.role === 'user' ? `1px solid ${C.orangeHover}` : `1px solid ${C.border}`, fontSize: '0.85rem', lineHeight: 1.65, color: msg.role === 'user' ? '#fff' : C.text }}>
              {msg.role === 'assistant' ? <div dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} /> : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: C.orangeDim, border: `1px solid ${C.orangeBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>🧠</div>
            <div style={{ padding: '0.7rem 1rem', borderRadius: '14px 14px 14px 3px', background: C.surface, border: `1px solid ${C.border}`, display: 'flex', gap: '0.32rem', alignItems: 'center' }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: C.orange, animation: `bounce 1.2s ${i * 0.18}s infinite ease-in-out` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages?.length === 1 && (
        <div style={{ padding: '0 1.2rem 0.6rem', display: 'flex', flexWrap: 'wrap', gap: '0.38rem' }}>
          {CHIPS.map(chip => (
            <button key={chip} onClick={() => { setInput(chip); setTimeout(() => textaRef.current?.focus(), 50); }} style={{ padding: '0.28rem 0.62rem', borderRadius: 99, background: C.surface, border: `1px solid ${C.border}`, color: C.textSub, fontSize: '0.72rem', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.background = C.orangeDim; e.currentTarget.style.borderColor = C.orangeBorder; e.currentTarget.style.color = C.orange; }}
              onMouseOut={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSub; }}>
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '0.6rem 1rem 0.7rem', borderTop: `1px solid ${C.border}`, background: C.sidebar, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.45rem 0.52rem 0.45rem 0.88rem', transition: 'border-color 0.15s' }}
          onFocusCapture={e => e.currentTarget.style.borderColor = C.orangeBorder}
          onBlurCapture={e => e.currentTarget.style.borderColor = C.border}>
          <textarea ref={textaRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about your notes… (Enter to send)" rows={1}
            style={{ flex: 1, background: 'none', border: 'none', color: C.text, fontSize: '0.85rem', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto' }}
            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} />
          <button onClick={send} disabled={!input.trim() || loading} style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: input.trim() && !loading ? C.orange : '#232323', border: 'none', color: input.trim() && !loading ? '#fff' : C.textMuted, cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
            <Send size={14} />
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.28rem', padding: '0 0.1rem' }}>
          <span style={{ color: C.textMuted, fontSize: '0.62rem' }}>Shift+Enter for new line</span>
          <span style={{ color: C.textMuted, fontSize: '0.62rem' }}>{notes.length} notes as context</span>
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR NOTE ROW ─────────────────────────────────────────────────────────
function NoteRow({ note, active, onClick, onDelete, searchQuery }) {
  const [hov, setHov] = useState(false);
  const snippet = searchQuery?.trim() ? getSnippet(note.content, searchQuery.trim()) : null;
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: '0.5rem 0.62rem', borderRadius: 8, cursor: 'pointer', background: active ? C.orangeDim : hov ? C.surfaceHover : 'transparent', border: `1px solid ${active ? C.orangeBorder : 'transparent'}`, marginBottom: 2, transition: 'all 0.1s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.32rem' }}>
        <span style={{ fontSize: '0.68rem', flexShrink: 0 }}>{note.type === 'daily' ? '📅' : '📄'}</span>
        <span style={{ color: active ? C.orange : C.text, fontSize: '0.77rem', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{note.title || 'Untitled'}</span>
        {hov && <button onClick={e => { e.stopPropagation(); onDelete(note.id); }} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', padding: 2, borderRadius: 4, display: 'flex', flexShrink: 0 }}><Trash2 size={10} /></button>}
      </div>
      {snippet && <div style={{ color: C.textMuted, fontSize: '0.65rem', paddingLeft: '1rem', marginTop: 2, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{snippet}</div>}
      <div style={{ color: C.textMuted, fontSize: '0.63rem', paddingLeft: '1rem', marginTop: 1 }}>{fmtShort(note.updatedAt)}</div>
    </div>
  );
}

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
function LoadingScreen({ message }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,-apple-system,sans-serif', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: C.orangeDim, border: `1px solid ${C.orangeBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>🧠</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: C.textSub, fontSize: '0.85rem' }}>
        <div style={{ width: 14, height: 14, border: `2px solid ${C.orangeBorder}`, borderTopColor: C.orange, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        {message}
      </div>
    </div>
  );
}

// ─── AUTH SCREEN ─────────────────────────────────────────────────────────────
function AuthScreen({ onLogin, error }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 380, padding: '2.5rem 2rem', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, margin: '0 auto 1.5rem', background: C.orangeDim, border: `1px solid ${C.orangeBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🧠</div>
        <h1 style={{ color: C.text, fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.4rem', letterSpacing: '-0.02em' }}>Second Brain</h1>
        <p style={{ color: C.textSub, fontSize: '0.85rem', margin: '0 0 0.3rem', lineHeight: 1.5 }}>Your personal knowledge base</p>
        <p style={{ color: C.textMuted, fontSize: '0.77rem', margin: '0 0 2rem' }}>Notes · Graph · Voice · AI Chat</p>
        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.6rem 0.8rem', marginBottom: '1rem', color: C.red, fontSize: '0.78rem' }}>⚠️ {error}</div>}
        <button onClick={onLogin} style={{ width: '100%', padding: '0.8rem', background: C.orange, color: '#fff', border: 'none', borderRadius: 12, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          onMouseOver={e => e.currentTarget.style.background = C.orangeHover} onMouseOut={e => e.currentTarget.style.background = C.orange}>
          <GitBranch size={16} /> Sign in with GitHub
        </button>
        <div style={{ marginTop: '1.5rem', padding: '0.85rem', background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, textAlign: 'left' }}>
          {[['📂', 'Notes saved to a private GitHub repo'], ['🔒', 'Fully private — only you can access'], ['📱', 'Install as a PWA on your phone'], ['🤖', 'AI chat powered by OpenRouter (free)']].map(([i, t]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.82rem' }}>{i}</span>
              <span style={{ color: C.textSub, fontSize: '0.74rem' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── DATE FILTER ─────────────────────────────────────────────────────────────
function DateFilter({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3, padding: '0 0.7rem 0.5rem', flexWrap: 'wrap' }}>
      {[['all', 'All'], ['7d', '7d'], ['30d', '30d'], ['3m', '3m'], ['6m', '6m']].map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} style={{ padding: '0.18rem 0.44rem', borderRadius: 5, background: value === v ? C.orangeDim : 'transparent', border: `1px solid ${value === v ? C.orangeBorder : C.border}`, color: value === v ? C.orange : C.textMuted, fontSize: '0.63rem', cursor: 'pointer', fontWeight: value === v ? 600 : 400 }}>{l}</button>
      ))}
    </div>
  );
}

// ─── SYNC STATUS ICON ─────────────────────────────────────────────────────────
function SyncIcon({ status }) {
  if (status === 'syncing')  return <div style={{ width: 14, height: 14, border: `2px solid ${C.orangeBorder}`, borderTopColor: C.orange, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />;
  if (status === 'synced')   return <Cloud size={13} color={C.green} />;
  if (status === 'error')    return <CloudOff size={13} color={C.red} />;
  return <Cloud size={13} color={C.textMuted} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN APP ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Auth & GitHub state ──────────────────────────────────────────────────
  const [token,     setToken]     = useState(() => localStorage.getItem('sb_gh_token') || '');
  const [user,      setUser]      = useState(null);
  const [initState, setInitState] = useState('idle'); // idle | loading | ready | error
  const [initMsg,   setInitMsg]   = useState('');
  const [authError, setAuthError] = useState('');

  // ── Notes state ───────────────────────────────────────────────────────────
  const [notes,       setNotes]       = useState([]);
  const [notesSha,    setNotesSha]    = useState(null);
  const [activeId,    setActiveId]    = useState(null);
  const [syncStatus,  setSyncStatus]  = useState('synced');

  // ── UI state ──────────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mainView,    setMainView]    = useState('editor');
  const [preview,     setPreview]     = useState(false);
  const [search,      setSearch]      = useState('');
  const [dateFilter,  setDateFilter]  = useState('all');
  const [listening,   setListening]   = useState(false);
  const [voiceHint,   setVoiceHint]   = useState('');
  const [apiKey,      setApiKey]      = useState(() => localStorage.getItem('sb_openrouter_key') || '');

  const syncTimer   = useRef(null);
  const recRef      = useRef(null);
  const textareaRef = useRef(null);

  // ── Pick up token from URL hash after GitHub OAuth redirect ──────────────
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('token=')) {
      const t = new URLSearchParams(hash.slice(1)).get('token');
      if (t) { localStorage.setItem('sb_gh_token', t); setToken(t); window.location.hash = ''; }
    }
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    if (err) { setAuthError(decodeURIComponent(err)); window.history.replaceState({}, '', '/'); }
  }, []);

  // ── Auto-init when we have a token ───────────────────────────────────────
  useEffect(() => {
    if (!token || initState !== 'idle') return;
    setInitState('loading');
    setInitMsg('Connecting to GitHub…');

    (async () => {
      try {
        setInitMsg('Loading your notes…');
        const { user: u, notes: loadedNotes, sha } = await initGitHub(token);
        setUser(u);
        setNotesSha(sha);

        // Create today's daily note if it doesn't exist
        const key = todayStr();
        if (!loadedNotes.some(n => n.type === 'daily' && n.date === key)) {
          const daily = { id: uid(), type: 'daily', date: key, title: `Daily — ${fmtLong()}`, content: `# ${fmtLong()}\n\n`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          const withDaily = [daily, ...loadedNotes];
          setNotes(withDaily);
          setActiveId(daily.id);
          // Save immediately
          const newSha = await saveNotes(token, u.login, withDaily, sha);
          setNotesSha(newSha);
        } else {
          setNotes(loadedNotes);
          const today = loadedNotes.find(n => n.type === 'daily' && n.date === key);
          setActiveId(today?.id || loadedNotes[0]?.id || null);
        }

        setInitState('ready');
        setSyncStatus('synced');
      } catch (err) {
        console.error(err);
        setInitState('error');
        setInitMsg(err.message);
      }
    })();
  }, [token, initState]);

  // ── Sync notes to GitHub (debounced) ─────────────────────────────────────
  const syncToGitHub = useCallback(async (latestNotes, sha) => {
    if (!token || !user) return;
    setSyncStatus('syncing');
    try {
      const newSha = await saveNotes(token, user.login, latestNotes, sha);
      setNotesSha(newSha);
      setSyncStatus('synced');
    } catch (err) {
      console.error('Sync error:', err);
      setSyncStatus('error');
    }
  }, [token, user]);

  // ── Note CRUD ─────────────────────────────────────────────────────────────
  const active = notes.find(n => n.id === activeId) || null;

  const persistNotes = useCallback((updated, currentSha) => {
    setNotes(updated);
    setSyncStatus('pending');
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => syncToGitHub(updated, currentSha), 2500);
  }, [syncToGitHub]);

  const newNote = () => {
    const n = { id: uid(), type: 'note', date: todayStr(), title: '', content: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const updated = [n, ...notes];
    persistNotes(updated, notesSha);
    setActiveId(n.id); setPreview(false); setMainView('editor');
    setTimeout(() => textareaRef.current?.focus(), 60);
  };

  const updateNote = (field, value) => {
    if (!activeId) return;
    const updated = notes.map(n => n.id === activeId ? { ...n, [field]: value, updatedAt: new Date().toISOString() } : n);
    persistNotes(updated, notesSha);
  };

  const deleteNote = (id) => {
    const updated = notes.filter(n => n.id !== id);
    persistNotes(updated, notesSha);
    if (activeId === id) setActiveId(updated[0]?.id || null);
  };

  // ── WikiLink click in preview ────────────────────────────────────────────
  const handlePreviewClick = (e) => {
    const wiki = e.target.getAttribute('data-wiki');
    if (!wiki) return;
    const tgt = notes.find(n => (n.title || '').toLowerCase().trim() === wiki.toLowerCase().trim());
    if (tgt) { setActiveId(tgt.id); setPreview(false); setMainView('editor'); }
  };

  // ── Voice (Web Speech API) ───────────────────────────────────────────────
  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceHint('Voice requires Chrome browser.'); setTimeout(() => setVoiceHint(''), 3000); return; }
    if (listening) { recRef.current?.stop(); setListening(false); setVoiceHint(''); return; }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    recRef.current = rec;
    let final = '';
    rec.onresult = ev => { let i = ''; for (let j = ev.resultIndex; j < ev.results.length; j++) { if (ev.results[j].isFinal) final += ev.results[j][0].transcript + ' '; else i = ev.results[j][0].transcript; } setVoiceHint(i || '🎙️ Listening…'); };
    rec.onend = () => { setListening(false); setVoiceHint(''); if (final.trim()) { const cur = active?.content || ''; updateNote('content', cur + (cur.endsWith('\n') || !cur ? '' : '\n') + final.trim()); } };
    rec.onerror = () => { setListening(false); setVoiceHint('Mic error — check permissions.'); setTimeout(() => setVoiceHint(''), 3000); };
    rec.start(); setListening(true); setVoiceHint('🎙️ Listening…');
  };

  const handleUpdateApiKey = (key) => { setApiKey(key); localStorage.setItem('sb_openrouter_key', key); };

  // ── Filtered notes ────────────────────────────────────────────────────────
  const q        = search.trim().toLowerCase();
  const filtered = notes.filter(n => (!q || (n.title || '').toLowerCase().includes(q) || n.content.toLowerCase().includes(q)) && passesDate(n, dateFilter));
  const dailies  = filtered.filter(n => n.type === 'daily');
  const regulars = filtered.filter(n => n.type !== 'daily');

  // ─────────────────────────────────────────────────────────────────────────
  // Render gates
  if (!token)                     return <AuthScreen onLogin={() => window.location.href = '/api/auth/github'} error={authError} />;
  if (initState === 'loading')    return <LoadingScreen message={initMsg} />;
  if (initState === 'error')      return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,-apple-system,sans-serif', flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
      <div style={{ fontSize: '2.5rem' }}>⚠️</div>
      <h2 style={{ color: C.text, margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>GitHub connection failed</h2>
      <p style={{ color: C.textSub, fontSize: '0.82rem', margin: 0, textAlign: 'center', maxWidth: 320 }}>{initMsg}</p>
      <button onClick={() => { localStorage.removeItem('sb_gh_token'); setToken(''); setInitState('idle'); }} style={{ padding: '0.6rem 1.4rem', background: C.orange, color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>Sign in again</button>
    </div>
  );

  // ─── MAIN LAYOUT ──────────────────────────────────────────────────────────
  const VIEWS = [{ id: 'editor', label: '📝 Notes' }, { id: 'graph', label: '🕸️ Graph' }, { id: 'chat', label: '🤖 AI' }];

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, overflow: 'hidden', fontFamily: 'system-ui,-apple-system,sans-serif', color: C.text }}>

      {/* ═══ SIDEBAR ══════════════════════════════════════════════════════ */}
      {sidebarOpen && (
        <div style={{ width: 252, minWidth: 252, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Logo */}
          <div style={{ padding: '0.8rem 0.9rem 0.7rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: C.orangeDim, border: `1px solid ${C.orangeBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>🧠</div>
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: C.orange, letterSpacing: '-0.02em' }}>Second Brain</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', padding: 4, borderRadius: 5, display: 'flex' }}><X size={13} /></button>
          </div>

          {/* View tabs */}
          <div style={{ padding: '0.45rem 0.7rem', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 3 }}>
            {VIEWS.map(v => (
              <button key={v.id} onClick={() => setMainView(v.id)} style={{ flex: 1, padding: '0.32rem 0.22rem', background: mainView === v.id ? C.orangeDim : 'transparent', border: `1px solid ${mainView === v.id ? C.orangeBorder : C.border}`, color: mainView === v.id ? C.orange : C.textSub, borderRadius: 7, fontSize: '0.68rem', fontWeight: mainView === v.id ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>{v.label}</button>
            ))}
          </div>

          {/* Search */}
          {mainView !== 'chat' && (
            <>
              <div style={{ padding: '0.5rem 0.7rem 0.28rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.38rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.33rem 0.56rem' }}>
                  <Search size={10} color={C.textMuted} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes…" style={{ background: 'none', border: 'none', color: C.text, fontSize: '0.76rem', outline: 'none', width: '100%' }} />
                  {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', padding: 0, display: 'flex' }}><X size={10} /></button>}
                </div>
              </div>
              <DateFilter value={dateFilter} onChange={setDateFilter} />
            </>
          )}

          {/* New note */}
          <div style={{ padding: '0 0.7rem 0.55rem' }}>
            <button onClick={newNote} style={{ width: '100%', padding: '0.46rem', background: C.orange, color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', transition: 'background 0.15s' }}
              onMouseOver={e => e.currentTarget.style.background = C.orangeHover} onMouseOut={e => e.currentTarget.style.background = C.orange}>
              <Plus size={12} /> New Note
            </button>
          </div>

          {/* Note list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.7rem' }}>
            {dailies.length > 0 && (
              <div style={{ marginBottom: '0.35rem' }}>
                <div style={{ color: C.textMuted, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.22rem 0.2rem 0.28rem', display: 'flex', alignItems: 'center', gap: '0.28rem' }}><Calendar size={8} /> Daily</div>
                {dailies.map(n => <NoteRow key={n.id} note={n} active={activeId === n.id} searchQuery={q} onClick={() => { setActiveId(n.id); setPreview(false); setMainView('editor'); }} onDelete={deleteNote} />)}
              </div>
            )}
            {regulars.length > 0 && (
              <div>
                <div style={{ color: C.textMuted, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.22rem 0.2rem 0.28rem', display: 'flex', alignItems: 'center', gap: '0.28rem' }}><FileText size={8} /> Notes</div>
                {regulars.map(n => <NoteRow key={n.id} note={n} active={activeId === n.id} searchQuery={q} onClick={() => { setActiveId(n.id); setPreview(false); setMainView('editor'); }} onDelete={deleteNote} />)}
              </div>
            )}
            {filtered.length === 0 && <div style={{ color: C.textMuted, fontSize: '0.76rem', textAlign: 'center', padding: '2rem 0', lineHeight: 1.5 }}>{q || dateFilter !== 'all' ? 'No notes match.' : 'No notes yet.\nCreate your first!'}</div>}
          </div>

          {/* Footer */}
          <div style={{ padding: '0.5rem 0.9rem', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.32rem', color: C.textMuted, fontSize: '0.65rem', minWidth: 0 }}>
              <GitBranch size={9} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.login || '—'} · {notes.length}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
              <span style={{ fontSize: '0.62rem', color: syncStatus === 'synced' ? C.green : syncStatus === 'error' ? C.red : C.orange }}>
                {syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Error' : '…'}
              </span>
              <SyncIcon status={syncStatus} />
            </div>
          </div>
        </div>
      )}

      {/* ═══ MAIN AREA ════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ height: 49, borderBottom: `1px solid ${C.border}`, background: C.sidebar, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', flexShrink: 0, gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', color: C.textSub, cursor: 'pointer', padding: 4, borderRadius: 5, display: 'flex', flexShrink: 0 }}><Menu size={17} /></button>}
            {mainView === 'graph'  && <span style={{ color: C.textMuted, fontSize: '0.76rem' }}>🕸️ Knowledge Graph</span>}
            {mainView === 'chat'   && <span style={{ color: C.textMuted, fontSize: '0.76rem' }}>🤖 AI Second Brain</span>}
            {mainView === 'editor' && active && <span style={{ color: C.textMuted, fontSize: '0.76rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active.type === 'daily' ? '📅' : '📄'} {active.title || 'Untitled'}</span>}
          </div>
          {mainView === 'editor' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.38rem', flexShrink: 0 }}>
              {active && (<>
                <button onClick={toggleVoice} style={{ padding: '0.24rem 0.46rem', borderRadius: 6, background: listening ? C.orangeDim : 'transparent', border: `1px solid ${listening ? C.orangeBorder : C.border}`, color: listening ? C.orange : C.textSub, fontSize: '0.69rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {listening ? <MicOff size={11} /> : <Mic size={11} />}{listening ? 'Stop' : 'Voice'}
                </button>
                <button onClick={() => setPreview(!preview)} style={{ padding: '0.24rem 0.46rem', borderRadius: 6, background: preview ? C.orangeDim : 'transparent', border: `1px solid ${preview ? C.orangeBorder : C.border}`, color: preview ? C.orange : C.textSub, fontSize: '0.69rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: preview ? 600 : 400 }}>
                  {preview ? <Edit3 size={11} /> : <Eye size={11} />}{preview ? 'Edit' : 'Preview'}
                </button>
                <button onClick={() => deleteNote(active.id)} style={{ padding: '0.24rem 0.4rem', borderRadius: 6, background: 'transparent', border: `1px solid ${C.border}`, color: C.red, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.65, transition: 'opacity 0.15s' }}
                  onMouseOver={e => e.currentTarget.style.opacity = '1'} onMouseOut={e => e.currentTarget.style.opacity = '0.65'}>
                  <Trash2 size={11} />
                </button>
              </>)}
            </div>
          )}
        </div>

        {/* Voice hint */}
        {voiceHint && <div style={{ padding: '0.35rem 1.2rem', background: 'rgba(249,115,22,0.07)', borderBottom: `1px solid ${C.orangeBorder}`, color: C.orange, fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ animation: 'pulse 1s infinite', display: 'inline-block' }}>🎙️</span>{voiceHint}</div>}

        {/* Views */}
        {mainView === 'graph'  && <GraphView notes={notes} activeId={activeId} onSelect={id => { setActiveId(id); setMainView('editor'); setPreview(false); }} />}
        {mainView === 'chat'   && <ChatView notes={notes} apiKey={apiKey} onUpdateApiKey={handleUpdateApiKey} />}
        {mainView === 'editor' && (
          active ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 2.5rem', maxWidth: 780, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
              <input value={active.title} onChange={e => updateNote('title', e.target.value)} placeholder="Note title…"
                style={{ background: 'none', border: 'none', color: C.text, fontSize: '1.8rem', fontWeight: 800, width: '100%', outline: 'none', marginBottom: '1.5rem', padding: 0, fontFamily: 'inherit', letterSpacing: '-0.03em' }} />
              {preview ? (
                <div style={{ minHeight: 'calc(100vh - 280px)' }} onClick={handlePreviewClick} dangerouslySetInnerHTML={{ __html: renderMd(active.content) }} />
              ) : (
                <>
                  <textarea ref={textareaRef} value={active.content} onChange={e => updateNote('content', e.target.value)}
                    placeholder={active.type === 'daily' ? "What happened today? Use **bold**, # heading, [[link to note]]" : "Start writing… **bold**, *italic*, # heading, [[link to note]]"}
                    style={{ background: 'none', border: 'none', color: '#c8c8c8', fontSize: '0.9rem', lineHeight: 1.85, width: '100%', outline: 'none', resize: 'none', minHeight: 'calc(100vh - 260px)', fontFamily: 'inherit', padding: 0 }} />
                  <div style={{ marginTop: '2rem', padding: '0.62rem 0.85rem', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, display: 'flex', flexWrap: 'wrap', gap: '0.42rem', alignItems: 'center' }}>
                    {['# H1', '## H2', '**bold**', '*italic*', '`code`', '- list', '> quote', '---', '[[note link]]'].map(t => (
                      <code key={t} style={{ color: C.textMuted, fontSize: '0.66rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 5px', fontFamily: 'monospace' }}>{t}</code>
                    ))}
                    <span style={{ color: C.textMuted, fontSize: '0.65rem', marginLeft: 'auto', opacity: 0.6 }}>💡 [[Title]] = graph link</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.75rem', color: C.textMuted }}>
              <div style={{ fontSize: '3.5rem', opacity: 0.25 }}>🧠</div>
              <p style={{ fontSize: '0.87rem', margin: 0 }}>Select a note or create a new one</p>
              <button onClick={newNote} style={{ marginTop: '0.2rem', padding: '0.58rem 1.3rem', background: C.orange, color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.38rem' }}
                onMouseOver={e => e.currentTarget.style.background = C.orangeHover} onMouseOut={e => e.currentTarget.style.background = C.orange}>
                <Plus size={13} /> New Note
              </button>
            </div>
          )
        )}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #272727; border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: #333; }
        @keyframes pulse  { 0%,100%{ opacity:1 } 50%{ opacity:.45 } }
        @keyframes bounce { 0%,80%,100%{ transform:translateY(0) } 40%{ transform:translateY(-6px) } }
        @keyframes spin   { to { transform: rotate(360deg); } }
        select option { background: #1a1a1a; color: #f0f0f0; }
      `}</style>
    </div>
  );
}
