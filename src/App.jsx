import { useState, useEffect, useCallback, useRef } from 'react';
import * as d3 from 'd3';
import {
  Menu, X, Plus, Eye, Edit3, Trash2, GitBranch, Search, Mic, MicOff,
  Calendar, FileText, ZoomIn, ZoomOut, Maximize2, Send, Key, RefreshCw,
  ChevronDown, ChevronRight, FolderPlus, Folder, FolderOpen,
  Download, Tag, Link, LayoutTemplate, Cloud, Sparkles, Settings
} from 'lucide-react';
import { initGitHub, saveNotes } from './services/github.js';

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const C = {
  bg:           '#faf9f7',
  sidebar:      '#f3f2f0',
  sidebarHover: '#eae9e7',
  surface:      '#ffffff',
  border:       '#e5e4e2',
  borderLight:  '#eeede9',
  text:         '#1a1918',
  textSub:      '#4a4845',
  textMuted:    '#9a9895',
  orange:       '#f97316',
  orangeHover:  '#ea6500',
  orangeDim:    'rgba(249,115,22,0.08)',
  orangeBorder: 'rgba(249,115,22,0.35)',
  green:        '#16a34a',
  red:          '#dc2626',
  blue:         '#2563eb',
};

// ─── AI MODELS via OpenRouter ────────────────────────────────────────────────
const AI_MODELS = [
  { group: 'Free Models',
    models: [
      { id: 'meta-llama/llama-3.1-8b-instruct:free',    label: 'Llama 3.1 8B',    note: 'Fast'  },
      { id: 'nousresearch/hermes-3-llama-3.1-405b:free',label: 'Hermes 3 405B',   note: 'Smart' },
      { id: 'deepseek/deepseek-r1:free',                 label: 'DeepSeek R1',     note: 'Reason'},
      { id: 'google/gemma-3-12b-it:free',               label: 'Gemma 3 12B',     note: 'Good'  },
      { id: 'mistralai/mistral-7b-instruct:free',        label: 'Mistral 7B',      note: 'Light' },
    ]
  },
  { group: 'Claude (via OpenRouter)',
    models: [
      { id: 'anthropic/claude-3.5-sonnet',  label: 'Claude 3.5 Sonnet', note: 'Best'  },
      { id: 'anthropic/claude-3.5-haiku',   label: 'Claude 3.5 Haiku',  note: 'Fast'  },
      { id: 'anthropic/claude-3-opus',      label: 'Claude 3 Opus',     note: 'Power' },
    ]
  },
  { group: 'ChatGPT (via OpenRouter)',
    models: [
      { id: 'openai/gpt-4o',      label: 'GPT-4o',      note: 'Best'  },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', note: 'Cheap' },
      { id: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo', note: 'Power' },
    ]
  },
  { group: 'Other',
    models: [
      { id: 'perplexity/llama-3.1-sonar-large-128k-online', label: 'Perplexity Sonar', note: 'Web'  },
      { id: 'cohere/command-r-plus',                         label: 'Cohere Command R+', note: 'RAG' },
    ]
  },
];
const ALL_MODELS = AI_MODELS.flatMap(g => g.models);

// ─── TEMPLATES ───────────────────────────────────────────────────────────────
const fmt = (d = new Date()) => d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
const TEMPLATES = [
  { id:'meeting', icon:'🤝', label:'Meeting Notes',  content:() => `# Meeting Notes — ${fmt()}\n\n## Attendees\n- \n\n## Agenda\n- \n\n## Discussion\n\n\n## Action Items\n- [ ] \n\n## Next Steps\n` },
  { id:'goals',   icon:'🎯', label:'Goals',           content:() => `# Goals — ${fmt()}\n\n## This Week\n- [ ] \n\n## This Month\n- [ ] \n\n## Long Term\n- [ ] \n\n## Reflection\n` },
  { id:'ideas',   icon:'💡', label:'Idea Capture',    content:() => `# Idea: \n\n## The Idea\n\n\n## Why It Matters\n\n\n## How It Works\n\n\n## Next Steps\n- [ ] \n` },
  { id:'project', icon:'🚀', label:'Project Plan',    content:() => `# Project: \n\n## Overview\n\n\n## Goals\n- \n\n## Tasks\n- [ ] \n- [ ] \n\n## Notes\n` },
  { id:'journal', icon:'📖', label:'Journal',         content:() => `# Journal — ${fmt()}\n\n## How I feel\n\n\n## What happened\n\n\n## Grateful for\n- \n\n## Tomorrow\n- [ ] \n` },
  { id:'review',  icon:'📊', label:'Weekly Review',   content:() => `# Weekly Review — ${fmt()}\n\n## Wins\n- \n\n## Challenges\n- \n\n## Learned\n\n\n## Next week\n- [ ] \n` },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const uid      = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36);
const todayStr = () => new Date().toISOString().split('T')[0];
const fmtShort = iso => new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

function passesDate(n, f) {
  if (f==='all') return true;
  const days = {'7d':7,'30d':30,'3m':90,'6m':180}[f];
  const c = new Date(); c.setDate(c.getDate()-days);
  return new Date(n.updatedAt) >= c;
}
function parseLinks(text='') {
  return [...text.matchAll(/\[\[(.+?)\]\]/g)].map(m=>m[1].trim().toLowerCase());
}
function parseTags(text='') {
  return [...new Set([...text.matchAll(/#(\w+)/g)].map(m=>m[1].toLowerCase()))];
}
function getSnippet(content='',q='') {
  const clean = content.replace(/[#*`\[\]>]/g,'').replace(/\n+/g,' ').trim();
  if (!q) return clean.slice(0,120)+(clean.length>120?'…':'');
  const i = clean.toLowerCase().indexOf(q.toLowerCase());
  if (i===-1) return clean.slice(0,120)+(clean.length>120?'…':'');
  const s=Math.max(0,i-40), e=Math.min(clean.length,i+q.length+80);
  return (s>0?'…':'')+clean.slice(s,e)+(e<clean.length?'…':'');
}
function getBacklinks(noteId, notes) {
  const note = notes.find(n=>n.id===noteId);
  if (!note?.title) return [];
  const title = note.title.toLowerCase().trim();
  return notes.filter(n=>n.id!==noteId && parseLinks(n.content).includes(title));
}
function buildCtx(notes, q='') {
  const lq = q.toLowerCase();
  const rel = lq ? notes.filter(n=>n.title.toLowerCase().includes(lq)||n.content.toLowerCase().includes(lq)).slice(0,10) : [];
  const rest = notes.filter(n=>!rel.find(r=>r.id===n.id)).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,18-rel.length);
  return [...rel,...rest].map(n=>`[${n.type==='daily'?'Daily':'Note'}: "${n.title||'Untitled'}"${n.folder?` (${n.folder})`:''} | ${fmtShort(n.updatedAt)}]\n${n.content.slice(0,700)}`).join('\n\n───\n\n');
}

// ─── MARKDOWN ─────────────────────────────────────────────────────────────────
function fi(t) {
  return t
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${C.orange};font-weight:700">$1</strong>`)
    .replace(/\*(.+?)\*/g,     `<em style="color:${C.textSub}">$1</em>`)
    .replace(/`(.+?)`/g,       `<code style="background:#f0eeeb;border:1px solid ${C.border};border-radius:4px;padding:1px 7px;font-family:monospace;font-size:.85em;color:${C.orange}">$1</code>`)
    .replace(/#(\w+)/g,        `<span data-tag="$1" style="color:${C.orange};font-weight:600;cursor:pointer;background:${C.orangeDim};padding:1px 6px;border-radius:4px">#$1</span>`)
    .replace(/\[\[(.+?)\]\]/g, `<span data-wiki="$1" style="color:${C.orange};border-bottom:2px solid ${C.orangeBorder};cursor:pointer;font-weight:600;padding-bottom:1px">$1</span>`);
}
function renderMd(raw='') {
  if (!raw.trim()) return `<p style="color:${C.textMuted};font-style:italic;font-size:16px">Nothing written yet.</p>`;
  const esc = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let html='', inList=false, inCheck=false;
  for (const line of esc.split('\n')) {
    const end=()=>{ if(inList){html+='</ul>';inList=false;} if(inCheck){html+='</ul>';inCheck=false;} };
    if      (/^### (.+)/.test(line)) { end(); html+=`<h3 style="font-size:1.2rem;font-weight:700;color:${C.text};margin:1.4rem 0 .4rem">${fi(line.replace(/^### /,''))}</h3>`; }
    else if (/^## (.+)/.test(line))  { end(); html+=`<h2 style="font-size:1.5rem;font-weight:700;color:${C.text};margin:1.8rem 0 .5rem;padding-bottom:.4rem;border-bottom:2px solid ${C.border}">${fi(line.replace(/^## /,''))}</h2>`; }
    else if (/^# (.+)/.test(line))   { end(); html+=`<h1 style="font-size:2rem;font-weight:800;color:${C.text};margin:1rem 0 .6rem;letter-spacing:-.02em">${fi(line.replace(/^# /,''))}</h1>`; }
    else if (/^&gt; (.+)/.test(line)){ end(); html+=`<blockquote style="border-left:4px solid ${C.orange};margin:.9rem 0;padding:.6rem 1rem;color:${C.textSub};background:${C.orangeDim};border-radius:0 8px 8px 0;font-size:1rem">${fi(line.replace(/^&gt; /,''))}</blockquote>`; }
    else if (line.trim()==='---')    { end(); html+=`<hr style="border:none;border-top:2px solid ${C.border};margin:1.8rem 0">`; }
    else if (/^- \[[ x]\] (.+)/.test(line)) {
      if(!inCheck){html+=`<ul style="margin:.6rem 0;padding:0;list-style:none">`;inCheck=true;}
      const done=line.includes('- [x]'), text=line.replace(/^- \[[ x]\] /,'');
      html+=`<li style="display:flex;align-items:flex-start;gap:.6rem;padding:.25rem 0;font-size:1rem;color:${C.text}"><span style="flex-shrink:0;margin-top:.05rem">${done?'✅':'⬜'}</span><span style="${done?'text-decoration:line-through;color:'+C.textMuted:''}">${fi(text)}</span></li>`;
    }
    else if (/^[-*] (.+)/.test(line)){ if(!inList){html+=`<ul style="margin:.6rem 0;padding:0;list-style:none">`;inList=true;} html+=`<li style="display:flex;align-items:flex-start;gap:.6rem;padding:.2rem 0;font-size:1rem;color:${C.text}"><span style="color:${C.orange};margin-top:.45rem;flex-shrink:0;font-size:.6rem">▸</span><span>${fi(line.replace(/^[-*] /,''))}</span></li>`; }
    else if (line.trim()==='')       { end(); html+=`<div style="height:.6rem"></div>`; }
    else                             { end(); html+=`<p style="margin:.25rem 0;color:${C.text};line-height:1.9;font-size:1rem">${fi(line)}</p>`; }
  }
  if(inList)html+='</ul>'; if(inCheck)html+='</ul>';
  return html;
}

// ─── GRAPH ───────────────────────────────────────────────────────────────────
function GraphView({ notes, activeId, onSelect }) {
  const svgRef=useRef(null), wrapRef=useRef(null), zoomRef=useRef(null);
  useEffect(()=>{
    if(!svgRef.current||!wrapRef.current) return;
    const W=wrapRef.current.clientWidth||800, H=wrapRef.current.clientHeight||600;
    const nMap={}; notes.forEach(n=>{nMap[n.id]={...n,conns:0};});
    const seen=new Set(),links=[];
    notes.forEach(src=>{
      parseLinks(src.content).forEach(tt=>{
        const tgt=notes.find(n=>(n.title||'').toLowerCase().trim()===tt);
        if(!tgt||tgt.id===src.id) return;
        const key=[src.id,tgt.id].sort().join('|');
        if(seen.has(key)) return;
        seen.add(key); links.push({source:src.id,target:tgt.id});
        nMap[src.id].conns++; nMap[tgt.id].conns++;
      });
    });
    const nodes=Object.values(nMap);
    const svg=d3.select(svgRef.current); svg.selectAll('*').remove(); svg.attr('width',W).attr('height',H);
    svg.style('background', C.bg);
    const g=svg.append('g');
    const zoom=d3.zoom().scaleExtent([0.1,4]).on('zoom',ev=>g.attr('transform',ev.transform));
    svg.call(zoom); zoomRef.current=zoom;
    const defs=svg.append('defs'); const gf=defs.append('filter').attr('id','glow');
    gf.append('feGaussianBlur').attr('stdDeviation','4').attr('result','b');
    const fm=gf.append('feMerge'); fm.append('feMergeNode').attr('in','b'); fm.append('feMergeNode').attr('in','SourceGraphic');
    const sim=d3.forceSimulation(nodes)
      .force('link',d3.forceLink(links).id(d=>d.id).distance(120))
      .force('charge',d3.forceManyBody().strength(-320))
      .force('center',d3.forceCenter(W/2,H/2))
      .force('collision',d3.forceCollide().radius(35));
    const le=g.append('g').selectAll('line').data(links).join('line').attr('stroke','rgba(249,115,22,0.25)').attr('stroke-width',1.5).attr('stroke-linecap','round');
    const ne=g.append('g').selectAll('g').data(nodes).join('g').style('cursor','pointer')
      .on('click',(ev,d)=>{ev.stopPropagation();onSelect(d.id);})
      .call(d3.drag()
        .on('start',(ev,d)=>{if(!ev.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y;})
        .on('drag', (ev,d)=>{d.fx=ev.x;d.fy=ev.y;})
        .on('end',  (ev,d)=>{if(!ev.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}));
    ne.filter(d=>d.id===activeId).append('circle').attr('r',26).attr('fill','none').attr('stroke',C.orangeBorder).attr('stroke-width',6);
    const r=d=>d.id===activeId?16:d.conns>3?14:d.conns>0?10:7;
    const fill=d=>d.id===activeId?C.orange:d.type==='daily'?'rgba(249,115,22,0.4)':d.conns>3?'rgba(249,115,22,0.6)':d.conns>0?'rgba(249,115,22,0.25)':'#e5e4e2';
    ne.append('circle').attr('r',r).attr('fill',fill).attr('stroke',d=>d.conns===0&&d.id!==activeId?C.border:C.orange).attr('stroke-width',d=>d.id===activeId?3:1.5).attr('filter',d=>d.id===activeId||d.conns>2?'url(#glow)':null);
    ne.append('text').text(d=>{const t=d.title||'Untitled';return t.length>22?t.slice(0,21)+'…':t;})
      .attr('font-size','11px').attr('font-family','Inter,system-ui').attr('fill',d=>d.id===activeId?C.orange:C.textSub)
      .attr('text-anchor','middle').attr('dy',d=>r(d)+15).attr('pointer-events','none').attr('font-weight',d=>d.id===activeId?'700':'500');
    sim.on('tick',()=>{
      le.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
      ne.attr('transform',d=>`translate(${d.x},${d.y})`);
    });
    return ()=>sim.stop();
  },[notes,activeId,onSelect]);
  const zoomBy=k=>{if(zoomRef.current&&svgRef.current)d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy,k);};
  return (
    <div ref={wrapRef} style={{flex:1,position:'relative',overflow:'hidden',background:C.bg}}>
      <svg ref={svgRef} style={{width:'100%',height:'100%',display:'block'}}/>
      <div style={{position:'absolute',top:16,right:16,display:'flex',flexDirection:'column',gap:6}}>
        {[[<ZoomIn size={14}/>,()=>zoomBy(1.4),'Zoom in'],[<ZoomOut size={14}/>,()=>zoomBy(0.7),'Zoom out'],[<Maximize2 size={14}/>,()=>{if(zoomRef.current&&svgRef.current)d3.select(svgRef.current).transition().call(zoomRef.current.transform,d3.zoomIdentity);},'Reset']].map(([ic,fn,tt],i)=>(
          <button key={i} onClick={fn} title={tt} style={{width:34,height:34,borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,color:C.textSub,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.08)'}}>{ic}</button>
        ))}
      </div>
      <div style={{position:'absolute',top:16,left:16,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'6px 12px',fontSize:'13px',color:C.textMuted,display:'flex',gap:'0.75rem',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
        <span>📄 {notes.length} notes</span><span style={{color:C.border}}>·</span>
        <span>🔗 {notes.reduce((a,n)=>a+parseLinks(n.content).length,0)} links</span>
      </div>
      {notes.length===0&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'0.75rem',color:C.textMuted}}><div style={{fontSize:'3.5rem',opacity:.3}}>🕸️</div><p style={{fontSize:'1rem'}}>Create notes and link them with [[Note Title]]</p></div>}
    </div>
  );
}

// ─── AI CHAT ─────────────────────────────────────────────────────────────────
function ChatView({ notes, apiKey, onUpdateApiKey }) {
  const [messages, setMessages] = useState(null);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [modelId, setModelId]   = useState(()=>localStorage.getItem('sb_model')||AI_MODELS[0].models[0].id);
  const [keyDraft, setKeyDraft] = useState('');
  const [showKey, setShowKey]   = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const bottomRef=useRef(null), taRef=useRef(null);

  const currentModel = ALL_MODELS.find(m=>m.id===modelId) || ALL_MODELS[0];

  useEffect(()=>{
    if(messages!==null) return;
    setMessages([{id:uid(),role:'assistant',content:`Hello! 👋 I'm your **Second Brain AI**.\n\nI have access to all **${notes.length} notes** you've written — including your folders, tags, and daily journals.\n\n**You can ask me:**\n- "Summarize what I wrote in my Work folder"\n- "What are my notes tagged #ideas?"\n- "What did I work on this week?"\n- "Find connections between my notes about [topic]"\n- "What should I focus on tomorrow based on my goals?"\n\nI work with any OpenRouter model — **free models included**. What would you like to know?`}]);
  },[notes.length,messages]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'});},[messages,loading]);

  const send=async()=>{
    if(!input.trim()||loading||!apiKey) return;
    const text=input.trim();
    const upd=[...(messages||[]),{id:uid(),role:'user',content:text}];
    setMessages(upd); setInput(''); setLoading(true);
    if(taRef.current) taRef.current.style.height='auto';
    const sys=`You are a personal AI second brain assistant. You have full access to the user's notes.\n\nToday: ${fmt()}\nTotal notes: ${notes.length}\n\n── NOTES ──\n${buildCtx(notes,text)}\n───────────\n\nInstructions:\n- Reference specific note titles when relevant\n- Bold key information using **text**\n- If info isn't in notes, say so before using general knowledge\n- Be specific and helpful\n- Use markdown formatting`;
    try {
      const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`,'HTTP-Referer':window.location.origin,'X-Title':'Second Brain'},
        body:JSON.stringify({model:modelId,max_tokens:1500,messages:[{role:'system',content:sys},...upd.slice(-12).map(m=>({role:m.role,content:m.content}))]})
      });
      if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e?.error?.message||`HTTP ${res.status}`);}
      const data=await res.json();
      const reply=data?.choices?.[0]?.message?.content;
      if(!reply) throw new Error('Empty response');
      setMessages(prev=>[...prev,{id:uid(),role:'assistant',content:reply}]);
    } catch(err){
      setMessages(prev=>[...prev,{id:uid(),role:'assistant',content:`⚠️ **Error:** ${err.message}\n\nTip: Free models sometimes hit rate limits — try switching to a different model above.`}]);
    } finally{setLoading(false);}
  };

  const CHIPS=['Summarize my recent daily notes','What are my main ideas?','What have I been working on?','Find patterns in my notes','What should I focus on tomorrow?'];

  if(!apiKey&&!showKey) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'2rem',background:C.bg}}>
      <div style={{maxWidth:420,width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:'2.5rem',textAlign:'center',boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
        <div style={{fontSize:'3rem',marginBottom:'1.2rem'}}>🤖</div>
        <h2 style={{color:C.text,margin:'0 0 0.5rem',fontSize:'1.4rem',fontWeight:800}}>Connect AI to Your Notes</h2>
        <p style={{color:C.textSub,fontSize:'1rem',margin:'0 0 1.75rem',lineHeight:1.7}}>Add your free OpenRouter API key. The AI will read all your notes and answer questions about them.</p>
        <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:'1rem 1.2rem',marginBottom:'1.5rem',textAlign:'left'}}>
          {[['✅','100% free tier available — no credit card needed'],['🔒','Key stored only in your browser'],['🧠','Access to Claude, ChatGPT, Hermes, Llama & more'],['📝','AI reads ALL your notes as context']].map(([i,t])=>(
            <div key={t} style={{display:'flex',gap:'0.6rem',alignItems:'center',marginBottom:'0.5rem'}}>
              <span style={{fontSize:'0.9rem'}}>{i}</span><span style={{color:C.textSub,fontSize:'0.9rem'}}>{t}</span>
            </div>
          ))}
        </div>
        <button onClick={()=>setShowKey(true)} style={{width:'100%',padding:'0.85rem',background:C.orange,color:'#fff',border:'none',borderRadius:12,fontSize:'1rem',fontWeight:700,cursor:'pointer',marginBottom:'0.75rem'}}
          onMouseOver={e=>e.currentTarget.style.background=C.orangeHover} onMouseOut={e=>e.currentTarget.style.background=C.orange}>
          Add OpenRouter API Key
        </button>
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{color:C.orange,fontSize:'0.9rem',textDecoration:'none',fontWeight:600}}>Get a free key at openrouter.ai →</a>
      </div>
    </div>
  );

  if(showKey) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'2rem',background:C.bg}}>
      <div style={{maxWidth:420,width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:'2rem',boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'0.6rem',marginBottom:'1.5rem'}}>
          <Key size={18} color={C.orange}/><h3 style={{color:C.text,margin:0,fontWeight:700,fontSize:'1.1rem'}}>{apiKey?'Update':'Enter'} OpenRouter API Key</h3>
        </div>
        <input value={keyDraft} onChange={e=>setKeyDraft(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'&&keyDraft.trim()){onUpdateApiKey(keyDraft.trim());setShowKey(false);}}}
          placeholder="sk-or-v1-..." type="password" autoFocus
          style={{width:'100%',padding:'0.75rem 1rem',background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:'1rem',outline:'none',marginBottom:'1rem',boxSizing:'border-box',fontFamily:'monospace'}}
        />
        <div style={{display:'flex',gap:'0.6rem'}}>
          <button onClick={()=>setShowKey(false)} style={{flex:1,padding:'0.72rem',background:'transparent',border:`1px solid ${C.border}`,borderRadius:10,color:C.textSub,fontSize:'0.95rem',cursor:'pointer'}}>Cancel</button>
          <button onClick={()=>{if(keyDraft.trim()){onUpdateApiKey(keyDraft.trim());setShowKey(false);}}} disabled={!keyDraft.trim()}
            style={{flex:2,padding:'0.72rem',background:keyDraft.trim()?C.orange:'#e5e4e2',color:keyDraft.trim()?'#fff':C.textMuted,border:'none',borderRadius:10,fontSize:'0.95rem',fontWeight:700,cursor:keyDraft.trim()?'pointer':'not-allowed'}}>
            Save Key
          </button>
        </div>
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{display:'block',textAlign:'center',color:C.textMuted,fontSize:'0.85rem',textDecoration:'none',marginTop:'1rem'}}>openrouter.ai/keys — free tier available ↗</a>
      </div>
    </div>
  );

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:C.bg}}>
      {/* Chat header */}
      <div style={{padding:'0.75rem 1.2rem',borderBottom:`1px solid ${C.border}`,background:C.surface,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
          <div style={{width:32,height:32,borderRadius:10,background:C.orangeDim,border:`1.5px solid ${C.orangeBorder}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem'}}>🧠</div>
          <div>
            <div style={{fontWeight:700,fontSize:'0.95rem',color:C.text}}>AI Second Brain</div>
            <div style={{fontSize:'0.75rem',color:C.textMuted}}>{notes.length} notes loaded as context</div>
          </div>
        </div>
        <div style={{display:'flex',gap:'0.5rem',alignItems:'center',position:'relative'}}>
          {/* Model picker */}
          <button onClick={()=>setShowPicker(!showPicker)} style={{display:'flex',alignItems:'center',gap:'0.35rem',padding:'0.35rem 0.75rem',background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.textSub,fontSize:'0.82rem',cursor:'pointer',fontWeight:500}}>
            <Sparkles size={12} color={C.orange}/>
            {currentModel.label}
            <ChevronDown size={11}/>
          </button>
          {showPicker&&(
            <div style={{position:'absolute',top:'110%',right:0,background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:'0.4rem',minWidth:260,zIndex:200,boxShadow:'0 8px 32px rgba(0,0,0,0.12)',maxHeight:400,overflowY:'auto'}}>
              {AI_MODELS.map(group=>(
                <div key={group.group}>
                  <div style={{padding:'0.4rem 0.75rem 0.25rem',fontSize:'0.72rem',color:C.textMuted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>{group.group}</div>
                  {group.models.map(m=>(
                    <div key={m.id} onClick={()=>{setModelId(m.id);localStorage.setItem('sb_model',m.id);setShowPicker(false);}}
                      style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.5rem 0.75rem',borderRadius:8,cursor:'pointer',background:modelId===m.id?C.orangeDim:'transparent',margin:'1px 0'}}
                      onMouseOver={e=>{if(modelId!==m.id)e.currentTarget.style.background=C.sidebarHover;}}
                      onMouseOut={e=>{if(modelId!==m.id)e.currentTarget.style.background='transparent';}}>
                      <span style={{fontSize:'0.85rem',color:modelId===m.id?C.orange:C.text,fontWeight:modelId===m.id?700:400}}>{m.label}</span>
                      <span style={{fontSize:'0.7rem',color:modelId===m.id?C.orange:C.textMuted,background:modelId===m.id?C.orangeDim:'#f0eeeb',padding:'1px 6px',borderRadius:4}}>{m.note}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <button onClick={()=>setMessages([{id:uid(),role:'assistant',content:`Chat cleared. I still have access to **${notes.length} notes** — ask me anything!`}])} style={{padding:'0.35rem 0.55rem',background:'transparent',border:`1px solid ${C.border}`,color:C.textMuted,borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center'}}><RefreshCw size={13}/></button>
          <button onClick={()=>{setShowKey(true);setKeyDraft('');}} style={{padding:'0.35rem 0.55rem',background:'transparent',border:`1px solid ${C.border}`,color:C.textMuted,borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center'}}><Key size={13}/></button>
        </div>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:'auto',padding:'1.5rem',display:'flex',flexDirection:'column',gap:'1rem'}}>
        {(messages||[]).map(msg=>(
          <div key={msg.id} style={{display:'flex',justifyContent:msg.role==='user'?'flex-end':'flex-start',alignItems:'flex-end',gap:'0.6rem'}}>
            {msg.role==='assistant'&&<div style={{width:32,height:32,borderRadius:10,background:C.orangeDim,border:`1.5px solid ${C.orangeBorder}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.9rem',flexShrink:0,marginBottom:2}}>🧠</div>}
            <div style={{maxWidth:'78%',padding:'0.85rem 1.1rem',borderRadius:msg.role==='user'?'18px 18px 4px 18px':'18px 18px 18px 4px',background:msg.role==='user'?C.orange:C.surface,border:msg.role==='user'?`1px solid ${C.orangeHover}`:`1px solid ${C.border}`,fontSize:'0.95rem',lineHeight:1.75,color:msg.role==='user'?'#fff':C.text,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
              {msg.role==='assistant'?<div dangerouslySetInnerHTML={{__html:renderMd(msg.content)}}/>:<span style={{whiteSpace:'pre-wrap'}}>{msg.content}</span>}
            </div>
          </div>
        ))}
        {loading&&(
          <div style={{display:'flex',alignItems:'flex-end',gap:'0.6rem'}}>
            <div style={{width:32,height:32,borderRadius:10,background:C.orangeDim,border:`1.5px solid ${C.orangeBorder}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.9rem'}}>🧠</div>
            <div style={{padding:'0.85rem 1.1rem',borderRadius:'18px 18px 18px 4px',background:C.surface,border:`1px solid ${C.border}`,display:'flex',gap:'0.4rem',alignItems:'center'}}>
              {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:C.orange,animation:`bounce 1.2s ${i*.18}s infinite ease-in-out`}}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Suggestion chips */}
      {messages?.length===1&&(
        <div style={{padding:'0 1.5rem 0.75rem',display:'flex',flexWrap:'wrap',gap:'0.5rem'}}>
          {CHIPS.map(chip=>(
            <button key={chip} onClick={()=>{setInput(chip);setTimeout(()=>taRef.current?.focus(),50);}}
              style={{padding:'0.4rem 0.85rem',borderRadius:99,background:C.surface,border:`1px solid ${C.border}`,color:C.textSub,fontSize:'0.85rem',cursor:'pointer',transition:'all 0.15s',fontWeight:500}}
              onMouseOver={e=>{e.currentTarget.style.background=C.orangeDim;e.currentTarget.style.borderColor=C.orangeBorder;e.currentTarget.style.color=C.orange;}}
              onMouseOut={e=>{e.currentTarget.style.background=C.surface;e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSub;}}>
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{padding:'0.75rem 1.2rem 1rem',borderTop:`1px solid ${C.border}`,background:C.surface,flexShrink:0}}>
        <div style={{display:'flex',gap:'0.5rem',alignItems:'flex-end',background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:14,padding:'0.6rem 0.6rem 0.6rem 1rem',transition:'border-color 0.15s'}}
          onFocusCapture={e=>e.currentTarget.style.borderColor=C.orangeBorder}
          onBlurCapture={e=>e.currentTarget.style.borderColor=C.border}>
          <textarea ref={taRef} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder="Ask about your notes… (Enter to send, Shift+Enter for new line)"
            rows={1}
            style={{flex:1,background:'none',border:'none',color:C.text,fontSize:'0.95rem',outline:'none',resize:'none',fontFamily:'inherit',lineHeight:1.6,maxHeight:140,overflowY:'auto'}}
            onInput={e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px';}}
          />
          <button onClick={send} disabled={!input.trim()||loading}
            style={{width:38,height:38,borderRadius:10,flexShrink:0,background:input.trim()&&!loading?C.orange:'#e5e4e2',border:'none',color:input.trim()&&!loading?'#fff':C.textMuted,cursor:input.trim()&&!loading?'pointer':'not-allowed',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.15s'}}>
            <Send size={16}/>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FOLDER PICKER ───────────────────────────────────────────────────────────
function FolderPicker({folders,current,onPick,onClose}){
  return(
    <div style={{position:'absolute',top:'100%',right:0,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'0.35rem',minWidth:180,zIndex:200,boxShadow:'0 8px 24px rgba(0,0,0,0.1)'}}>
      <div onClick={()=>{onPick(null);onClose();}} style={{padding:'0.45rem 0.75rem',borderRadius:7,cursor:'pointer',fontSize:'0.88rem',color:!current?C.orange:C.textSub,background:!current?C.orangeDim:'transparent',fontWeight:!current?600:400}}
        onMouseOver={e=>{if(current)e.currentTarget.style.background=C.sidebarHover;}} onMouseOut={e=>{if(current)e.currentTarget.style.background='transparent';}}>
        📄 Unfiled
      </div>
      {folders.map(f=>(
        <div key={f} onClick={()=>{onPick(f);onClose();}} style={{padding:'0.45rem 0.75rem',borderRadius:7,cursor:'pointer',fontSize:'0.88rem',color:current===f?C.orange:C.textSub,background:current===f?C.orangeDim:'transparent',fontWeight:current===f?600:400}}
          onMouseOver={e=>{if(current!==f)e.currentTarget.style.background=C.sidebarHover;}} onMouseOut={e=>{if(current!==f)e.currentTarget.style.background='transparent';}}>
          📁 {f}
        </div>
      ))}
    </div>
  );
}

// ─── NOTE ROW ────────────────────────────────────────────────────────────────
function NoteRow({note,active,folders,onClick,onDelete,onMove,q}){
  const [hov,setHov]=useState(false);
  const [picker,setPicker]=useState(false);
  const tags=parseTags(note.content).slice(0,3);
  const snip=q?getSnippet(note.content,q):null;
  return(
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>{setHov(false);setPicker(false);}}
      style={{padding:'0.65rem 0.75rem',borderRadius:10,cursor:'pointer',background:active?C.orangeDim:hov?C.sidebarHover:'transparent',border:`1.5px solid ${active?C.orangeBorder:'transparent'}`,marginBottom:3,position:'relative',transition:'all 0.12s'}}>
      <div style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
        <span style={{fontSize:'0.8rem',flexShrink:0}}>{note.type==='daily'?'📅':'📄'}</span>
        <span style={{color:active?C.orange:C.text,fontSize:'0.92rem',fontWeight:active?700:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',flex:1}}>{note.title||'Untitled'}</span>
        {hov&&(
          <div style={{display:'flex',gap:2,flexShrink:0}}>
            <button onClick={e=>{e.stopPropagation();setPicker(!picker);}} style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',padding:3,borderRadius:5,display:'flex'}}><Folder size={12}/></button>
            <button onClick={e=>{e.stopPropagation();onDelete(note.id);}} style={{background:'none',border:'none',color:C.red,cursor:'pointer',padding:3,borderRadius:5,display:'flex',opacity:.7}}><Trash2 size={12}/></button>
          </div>
        )}
      </div>
      {tags.length>0&&(
        <div style={{display:'flex',gap:4,paddingLeft:'1.2rem',marginTop:4,flexWrap:'wrap'}}>
          {tags.map(t=><span key={t} style={{background:C.orangeDim,border:`1px solid ${C.orangeBorder}`,borderRadius:4,padding:'1px 6px',fontSize:'0.72rem',color:C.orange,fontWeight:600}}>#{t}</span>)}
        </div>
      )}
      {snip&&<div style={{color:C.textSub,fontSize:'0.82rem',paddingLeft:'1.2rem',marginTop:4,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{snip}</div>}
      <div style={{color:C.textMuted,fontSize:'0.75rem',paddingLeft:'1.2rem',marginTop:3}}>{fmtShort(note.updatedAt)}</div>
      {picker&&<FolderPicker folders={folders} current={note.folder||null} onPick={f=>onMove(note.id,f)} onClose={()=>setPicker(false)}/>}
    </div>
  );
}

// ─── DATE FILTER ─────────────────────────────────────────────────────────────
function DateFilter({value,onChange}){
  return(
    <div style={{display:'flex',gap:4,padding:'0 0.85rem 0.6rem',flexWrap:'wrap'}}>
      {[['all','All time'],['7d','7 days'],['30d','30 days'],['3m','3 months'],['6m','6 months']].map(([v,l])=>(
        <button key={v} onClick={()=>onChange(v)} style={{padding:'0.22rem 0.6rem',borderRadius:6,background:value===v?C.orangeDim:'transparent',border:`1px solid ${value===v?C.orangeBorder:C.border}`,color:value===v?C.orange:C.textMuted,fontSize:'0.78rem',cursor:'pointer',fontWeight:value===v?700:400,transition:'all 0.12s'}}>{l}</button>
      ))}
    </div>
  );
}

// ─── LOADING + AUTH SCREENS ──────────────────────────────────────────────────
function LoadingScreen({msg}){
  return(
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1rem',fontFamily:'Inter,system-ui'}}>
      <div style={{fontSize:'3rem'}}>🧠</div>
      <div style={{display:'flex',alignItems:'center',gap:'0.6rem',color:C.textSub,fontSize:'1rem'}}>
        <div style={{width:16,height:16,border:`2.5px solid ${C.border}`,borderTopColor:C.orange,borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
        {msg}
      </div>
    </div>
  );
}
function AuthScreen({onLogin,error}){
  return(
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem',fontFamily:'Inter,system-ui'}}>
      <div style={{width:'100%',maxWidth:400,background:C.surface,border:`1px solid ${C.border}`,borderRadius:24,padding:'2.5rem 2rem',textAlign:'center',boxShadow:'0 8px 40px rgba(0,0,0,0.08)'}}>
        <div style={{width:72,height:72,borderRadius:20,background:C.orangeDim,border:`2px solid ${C.orangeBorder}`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1.5rem',fontSize:'2.2rem'}}>🧠</div>
        <h1 style={{color:C.text,fontSize:'1.8rem',fontWeight:800,margin:'0 0 0.4rem',letterSpacing:'-.02em'}}>Second Brain</h1>
        <p style={{color:C.textSub,fontSize:'1rem',margin:'0 0 2rem',lineHeight:1.6}}>Notes · Folders · Tags · Graph · Voice · AI Chat</p>
        {error&&<div style={{background:'rgba(220,38,38,0.08)',border:'1px solid rgba(220,38,38,0.25)',borderRadius:10,padding:'0.7rem',marginBottom:'1rem',color:C.red,fontSize:'0.9rem'}}>⚠️ {error}</div>}
        <button onClick={onLogin} style={{width:'100%',padding:'0.9rem',background:C.orange,color:'#fff',border:'none',borderRadius:14,fontSize:'1rem',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'0.5rem',marginBottom:'1.25rem',transition:'background 0.15s'}}
          onMouseOver={e=>e.currentTarget.style.background=C.orangeHover} onMouseOut={e=>e.currentTarget.style.background=C.orange}>
          <GitBranch size={18}/> Sign in with GitHub
        </button>
        <div style={{background:C.bg,borderRadius:12,border:`1px solid ${C.border}`,padding:'1rem',textAlign:'left'}}>
          {[['📁','Folders + Tags to organize everything'],['🕸️','Visual knowledge graph with links'],['🤖','AI chat — Claude, GPT, Hermes & more'],['☁️','All notes in your private GitHub repo'],['📱','Works on phone, tablet, desktop']].map(([i,t])=>(
            <div key={t} style={{display:'flex',alignItems:'center',gap:'0.6rem',marginBottom:'0.5rem'}}>
              <span style={{fontSize:'0.9rem'}}>{i}</span><span style={{color:C.textSub,fontSize:'0.88rem'}}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const [token,      setToken]      = useState(()=>localStorage.getItem('sb_gh_token')||'');
  const [user,       setUser]       = useState(null);
  const [initState,  setInitState]  = useState('idle');
  const [initMsg,    setInitMsg]    = useState('');
  const [authError,  setAuthError]  = useState('');
  const [notes,      setNotes]      = useState([]);
  const [folders,    setFolders]    = useState([]);
  const [activeId,   setActiveId]   = useState(null);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [sidebarOpen,    setSidebarOpen]    = useState(true);
  const [mainView,       setMainView]       = useState('editor');
  const [preview,        setPreview]        = useState(false);
  const [search,         setSearch]         = useState('');
  const [dateFilter,     setDateFilter]     = useState('all');
  const [activeFolder,   setActiveFolder]   = useState(null);
  const [activeTag,      setActiveTag]      = useState(null);
  const [collapsed,      setCollapsed]      = useState({});
  const [newFolderMode,  setNewFolderMode]  = useState(false);
  const [newFolderName,  setNewFolderName]  = useState('');
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameVal,      setRenameVal]      = useState('');
  const [listening,      setListening]      = useState(false);
  const [voiceHint,      setVoiceHint]      = useState('');
  const [apiKey,         setApiKey]         = useState(()=>localStorage.getItem('sb_openrouter_key')||'');
  const [showTemplates,  setShowTemplates]  = useState(false);
  const [showTags,       setShowTags]       = useState(false);
  const [isMobile,       setIsMobile]       = useState(()=>window.innerWidth<680);

  const syncTimer=useRef(null), recRef=useRef(null), textareaRef=useRef(null), newFolderRef=useRef(null);

  useEffect(()=>{
    const fn=()=>setIsMobile(window.innerWidth<680);
    window.addEventListener('resize',fn); return ()=>window.removeEventListener('resize',fn);
  },[]);

  // ── Reset + token pickup ──────────────────────────────────────────────────
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get('reset')==='1'){
      localStorage.clear();
      Promise.all([
        navigator.serviceWorker?.getRegistrations().then(r=>r.forEach(x=>x.unregister())).catch(()=>{}),
        caches?.keys().then(k=>k.forEach(x=>caches.delete(x))).catch(()=>{})
      ]).finally(()=>window.location.href='/');
      return;
    }
    const hash=window.location.hash;
    if(hash.includes('token=')){
      const t=new URLSearchParams(hash.slice(1)).get('token');
      if(t){localStorage.setItem('sb_gh_token',t);setToken(t);window.location.hash='';}
    }
    const err=params.get('auth_error');
    if(err){setAuthError(decodeURIComponent(err));window.history.replaceState({},'','/');}
  },[]);

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!token||initState!=='idle') return;
    setInitState('loading'); setInitMsg('Connecting to GitHub…');
    (async()=>{
      try{
        setInitMsg('Loading your notes…');
        const {user:u,notes:loaded,folders:lf}=await initGitHub(token);
        setUser(u);
        const key=todayStr();
        let finalNotes=loaded, finalFolders=lf||[];
        if(!loaded.some(n=>n.type==='daily'&&n.date===key)){
          const daily={id:uid(),type:'daily',date:key,folder:null,title:`Daily — ${fmt()}`,content:`# ${fmt()}\n\n`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
          finalNotes=[daily,...loaded];
          await saveNotes(token,u.login,finalNotes,finalFolders);
        }
        setNotes(finalNotes); setFolders(finalFolders);
        const today=finalNotes.find(n=>n.type==='daily'&&n.date===key);
        setActiveId(today?.id||finalNotes[0]?.id||null);
        setInitState('ready'); setSyncStatus('synced');
      }catch(err){
        if(/bad credentials|401|unauthorized/i.test(err.message||'')){
          localStorage.removeItem('sb_gh_token'); setToken(''); setInitState('idle');
        } else {setInitState('error');setInitMsg(err.message);}
      }
    })();
  },[token,initState]);

  // ── Sync ─────────────────────────────────────────────────────────────────
  const syncNow=useCallback(async(n,f)=>{
    if(!token||!user) return;
    setSyncStatus('syncing');
    try{await saveNotes(token,user.login,n,f);setSyncStatus('synced');}
    catch(err){
      if(/bad credentials|401|unauthorized/i.test(err.message||'')){localStorage.removeItem('sb_gh_token');setToken('');setInitState('idle');}
      else setSyncStatus('error');
    }
  },[token,user]);

  const scheduleSync=useCallback((n,f)=>{
    setSyncStatus('pending'); clearTimeout(syncTimer.current);
    syncTimer.current=setTimeout(()=>syncNow(n,f),2000);
  },[syncNow]);

  const active=notes.find(n=>n.id===activeId)||null;

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const newNote=(folder=activeFolder)=>{
    const n={id:uid(),type:'note',date:todayStr(),folder:folder||null,title:'',content:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    const upd=[n,...notes]; setNotes(upd); scheduleSync(upd,folders);
    setActiveId(n.id); setPreview(false); setMainView('editor');
    if(isMobile) setSidebarOpen(false);
    setTimeout(()=>textareaRef.current?.focus(),60);
  };
  const updateNote=(field,value)=>{
    if(!activeId) return;
    const upd=notes.map(n=>n.id===activeId?{...n,[field]:value,updatedAt:new Date().toISOString()}:n);
    setNotes(upd); scheduleSync(upd,folders);
  };
  const deleteNote=id=>{
    const upd=notes.filter(n=>n.id!==id); setNotes(upd); scheduleSync(upd,folders);
    if(activeId===id) setActiveId(upd[0]?.id||null);
  };
  const moveNote=(id,folder)=>{
    const upd=notes.map(n=>n.id===id?{...n,folder:folder||null,updatedAt:new Date().toISOString()}:n);
    setNotes(upd); scheduleSync(upd,folders);
  };

  // ── Folders ───────────────────────────────────────────────────────────────
  const createFolder=()=>{
    const name=newFolderName.trim();
    if(!name||folders.includes(name)){setNewFolderMode(false);setNewFolderName('');return;}
    const upd=[...folders,name]; setFolders(upd); scheduleSync(notes,upd);
    setNewFolderMode(false); setNewFolderName(''); setActiveFolder(name);
  };
  const deleteFolder=name=>{
    const un=notes.map(n=>n.folder===name?{...n,folder:null}:n);
    const uf=folders.filter(f=>f!==name);
    setNotes(un); setFolders(uf); scheduleSync(un,uf);
    if(activeFolder===name) setActiveFolder(null);
  };
  const renameFolder=old=>{
    const nw=renameVal.trim();
    if(!nw||nw===old||folders.includes(nw)){setRenamingFolder(null);return;}
    const uf=folders.map(f=>f===old?nw:f);
    const un=notes.map(n=>n.folder===old?{...n,folder:nw}:n);
    setFolders(uf); setNotes(un); scheduleSync(un,uf);
    if(activeFolder===old) setActiveFolder(nw);
    setRenamingFolder(null);
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const exportNote=n=>{
    const blob=new Blob([`# ${n.title||'Untitled'}\n\n${n.content}`],{type:'text/markdown'});
    const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`${(n.title||'note').replace(/[^a-z0-9]/gi,'-').toLowerCase()}.md`});
    a.click(); URL.revokeObjectURL(a.href);
  };
  const exportAll=()=>{
    const md=notes.map(n=>`# ${n.title||'Untitled'}\n_${fmtShort(n.updatedAt)}${n.folder?` · ${n.folder}`:''}_\n\n${n.content}`).join('\n\n---\n\n');
    const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([md],{type:'text/markdown'})),download:`second-brain-${todayStr()}.md`});
    a.click(); URL.revokeObjectURL(a.href);
  };

  // ── Voice ─────────────────────────────────────────────────────────────────
  const toggleVoice=()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){setVoiceHint('Voice requires Chrome.');setTimeout(()=>setVoiceHint(''),3000);return;}
    if(listening){recRef.current?.stop();setListening(false);setVoiceHint('');return;}
    const rec=new SR(); rec.continuous=true; rec.interimResults=true; rec.lang='en-US';
    recRef.current=rec; let final='';
    rec.onresult=ev=>{let i='';for(let j=ev.resultIndex;j<ev.results.length;j++){if(ev.results[j].isFinal)final+=ev.results[j][0].transcript+' ';else i=ev.results[j][0].transcript;}setVoiceHint(i||'🎙️ Listening…');};
    rec.onend=()=>{setListening(false);setVoiceHint('');if(final.trim()){const cur=active?.content||'';updateNote('content',cur+(cur.endsWith('\n')||!cur?'':'\n')+final.trim());}};
    rec.onerror=()=>{setListening(false);setVoiceHint('Mic error.');setTimeout(()=>setVoiceHint(''),3000);};
    rec.start(); setListening(true); setVoiceHint('🎙️ Listening…');
  };

  const handlePreviewClick=e=>{
    const wiki=e.target.getAttribute('data-wiki');
    if(wiki){const t=notes.find(n=>(n.title||'').toLowerCase().trim()===wiki.toLowerCase().trim());if(t){setActiveId(t.id);setPreview(false);setMainView('editor');}}
    const tag=e.target.getAttribute('data-tag');
    if(tag){setActiveTag(activeTag===tag?null:tag);setActiveFolder(null);setSidebarOpen(true);}
  };

  const handleUpdateApiKey=key=>{setApiKey(key);localStorage.setItem('sb_openrouter_key',key);};

  // ── Filter ────────────────────────────────────────────────────────────────
  const q=search.trim().toLowerCase();
  const filtered=notes.filter(n=>
    (!q||(n.title||'').toLowerCase().includes(q)||n.content.toLowerCase().includes(q))&&
    passesDate(n,dateFilter)&&
    (activeFolder===null||n.folder===activeFolder)&&
    (!activeTag||parseTags(n.content).includes(activeTag))
  );
  const dailies=filtered.filter(n=>n.type==='daily');
  const regulars=filtered.filter(n=>n.type!=='daily');
  const byFolder={}, unfiled=[];
  regulars.forEach(n=>{
    if(n.folder&&folders.includes(n.folder)){if(!byFolder[n.folder])byFolder[n.folder]=[];byFolder[n.folder].push(n);}
    else unfiled.push(n);
  });
  const allTags=[...new Set(notes.flatMap(n=>parseTags(n.content)))].sort();
  const backlinks=active?getBacklinks(active.id,notes):[];
  const VIEWS=[{id:'editor',icon:'📝',label:'Notes'},{id:'graph',icon:'🕸️',label:'Graph'},{id:'chat',icon:'🤖',label:'AI'}];

  // ── Render gates ──────────────────────────────────────────────────────────
  if(!token) return <AuthScreen onLogin={()=>window.location.href='/api/auth/github'} error={authError}/>;
  if(initState==='loading') return <LoadingScreen msg={initMsg}/>;
  if(initState==='error') return(
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1rem',padding:'2rem',fontFamily:'Inter,system-ui'}}>
      <div style={{fontSize:'3rem'}}>⚠️</div>
      <h2 style={{color:C.text,margin:0,fontWeight:700,fontSize:'1.3rem'}}>Connection failed</h2>
      <p style={{color:C.textSub,fontSize:'0.95rem',margin:0,textAlign:'center',maxWidth:340}}>{initMsg}</p>
      <button onClick={async()=>{localStorage.clear();try{const r=await navigator.serviceWorker.getRegistrations();await Promise.all(r.map(x=>x.unregister()));const k=await caches.keys();await Promise.all(k.map(x=>caches.delete(x)));}catch(e){}window.location.href='/';}}
        style={{padding:'0.75rem 1.8rem',background:C.orange,color:'#fff',border:'none',borderRadius:12,fontSize:'1rem',fontWeight:700,cursor:'pointer'}}>
        Clear &amp; Sign in again
      </button>
    </div>
  );

  return(
    <div style={{display:'flex',height:'100vh',background:C.bg,overflow:'hidden',fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif",color:C.text,flexDirection:'column'}}>

      {/* Mobile overlay */}
      {isMobile&&sidebarOpen&&<div onClick={()=>setSidebarOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:90,backdropFilter:'blur(2px)'}}/>}

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* ══ SIDEBAR ════════════════════════════════════════════════════ */}
        {sidebarOpen&&(
          <div style={{width:280,minWidth:280,background:C.sidebar,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',overflow:'hidden',
            ...(isMobile?{position:'fixed',top:0,left:0,bottom:0,zIndex:100,boxShadow:'4px 0 32px rgba(0,0,0,0.12)'}:{})}}>

            {/* Header */}
            <div style={{padding:'1rem 1rem 0.75rem',borderBottom:`1px solid ${C.border}`,background:C.surface}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.7rem'}}>
                <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
                  <div style={{width:34,height:34,borderRadius:10,background:C.orangeDim,border:`1.5px solid ${C.orangeBorder}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem'}}>🧠</div>
                  <div>
                    <div style={{fontWeight:800,fontSize:'0.95rem',color:C.orange,letterSpacing:'-.02em'}}>Second Brain</div>
                    <div style={{fontSize:'0.7rem',color:C.textMuted,marginTop:1}}>{user?.login} · {notes.length} notes</div>
                  </div>
                </div>
                <button onClick={()=>setSidebarOpen(false)} style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',padding:6,borderRadius:8,display:'flex'}}><X size={15}/></button>
              </div>
              {/* View tabs */}
              <div style={{display:'flex',gap:4,background:C.bg,borderRadius:10,padding:3}}>
                {VIEWS.map(v=>(
                  <button key={v.id} onClick={()=>{setMainView(v.id);if(isMobile)setSidebarOpen(false);}}
                    style={{flex:1,padding:'0.38rem 0.2rem',background:mainView===v.id?C.surface:'transparent',border:`1px solid ${mainView===v.id?C.border:'transparent'}`,borderRadius:8,fontSize:'0.78rem',fontWeight:mainView===v.id?700:500,color:mainView===v.id?C.orange:C.textSub,cursor:'pointer',transition:'all 0.12s',boxShadow:mainView===v.id?'0 1px 4px rgba(0,0,0,0.06)':'none'}}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            {mainView!=='chat'&&(
              <>
                <div style={{padding:'0.65rem 0.85rem 0.35rem'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'0.4rem',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'0.45rem 0.75rem',transition:'border-color 0.15s'}}
                    onFocusCapture={e=>e.currentTarget.style.borderColor=C.orangeBorder}
                    onBlurCapture={e=>e.currentTarget.style.borderColor=C.border}>
                    <Search size={13} color={C.textMuted}/>
                    <input value={search} onChange={e=>{setSearch(e.target.value);setActiveFolder(null);setActiveTag(null);}} placeholder="Search all notes…"
                      style={{background:'none',border:'none',color:C.text,fontSize:'0.88rem',outline:'none',width:'100%'}}/>
                    {search&&<button onClick={()=>setSearch('')} style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',padding:0,display:'flex'}}><X size={12}/></button>}
                  </div>
                </div>
                <DateFilter value={dateFilter} onChange={setDateFilter}/>
              </>
            )}

            {/* Active tag banner */}
            {activeTag&&(
              <div style={{margin:'0 0.85rem 0.5rem',padding:'0.4rem 0.75rem',background:C.orangeDim,border:`1px solid ${C.orangeBorder}`,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{color:C.orange,fontSize:'0.88rem',fontWeight:600}}>#{activeTag}</span>
                <button onClick={()=>setActiveTag(null)} style={{background:'none',border:'none',color:C.orange,cursor:'pointer',padding:0,display:'flex'}}><X size={12}/></button>
              </div>
            )}

            {/* New Note + Export */}
            <div style={{padding:'0 0.85rem 0.65rem',display:'flex',gap:6}}>
              <button onClick={()=>newNote()} style={{flex:1,padding:'0.55rem 0.75rem',background:C.orange,color:'#fff',border:'none',borderRadius:10,fontSize:'0.88rem',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'0.35rem',transition:'background 0.15s'}}
                onMouseOver={e=>e.currentTarget.style.background=C.orangeHover} onMouseOut={e=>e.currentTarget.style.background=C.orange}>
                <Plus size={14}/> New Note
              </button>
              <button onClick={exportAll} title="Export all as markdown" style={{padding:'0.55rem 0.65rem',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.textSub,cursor:'pointer',display:'flex',alignItems:'center',transition:'all 0.12s'}}
                onMouseOver={e=>e.currentTarget.style.borderColor=C.orangeBorder} onMouseOut={e=>e.currentTarget.style.borderColor=C.border}>
                <Download size={14}/>
              </button>
            </div>

            {/* Note list */}
            <div style={{flex:1,overflowY:'auto',padding:'0 0.85rem'}}>

              {/* Daily */}
              {dailies.length>0&&(
                <div style={{marginBottom:'0.5rem'}}>
                  <div style={{color:C.textMuted,fontSize:'0.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',padding:'0.25rem 0.2rem 0.35rem',display:'flex',alignItems:'center',gap:'0.3rem'}}><Calendar size={10}/> Daily Notes</div>
                  {dailies.map(n=><NoteRow key={n.id} note={n} active={activeId===n.id} folders={folders} q={q}
                    onClick={()=>{setActiveId(n.id);setPreview(false);setMainView('editor');if(isMobile)setSidebarOpen(false);}}
                    onDelete={deleteNote} onMove={moveNote}/>)}
                </div>
              )}

              {/* Folders header */}
              {!search&&!activeTag&&(
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.25rem 0.2rem 0.35rem',marginTop:'0.25rem'}}>
                  <button onClick={()=>{setActiveFolder(null);setActiveTag(null);}}
                    style={{background:'none',border:'none',color:activeFolder===null?C.orange:C.textMuted,fontSize:'0.72rem',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:'0.3rem',textTransform:'uppercase',letterSpacing:'0.1em'}}>
                    <FileText size={10}/> {activeFolder===null?'All Notes':'Notes'}
                  </button>
                  <div style={{display:'flex',gap:4}}>
                    <button onClick={()=>setShowTags(!showTags)} title="Tags" style={{background:'none',border:'none',color:showTags?C.orange:C.textMuted,cursor:'pointer',padding:3,borderRadius:5,display:'flex'}}><Tag size={13}/></button>
                    <button onClick={()=>{setNewFolderMode(true);setTimeout(()=>newFolderRef.current?.focus(),50);}} title="New folder" style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',padding:3,borderRadius:5,display:'flex'}}><FolderPlus size={13}/></button>
                  </div>
                </div>
              )}

              {/* Tags panel */}
              {showTags&&allTags.length>0&&(
                <div style={{marginBottom:'0.6rem',padding:'0.6rem 0.7rem',background:C.surface,borderRadius:10,border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:'0.72rem',color:C.textMuted,marginBottom:'0.4rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>All Tags</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                    {allTags.map(tag=>(
                      <button key={tag} onClick={()=>{setActiveTag(activeTag===tag?null:tag);setActiveFolder(null);}}
                        style={{padding:'3px 10px',borderRadius:99,background:activeTag===tag?C.orange:C.orangeDim,border:`1px solid ${activeTag===tag?C.orangeHover:C.orangeBorder}`,color:activeTag===tag?'#fff':C.orange,fontSize:'0.8rem',cursor:'pointer',fontWeight:600,transition:'all 0.12s'}}>
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* New folder input */}
              {newFolderMode&&(
                <div style={{marginBottom:'0.45rem',display:'flex',gap:5}}>
                  <input ref={newFolderRef} value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')createFolder();if(e.key==='Escape'){setNewFolderMode(false);setNewFolderName('');}}}
                    placeholder="Folder name…"
                    style={{flex:1,background:C.surface,border:`1.5px solid ${C.orangeBorder}`,borderRadius:8,color:C.text,fontSize:'0.88rem',padding:'0.4rem 0.65rem',outline:'none'}}/>
                  <button onClick={createFolder} style={{background:C.orange,border:'none',borderRadius:7,color:'#fff',cursor:'pointer',padding:'0.4rem 0.65rem',fontSize:'0.82rem',fontWeight:700}}>Add</button>
                  <button onClick={()=>{setNewFolderMode(false);setNewFolderName('');}} style={{background:'transparent',border:`1px solid ${C.border}`,borderRadius:7,color:C.textMuted,cursor:'pointer',padding:'0.4rem 0.5rem',display:'flex',alignItems:'center'}}><X size={11}/></button>
                </div>
              )}

              {/* Folders */}
              {folders.map(fn=>(
                <div key={fn} style={{marginBottom:'0.35rem'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'0.3rem',padding:'0.3rem 0.4rem',borderRadius:9,background:activeFolder===fn?C.orangeDim:'transparent',border:`1px solid ${activeFolder===fn?C.orangeBorder:'transparent'}`,cursor:'pointer',marginBottom:3,transition:'all 0.12s'}}
                    onClick={()=>setActiveFolder(activeFolder===fn?null:fn)}>
                    <button onClick={e=>{e.stopPropagation();setCollapsed(p=>({...p,[fn]:!p[fn]}));}} style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',padding:0,display:'flex',flexShrink:0}}>
                      {collapsed[fn]?<ChevronRight size={13}/>:<ChevronDown size={13}/>}
                    </button>
                    {activeFolder===fn?<FolderOpen size={13} color={C.orange}/>:<Folder size={13} color={C.textMuted}/>}
                    {renamingFolder===fn?(
                      <input value={renameVal} onChange={e=>setRenameVal(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter')renameFolder(fn);if(e.key==='Escape')setRenamingFolder(null);}}
                        onClick={e=>e.stopPropagation()} autoFocus
                        style={{flex:1,background:'none',border:'none',borderBottom:`2px solid ${C.orange}`,color:C.orange,fontSize:'0.88rem',outline:'none',padding:'0 3px'}}/>
                    ):(
                      <span onDoubleClick={e=>{e.stopPropagation();setRenamingFolder(fn);setRenameVal(fn);}}
                        style={{flex:1,fontSize:'0.88rem',fontWeight:activeFolder===fn?700:500,color:activeFolder===fn?C.orange:C.textSub,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {fn}
                      </span>
                    )}
                    <span style={{fontSize:'0.75rem',color:C.textMuted,flexShrink:0}}>{(byFolder[fn]||[]).length}</span>
                    <button onClick={e=>{e.stopPropagation();newNote(fn);}} style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',padding:2,borderRadius:4,display:'flex',flexShrink:0}}><Plus size={11}/></button>
                    <button onClick={e=>{e.stopPropagation();if(window.confirm(`Delete "${fn}"? Notes move to Unfiled.`))deleteFolder(fn);}} style={{background:'none',border:'none',color:C.red,cursor:'pointer',padding:2,display:'flex',flexShrink:0,opacity:.6}}><Trash2 size={10}/></button>
                  </div>
                  {!collapsed[fn]&&(byFolder[fn]||[]).map(n=>(
                    <div key={n.id} style={{paddingLeft:'0.75rem'}}>
                      <NoteRow note={n} active={activeId===n.id} folders={folders} q={q}
                        onClick={()=>{setActiveId(n.id);setPreview(false);setMainView('editor');if(isMobile)setSidebarOpen(false);}}
                        onDelete={deleteNote} onMove={moveNote}/>
                    </div>
                  ))}
                </div>
              ))}

              {/* Unfiled */}
              {unfiled.length>0&&(
                <div style={{marginTop:folders.length>0?'0.35rem':0}}>
                  {folders.length>0&&<div style={{color:C.textMuted,fontSize:'0.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',padding:'0.25rem 0.2rem 0.35rem'}}>Unfiled</div>}
                  {unfiled.map(n=><NoteRow key={n.id} note={n} active={activeId===n.id} folders={folders} q={q}
                    onClick={()=>{setActiveId(n.id);setPreview(false);setMainView('editor');if(isMobile)setSidebarOpen(false);}}
                    onDelete={deleteNote} onMove={moveNote}/>)}
                </div>
              )}

              {filtered.length===0&&(
                <div style={{color:C.textMuted,fontSize:'0.9rem',textAlign:'center',padding:'2.5rem 0',lineHeight:1.6}}>
                  {q||dateFilter!=='all'||activeTag?'No notes match your filters':activeFolder?`No notes in "${activeFolder}"` :'No notes yet. Create your first!'}
                </div>
              )}
            </div>

            {/* Sync footer */}
            <div style={{padding:'0.65rem 1rem',borderTop:`1px solid ${C.border}`,background:C.surface,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.35rem',color:C.textMuted,fontSize:'0.78rem'}}>
                <GitBranch size={11}/>
                <span>second-brain-notes</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'0.35rem'}}>
                <span style={{fontSize:'0.75rem',color:syncStatus==='synced'?C.green:syncStatus==='error'?C.red:C.orange,fontWeight:600}}>
                  {syncStatus==='synced'?'Synced':syncStatus==='error'?'Error':'Saving…'}
                </span>
                {syncStatus==='syncing'||syncStatus==='pending'
                  ?<div style={{width:8,height:8,border:`2px solid rgba(249,115,22,0.3)`,borderTopColor:C.orange,borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
                  :<div style={{width:8,height:8,borderRadius:'50%',background:syncStatus==='synced'?C.green:syncStatus==='error'?C.red:C.orange,boxShadow:`0 0 6px ${syncStatus==='synced'?C.green:C.orange}`}}/>
                }
              </div>
            </div>
          </div>
        )}

        {/* ══ MAIN AREA ══════════════════════════════════════════════════ */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

          {/* Top bar */}
          <div style={{height:54,borderBottom:`1px solid ${C.border}`,background:C.surface,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 1.2rem',flexShrink:0,boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            <div style={{display:'flex',alignItems:'center',gap:'0.6rem',minWidth:0}}>
              <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{background:'none',border:'none',color:C.textSub,cursor:'pointer',padding:6,borderRadius:8,display:'flex',flexShrink:0,transition:'color 0.15s'}}
                onMouseOver={e=>e.currentTarget.style.color=C.orange} onMouseOut={e=>e.currentTarget.style.color=C.textSub}>
                <Menu size={18}/>
              </button>
              {mainView==='graph'&&<span style={{color:C.textMuted,fontSize:'0.9rem',fontWeight:500}}>🕸️ Knowledge Graph</span>}
              {mainView==='chat' &&<span style={{color:C.textMuted,fontSize:'0.9rem',fontWeight:500}}>🤖 AI Second Brain</span>}
              {mainView==='editor'&&active&&(
                <div style={{display:'flex',alignItems:'center',gap:'0.5rem',minWidth:0,overflow:'hidden'}}>
                  {active.folder&&<span style={{background:C.orangeDim,border:`1px solid ${C.orangeBorder}`,borderRadius:6,padding:'2px 8px',fontSize:'0.78rem',color:C.orange,flexShrink:0,fontWeight:600}}>📁 {active.folder}</span>}
                  {!isMobile&&<span style={{color:C.textMuted,fontSize:'0.9rem',fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{active.type==='daily'?'📅':'📄'} {active.title||'Untitled'}</span>}
                </div>
              )}
            </div>

            {/* Toolbar */}
            {mainView==='editor'&&active&&(
              <div style={{display:'flex',alignItems:'center',gap:'0.35rem',flexShrink:0}}>
                {/* Voice */}
                <button onClick={toggleVoice} style={{padding:'0.32rem 0.6rem',borderRadius:8,background:listening?C.orangeDim:'transparent',border:`1px solid ${listening?C.orangeBorder:C.border}`,color:listening?C.orange:C.textSub,fontSize:'0.82rem',cursor:'pointer',display:'flex',alignItems:'center',gap:'0.3rem',fontWeight:listening?600:400,transition:'all 0.12s'}}>
                  {listening?<MicOff size={13}/>:<Mic size={13}/>}{!isMobile&&(listening?' Stop':' Voice')}
                </button>
                {/* Templates */}
                <div style={{position:'relative'}}>
                  <button onClick={()=>setShowTemplates(!showTemplates)} style={{padding:'0.32rem 0.6rem',borderRadius:8,background:showTemplates?C.orangeDim:'transparent',border:`1px solid ${showTemplates?C.orangeBorder:C.border}`,color:showTemplates?C.orange:C.textSub,cursor:'pointer',display:'flex',alignItems:'center',gap:'0.3rem',fontSize:'0.82rem',transition:'all 0.12s'}}>
                    <LayoutTemplate size={13}/>{!isMobile&&' Template'}
                  </button>
                  {showTemplates&&(
                    <div style={{position:'absolute',top:'110%',right:0,background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:'0.45rem',minWidth:200,zIndex:100,boxShadow:'0 8px 32px rgba(0,0,0,0.1)'}}>
                      <div style={{fontSize:'0.72rem',color:C.textMuted,padding:'0.2rem 0.7rem 0.35rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>Insert Template</div>
                      {TEMPLATES.map(t=>(
                        <div key={t.id} onClick={()=>{const cur=active?.content||'';updateNote('content',cur+(cur.trim()?'\n\n':'')+t.content());setShowTemplates(false);}}
                          style={{padding:'0.5rem 0.75rem',borderRadius:9,cursor:'pointer',display:'flex',alignItems:'center',gap:'0.55rem',fontSize:'0.9rem',color:C.textSub,transition:'background 0.1s'}}
                          onMouseOver={e=>e.currentTarget.style.background=C.sidebarHover}
                          onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                          <span style={{fontSize:'1.1rem'}}>{t.icon}</span>{t.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Preview */}
                <button onClick={()=>setPreview(!preview)} style={{padding:'0.32rem 0.6rem',borderRadius:8,background:preview?C.orangeDim:'transparent',border:`1px solid ${preview?C.orangeBorder:C.border}`,color:preview?C.orange:C.textSub,fontSize:'0.82rem',cursor:'pointer',display:'flex',alignItems:'center',gap:'0.3rem',fontWeight:preview?600:400,transition:'all 0.12s'}}>
                  {preview?<Edit3 size={13}/>:<Eye size={13}/>}{!isMobile&&(preview?' Edit':' Preview')}
                </button>
                {/* Export note */}
                <button onClick={()=>exportNote(active)} title="Download as markdown" style={{padding:'0.32rem 0.5rem',borderRadius:8,background:'transparent',border:`1px solid ${C.border}`,color:C.textSub,cursor:'pointer',display:'flex',alignItems:'center',transition:'all 0.12s'}}
                  onMouseOver={e=>e.currentTarget.style.borderColor=C.orangeBorder} onMouseOut={e=>e.currentTarget.style.borderColor=C.border}>
                  <Download size={13}/>
                </button>
                {/* Delete */}
                <button onClick={()=>{if(window.confirm('Delete this note?'))deleteNote(active.id);}} style={{padding:'0.32rem 0.5rem',borderRadius:8,background:'transparent',border:`1px solid ${C.border}`,color:C.red,cursor:'pointer',display:'flex',alignItems:'center',opacity:.65,transition:'opacity 0.15s'}}
                  onMouseOver={e=>e.currentTarget.style.opacity='1'} onMouseOut={e=>e.currentTarget.style.opacity='.65'}>
                  <Trash2 size={13}/>
                </button>
              </div>
            )}
          </div>

          {/* Voice hint */}
          {voiceHint&&<div style={{padding:'0.4rem 1.5rem',background:C.orangeDim,borderBottom:`1px solid ${C.orangeBorder}`,color:C.orange,fontSize:'0.9rem',display:'flex',alignItems:'center',gap:'0.5rem',fontWeight:500}}><span style={{animation:'pulse 1s infinite',display:'inline-block'}}>🎙️</span>{voiceHint}</div>}

          {/* Views */}
          {mainView==='graph'&&<GraphView notes={notes} activeId={activeId} onSelect={id=>{setActiveId(id);setMainView('editor');setPreview(false);}}/>}
          {mainView==='chat' &&<ChatView notes={notes} apiKey={apiKey} onUpdateApiKey={handleUpdateApiKey}/>}
          {mainView==='editor'&&(
            active?(
              <div style={{flex:1,overflowY:'auto',padding:isMobile?'1.5rem 1.2rem':'2.5rem 3rem',maxWidth:820,width:'100%',margin:'0 auto',boxSizing:'border-box'}}>
                {/* Title */}
                <input value={active.title} onChange={e=>updateNote('title',e.target.value)} placeholder="Note title…"
                  style={{background:'none',border:'none',color:C.text,fontSize:isMobile?'1.7rem':'2.2rem',fontWeight:800,width:'100%',outline:'none',marginBottom:'1.5rem',padding:0,fontFamily:'inherit',letterSpacing:'-.03em'}}/>

                {preview?(
                  <>
                    <div onClick={handlePreviewClick} dangerouslySetInnerHTML={{__html:renderMd(active.content)}}/>
                    {/* Backlinks */}
                    {backlinks.length>0&&(
                      <div style={{marginTop:'3rem',paddingTop:'1.5rem',borderTop:`2px solid ${C.border}`}}>
                        <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'1rem'}}>
                          <Link size={15} color={C.textMuted}/><span style={{color:C.textMuted,fontSize:'0.82rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>Linked from ({backlinks.length})</span>
                        </div>
                        {backlinks.map(bl=>(
                          <div key={bl.id} onClick={()=>{setActiveId(bl.id);setPreview(false);}}
                            style={{padding:'0.75rem 1rem',marginBottom:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,cursor:'pointer',transition:'all 0.15s'}}
                            onMouseOver={e=>{e.currentTarget.style.borderColor=C.orangeBorder;e.currentTarget.style.boxShadow='0 2px 8px rgba(249,115,22,0.1)';}}
                            onMouseOut={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.boxShadow='none';}}>
                            <div style={{fontSize:'0.95rem',fontWeight:600,color:C.text,marginBottom:3}}>{bl.title||'Untitled'}</div>
                            <div style={{fontSize:'0.8rem',color:C.textMuted}}>{fmtShort(bl.updatedAt)}{bl.folder?` · 📁 ${bl.folder}`:''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ):(
                  <>
                    <textarea ref={textareaRef} value={active.content} onChange={e=>updateNote('content',e.target.value)}
                      placeholder={active.type==='daily'?"What happened today? Use **bold**, # heading, [[link to note]], #tag":"Start writing…  **bold text**, *italic*, # Heading, - list, [[link]], #tag"}
                      style={{background:'none',border:'none',color:C.text,fontSize:'1rem',lineHeight:1.9,width:'100%',outline:'none',resize:'none',minHeight:'calc(100vh - 250px)',fontFamily:'inherit',padding:0}}/>
                    {/* Cheatsheet */}
                    <div style={{marginTop:'2rem',padding:'0.75rem 1rem',background:C.sidebar,border:`1px solid ${C.border}`,borderRadius:12,display:'flex',flexWrap:'wrap',gap:'0.5rem',alignItems:'center'}}>
                      {['# H1','## H2','**bold**','*italic*','`code`','- list','- [ ] task','> quote','[[link]]','#tag','---'].map(t=>(
                        <code key={t} style={{color:C.textSub,fontSize:'0.8rem',background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:'3px 8px',fontFamily:'monospace',fontWeight:500}}>{t}</code>
                      ))}
                      <span style={{color:C.textMuted,fontSize:'0.78rem',marginLeft:'auto',fontStyle:'italic'}}>💡 [[Title]] creates graph connections</span>
                    </div>
                  </>
                )}
              </div>
            ):(
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1rem',color:C.textMuted,padding:'1.5rem'}}>
                <div style={{fontSize:'4rem',opacity:.2}}>🧠</div>
                <p style={{fontSize:'1rem',margin:0,fontWeight:500}}>Select a note or create a new one</p>
                <button onClick={()=>newNote()} style={{marginTop:'0.25rem',padding:'0.7rem 1.6rem',background:C.orange,color:'#fff',border:'none',borderRadius:12,fontSize:'1rem',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:'0.45rem',transition:'background 0.15s'}}
                  onMouseOver={e=>e.currentTarget.style.background=C.orangeHover} onMouseOut={e=>e.currentTarget.style.background=C.orange}>
                  <Plus size={15}/> New Note
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      {isMobile&&(
        <div style={{height:60,background:C.surface,borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-around',flexShrink:0,boxShadow:'0 -2px 12px rgba(0,0,0,0.06)'}}>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{flex:1,height:'100%',background:'none',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,color:sidebarOpen?C.orange:C.textMuted,fontSize:'0.65rem',fontWeight:600}}>
            <Menu size={20}/> Menu
          </button>
          {VIEWS.map(v=>(
            <button key={v.id} onClick={()=>{setMainView(v.id);setSidebarOpen(false);}}
              style={{flex:1,height:'100%',background:'none',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,color:mainView===v.id?C.orange:C.textMuted,fontSize:'0.65rem',fontWeight:600,borderTop:`2.5px solid ${mainView===v.id?C.orange:'transparent'}`}}>
              <span style={{fontSize:'1.3rem'}}>{v.icon}</span>{v.label}
            </button>
          ))}
          <button onClick={()=>{newNote();setSidebarOpen(false);}} style={{flex:1,height:'100%',background:'none',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,color:C.textMuted,fontSize:'0.65rem',fontWeight:600}}>
            <div style={{width:38,height:38,borderRadius:'50%',background:C.orange,display:'flex',alignItems:'center',justifyContent:'center'}}><Plus size={20} color="#fff"/></div>
          </button>
        </div>
      )}

      <style>{`
        *{box-sizing:border-box}
        ::selection{background:rgba(249,115,22,0.2);color:${C.text}}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#d4d4d4;border-radius:99px}
        ::-webkit-scrollbar-thumb:hover{background:#b0b0b0}
        @keyframes pulse {0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-7px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        input::placeholder{color:#b0aeaa}
        textarea::placeholder{color:#b0aeaa}
      `}</style>
    </div>
  );
}
