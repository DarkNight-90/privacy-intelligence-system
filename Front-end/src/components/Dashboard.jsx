import React, { useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import usePrivacyData from '../hooks/usePrivacyData.js';
import chromeStorageService from '../services/chromeStorage.js';

// ── Shared styles ─────────────────────────────────────────────────────────────
const S = {
  card:   { padding:'24px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(148,163,184,0.08)', borderRadius:'16px', marginBottom:'16px' },
  input:  { width:'100%', padding:'10px 12px', background:'#1e293b', border:'1px solid rgba(148,163,184,0.2)', borderRadius:'8px', color:'#f8fafc', fontSize:'0.9rem', marginBottom:'12px', boxSizing:'border-box' },
  btnPrimary: { border:'none', borderRadius:'10px', padding:'10px 18px', cursor:'pointer', fontWeight:600, background:'linear-gradient(135deg,#6366f1,#0ea5e9)', color:'white' },
  btnGhost:   { border:'1px solid rgba(148,163,184,0.2)', borderRadius:'10px', padding:'10px 18px', cursor:'pointer', fontWeight:600, background:'#111827', color:'#f8fafc' },
  badge: (color) => ({ background:color||'#6366f1', color:'white', padding:'3px 10px', borderRadius:'12px', fontSize:'0.78rem', fontWeight:600 }),
  label: { color:'#94a3b8', fontSize:'0.85rem', marginBottom:'4px' },
  skeleton: { background:'linear-gradient(90deg,#1e293b 25%,#273449 50%,#1e293b 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s infinite', borderRadius:'8px' },
};

// ── Skeleton shimmer keyframes (injected once) ──────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('pm-shimmer')) {
  const style = document.createElement('style');
  style.id = 'pm-shimmer';
  style.textContent = '@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
  document.head.appendChild(style);
}

const TABS = ['overview','trackers','cookies','timeline','sites','gdpr','settings'];

// ── Modal ─────────────────────────────────────────────────────────────────────
function GDPRModal({ type, onClose, gdprAction, onDownload }) {
  const [form, setForm]     = useState({ company:'', email:'', name:'', additional_info:'' });
  const [state, setState]   = useState({ loading:false, result:null, error:null });

  const titles = { access:'Generate Access Request', deletion:'Generate Deletion Request', export:'Generate Export Request' };

  const submit = async (e) => {
    e.preventDefault();
    setState({ loading:true, result:null, error:null });
    try {
      const res = await gdprAction(type, form);
      setState({ loading:false, result:res, error:null });
    } catch(err) {
      setState({ loading:false, result:null, error:err.message });
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'16px' }}>
      <div style={{ background:'#0f172a', border:'1px solid rgba(148,163,184,0.15)', borderRadius:'16px', padding:'28px', width:'100%', maxWidth:'560px', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <h3 style={{ margin:0 }}>{titles[type]}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#94a3b8', fontSize:'1.4rem', cursor:'pointer' }}>×</button>
        </div>

        {!state.result ? (
          <form onSubmit={submit}>
            {[['company','Company / Organisation *','text',true],['email','Your Email *','email',true],['name','Your Full Name','text',false],['additional_info','Additional Info (optional)','text',false]].map(([k,ph,t,req])=>(
              <div key={k}>
                <p style={S.label}>{ph}</p>
                <input required={req} type={t} style={S.input} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={ph} />
              </div>
            ))}
            {state.error && <p style={{ color:'#f87171', marginBottom:'12px', fontSize:'0.85rem' }}>⚠ {state.error}</p>}
            <div style={{ display:'flex', gap:'10px' }}>
              <button type="submit" disabled={state.loading} style={{ ...S.btnPrimary, opacity:state.loading?0.6:1 }}>
                {state.loading ? 'Generating…' : 'Generate Letter'}
              </button>
              <button type="button" onClick={onClose} style={S.btnGhost}>Cancel</button>
            </div>
          </form>
        ) : (
          <div>
            <p style={{ color:'#4ade80', marginBottom:'12px' }}>✅ Letter generated {state.result.source === 'local' ? '(offline)' : 'via AI engine'}</p>
            <p style={S.label}>Subject: <strong style={{ color:'#f8fafc' }}>{state.result.subject}</strong></p>
            <textarea readOnly value={state.result.template} style={{ ...S.input, height:'260px', resize:'vertical', fontFamily:'monospace', fontSize:'0.8rem', marginTop:'10px' }} />
            <div style={{ display:'flex', gap:'10px', marginTop:'8px' }}>
              <button style={S.btnPrimary} onClick={()=>onDownload(state.result.template, `gdpr-${type}-${Date.now()}.txt`)}>⬇ Download</button>
              <button style={S.btnGhost} onClick={()=>navigator.clipboard?.writeText(state.result.template)}>Copy</button>
              <button style={S.btnGhost} onClick={()=>setState({ loading:false, result:null, error:null })}>New Request</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Policy Analyzer ───────────────────────────────────────────────────────────
function PolicyAnalyzer({ analyzePolicy }) {
  const [text, setText]   = useState('');
  const [state, setState] = useState({ loading:false, result:null, error:null });

  const run = async () => {
    if (!text.trim()) return;
    setState({ loading:true, result:null, error:null });
    try {
      const r = await analyzePolicy(text);
      setState({ loading:false, result:r, error:null });
    } catch(e) {
      setState({ loading:false, result:null, error: e.message.includes('not loaded') ? 'Page must be opened from the extension.' : e.message });
    }
  };

  const riskColor = (score) => score >= 61 ? '#ef4444' : score >= 31 ? '#f59e0b' : '#22c55e';

  return (
    <div style={S.card}>
      <h3 style={{ margin:'0 0 4px' }}>🔍 Privacy Policy Analyzer</h3>
      <p style={{ ...S.label, marginBottom:'14px' }}>Paste any privacy policy text to get an instant risk assessment.</p>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={6} placeholder="Paste privacy policy text here…" style={{ ...S.input, resize:'vertical' }} />
      <button style={{ ...S.btnPrimary, marginBottom:'16px' }} disabled={state.loading || !text.trim()} onClick={run}>
        {state.loading ? 'Analyzing…' : 'Analyze Policy'}
      </button>

      {state.error && <p style={{ color:'#f87171' }}>⚠ {state.error}</p>}

      {state.result && (() => {
        const r = state.result;
        return (
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'16px', marginBottom:'16px' }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:'2.5rem', fontWeight:700, color:riskColor(r.risk_score) }}>{r.risk_score}</div>
                <div style={S.label}>Risk Score / 100</div>
              </div>
              <div>
                <span style={{ ...S.badge(riskColor(r.risk_score)), fontSize:'0.9rem', padding:'5px 14px', textTransform:'uppercase' }}>{r.classification}</span>
                <p style={{ margin:'8px 0 0', color:'#cbd5e1', fontSize:'0.85rem', maxWidth:'380px' }}>{r.summary}</p>
              </div>
            </div>

            {r.red_flags?.length > 0 && (
              <div style={{ marginBottom:'14px' }}>
                <p style={{ ...S.label, marginBottom:'8px' }}>🚩 Red Flags ({r.red_flags.length})</p>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                  {r.red_flags.map((f,i)=>(
                    <span key={i} style={S.badge(f.severity==='critical'?'#7f1d1d':f.severity==='high'?'#9a3412':f.severity==='medium'?'#92400e':'#374151')}>{f.label}</span>
                  ))}
                </div>
              </div>
            )}

            {r.recommendations?.length > 0 && (
              <div>
                <p style={{ ...S.label, marginBottom:'8px' }}>💡 Recommendations</p>
                <ul style={{ margin:0, paddingLeft:'18px', color:'#cbd5e1', fontSize:'0.85rem', lineHeight:1.7 }}>
                  {r.recommendations.map((rec,i)=><li key={i}>{rec}</li>)}
                </ul>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
const Dashboard = () => {
  const {
    stats, trackerData, cookieData, timeline, settings, topDomains,
    clearHistory, exportData, gdprAction, analyzePolicy, updateSettings,
    isLoading, isDemoMode, enableDemoMode, disableDemoMode,
    getPersistenceMetrics,
  } = usePrivacyData();

  // After isLoading === false, stats/settings/topDomains are guaranteed non-null
  // (they are null only during load, which the skeleton gate already blocks).
  // We still provide object/array defaults here as a last-resort safety net
  // for unexpected edge cases (e.g. storage read returning nothing at all).
  const safeStats      = stats      ?? { trackers: 0, cookies: 0, fingerprint: 0, privacyScore: 0 };
  const safeSettings   = settings   ?? chromeStorageService._defaultSettings();
  const safeTopDomains = topDomains ?? [];
  const safeTimeline   = timeline   ?? [];
  const safeTrackerData = trackerData ?? [];
  const safeCookieData  = cookieData  ?? [];

  const [activeTab, setActiveTab] = useState('overview');
  const [modal, setModal]         = useState(null);
  const [toast, setToast]         = useState(null);
  const [metrics, setMetrics]     = useState(null);  // Persistence layer health metrics

  // Load metrics when settings tab is opened
  React.useEffect(() => {
    if (activeTab === 'settings' && getPersistenceMetrics) {
      getPersistenceMetrics().then(m => { if (m) setMetrics(m); }).catch(() => {});
    }
  }, [activeTab, getPersistenceMetrics]);

  const showToast = (msg, type='ok') => {
    setToast({ msg, type });
    setTimeout(()=>setToast(null), 3500);
  };

  const handleClearHistory = async () => {
    if (!confirm('Clear all stored tracker data? This cannot be undone.')) return;
    await clearHistory();
    showToast('✅ Tracker history cleared.');
  };

  const handleExport = async () => {
    try { await exportData(); showToast('✅ Data exported successfully.'); }
    catch(e) { showToast('⚠ Export failed: ' + e.message, 'err'); }
  };

  const handleDownload = (content, filename) => {
    if (window.GDPRAssistant) window.GDPRAssistant.downloadText(content, filename);
  };

  const renderEmpty = (msg, hint) => (
    <div style={{ textAlign:'center', padding:'32px 16px', color:'#94a3b8' }}>
      <p style={{ fontSize:'1.5rem', marginBottom:8 }}>🔍</p>
      <p style={{ margin:'0 0 6px', color:'#f8fafc', fontWeight:500 }}>{msg}</p>
      {hint && <p style={{ margin:0, fontSize:'0.82rem' }}>{hint}</p>}
    </div>
  );

  const wrap = { width:'min(1200px,calc(100% - 32px))', margin:'0 auto', padding:'32px 0', fontFamily:'Inter,system-ui,sans-serif', color:'#f8fafc', minHeight:'100vh' };

  // Score colour uses the exact stored privacyScore — no fallback masking.
  // privacyScore of 0 is a real value meaning "very high risk".
  const privacyScore = safeStats.privacyScore;
  const scoreColor   = privacyScore >= 80 ? '#22c55e' : privacyScore >= 50 ? '#f59e0b' : '#ef4444';

  // ── Skeleton loader ──────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div style={{ width:'min(1200px,calc(100% - 32px))', margin:'0 auto', padding:'32px 0', fontFamily:'Inter,system-ui,sans-serif' }}>
      <div style={{ ...S.skeleton, height:48, marginBottom:24, width:'60%' }}/>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[1,2,3,4].map(i => <div key={i} style={{ ...S.skeleton, height:88, borderRadius:22 }}/>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
        <div style={{ ...S.skeleton, height:220, borderRadius:16 }}/>
        <div style={{ ...S.skeleton, height:220, borderRadius:16 }}/>
      </div>
    </div>
  );

  const STAT_CARDS = [
    { icon:'👁️', label:'Trackers Blocked',   value: safeStats.trackers },
    { icon:'🍪', label:'Cookies Detected',    value: safeStats.cookies },
    { icon:'⚠️', label:'Fingerprint Alerts', value: safeStats.fingerprint },
    { icon:'🛡️', label:'Privacy Score',       value:`${Math.round(privacyScore)}/100`, color: scoreColor },
  ];


  return (
    <div style={wrap}>
      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:'20px', right:'20px', zIndex:2000, background: toast.type==='err'?'#7f1d1d':'#14532d', border:`1px solid ${toast.type==='err'?'#ef4444':'#22c55e'}`, borderRadius:'10px', padding:'12px 18px', color:'white', fontWeight:500 }}>
          {toast.msg}
        </div>
      )}

      {/* GDPR Modal */}
      {modal && <GDPRModal type={modal} onClose={()=>setModal(null)} gdprAction={gdprAction} onDownload={handleDownload} />}

      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div style={{ background:'linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.05))', border:'1px solid rgba(245,158,11,0.4)', borderRadius:'12px', padding:'12px 18px', marginBottom:'20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color:'#fbbf24', fontWeight:500 }}>🎭 Demo Mode — showing sample data. Real tracker storage is untouched.</span>
          <button style={{ ...S.btnGhost, fontSize:'0.8rem', padding:'6px 14px' }} onClick={disableDemoMode}>Exit Demo</button>
        </div>
      )}

      {/* Header */}
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'24px', marginBottom:'24px' }}>
        <div>
          <h1 style={{ margin:'0 0 6px', fontSize:'clamp(1.8rem,2.5vw,2.5rem)' }}>Privacy Intelligence Dashboard</h1>
          <p style={{ margin:0, color:'#cbd5e1', maxWidth:'540px' }}>Real-time tracker detection, cookie analysis, GDPR tools, and policy risk scoring.</p>
        </div>
        <div style={{ display:'flex', gap:'10px', flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
          {!isDemoMode && <button onClick={enableDemoMode} style={{ ...S.btnGhost, fontSize:'0.8rem', padding:'8px 14px' }}>🎭 Demo Mode</button>}
          <button onClick={handleExport} style={S.btnPrimary}>⬇ Export Data</button>
          <button onClick={handleClearHistory} style={S.btnGhost}>🗑 Clear History</button>
        </div>
      </header>

      {/* Stat Cards */}
      <section style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:'16px', marginBottom:'24px' }}>
        {STAT_CARDS.map(({ icon, label, value, color }) => (
          <article key={label} style={{ display:'flex', alignItems:'center', gap:'14px', padding:'20px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(148,163,184,0.08)', borderRadius:'22px' }}>
            <div style={{ width:'52px', height:'52px', display:'grid', placeItems:'center', background:'rgba(99,102,241,0.12)', borderRadius:'16px', fontSize:'1.2rem' }}>{icon}</div>
            <div>
              <p style={{ margin:'0 0 4px', color:'#94a3b8', fontSize:'0.85rem' }}>{label}</p>
              <h2 style={{ margin:0, color: color || '#f8fafc' }}>{value}</h2>
            </div>
          </article>
        ))}
      </section>

      {/* Tab Nav */}
      <nav style={{ display:'flex', gap:'4px', marginBottom:'24px', borderBottom:'1px solid rgba(148,163,184,0.2)', paddingBottom:'1px', flexWrap:'wrap' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={()=>setActiveTab(tab)} style={{ padding:'10px 18px', border:'none', borderRadius:'8px 8px 0 0', background: activeTab===tab?'linear-gradient(135deg,#6366f1,#0ea5e9)':'#1f2937', color:'white', cursor:'pointer', fontWeight:600, textTransform:'capitalize', fontSize:'0.85rem' }}>
            {tab}
          </button>
        ))}
      </nav>

      {/* ── Overview ── */}
      {activeTab==='overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'24px' }}>
          <div style={S.card}>
            <h3 style={{ margin:'0 0 16px' }}>Tracker Distribution</h3>
            {safeTrackerData.length === 0 ? renderEmpty('No trackers detected yet', 'Browse the web and trackers will appear here.') : (
              <div style={{ display:'flex', alignItems:'center', gap:'20px' }}>
                <ResponsiveContainer width={180} height={180}>
                  <PieChart><Pie data={safeTrackerData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} dataKey="value">
                    {safeTrackerData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                  </Pie><Tooltip/></PieChart>
                </ResponsiveContainer>
                <ul style={{ listStyle:'none', padding:0, margin:0 }}>
                  {safeTrackerData.map((d,i)=>(
                    <li key={i} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                      <span style={{ width:10, height:10, background:d.color, borderRadius:2, flexShrink:0 }}/>
                      <span style={{ fontSize:'0.85rem' }}>{d.name}</span>
                      <span style={{ marginLeft:'auto', color:'#94a3b8', fontSize:'0.85rem' }}>{d.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div style={S.card}>
            <h3 style={{ margin:'0 0 16px' }}>Cookie Breakdown</h3>
            {safeCookieData.length===0 ? renderEmpty('No cookies detected', 'Navigate to an http/https website to classify cookies.') : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={safeCookieData}><CartesianGrid strokeDasharray="3 3" stroke="#374151"/><XAxis dataKey="name" stroke="#94a3b8" fontSize={11}/><YAxis stroke="#94a3b8"/><Tooltip/>
                  <Bar dataKey="value">{safeCookieData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── Trackers ── */}
      {activeTab==='trackers' && (
        <div style={S.card}>
          <h3 style={{ margin:'0 0 8px' }}>Trackers Detected</h3>
          <p style={{ ...S.label, marginBottom:'16px' }}>Accumulated across all visited websites.</p>
          {safeTrackerData.length===0 ? renderEmpty('No trackers detected yet', 'Browse the web with the extension active.') : (
            <ul style={{ listStyle:'none', padding:0, margin:0 }}>
              {safeTrackerData.map((d,i)=>(
                <li key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px', background:'rgba(255,255,255,0.03)', borderRadius:'8px', marginBottom:'8px' }}>
                  <span>{d.name} trackers</span>
                  <span style={S.badge(d.color)}>{d.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Cookies ── */}
      {activeTab==='cookies' && (
        <div style={S.card}>
          <h3 style={{ margin:'0 0 8px' }}>Cookie Categories</h3>
          <p style={{ ...S.label, marginBottom:'16px' }}>Classified from your current active tab.</p>
          {safeCookieData.length===0 ? renderEmpty('No cookies detected', 'Navigate to an http/https page to see cookie data.') : (
            <ul style={{ listStyle:'none', padding:0, margin:0 }}>
              {safeCookieData.map((d,i)=>(
                <li key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px', background:'rgba(255,255,255,0.03)', borderRadius:'8px', marginBottom:'8px' }}>
                  <span>{d.name}</span>
                  <span style={S.badge(d.color)}>{d.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Timeline ── */}
      {activeTab==='timeline' && (
        <div style={S.card}>
          <h3 style={{ margin:'0 0 16px' }}>7-Day Tracker Activity</h3>
          {safeTimeline.length === 0 ? renderEmpty('No timeline data', 'Visit websites over several days to populate the chart.') : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={safeTimeline}><CartesianGrid strokeDasharray="3 3" stroke="#374151"/><XAxis dataKey="day" stroke="#94a3b8"/><YAxis stroke="#94a3b8"/><Tooltip/>
              <Line type="monotone" dataKey="trackers" stroke="#6366f1" strokeWidth={2} dot={{ fill:'#6366f1' }}/>
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ── Sites ── */}
      {activeTab==='sites' && (
        <div style={S.card}>
          <h3 style={{ margin:'0 0 4px' }}>Top Tracked Domains</h3>
          <p style={{ ...S.label, marginBottom:'16px' }}>Domains with most accumulated trackers.</p>
          {safeTopDomains.length===0
            ? renderEmpty('No site data yet', 'Visit some websites and the dashboard will update automatically.')
            : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
                <thead>
                  <tr style={{ color:'#94a3b8', textAlign:'left', borderBottom:'1px solid rgba(148,163,184,0.15)' }}>
                    {['Domain','Trackers','Categories','Last Seen'].map(h=><th key={h} style={{ padding:'10px 12px', fontWeight:500 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {safeTopDomains.map((d,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid rgba(148,163,184,0.07)' }}>
                      <td style={{ padding:'10px 12px', fontWeight:500 }}>{d.domain}</td>
                      <td style={{ padding:'10px 12px' }}><span style={S.badge(d.count>10?'#ef4444':d.count>4?'#f59e0b':'#6366f1')}>{d.count}</span></td>
                      <td style={{ padding:'10px 12px', color:'#94a3b8' }}>{Object.keys(d.categories||{}).join(', ') || '—'}</td>
                      <td style={{ padding:'10px 12px', color:'#94a3b8' }}>{d.lastSeen ? new Date(d.lastSeen).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── GDPR ── */}
      {activeTab==='gdpr' && (
        <div>
          <div style={S.card}>
            <h3 style={{ margin:'0 0 8px' }}>GDPR Request Generator</h3>
            <p style={{ ...S.label, marginBottom:'18px' }}>Generate legally structured GDPR letters — sent to companies via email.</p>
            <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
              {[['access','📋 Access Request','Request all data held about you'],['deletion','🗑 Deletion Request','Exercise your right to be forgotten'],['export','📦 Export Request','Get your data in a portable format']].map(([type,label,desc])=>(
                <button key={type} onClick={()=>setModal(type)} style={{ ...S.btnGhost, display:'flex', flexDirection:'column', alignItems:'flex-start', padding:'16px', gap:'4px', flex:'1 1 200px' }}>
                  <span style={{ fontWeight:700 }}>{label}</span>
                  <span style={{ color:'#94a3b8', fontSize:'0.8rem', fontWeight:400 }}>{desc}</span>
                </button>
              ))}
            </div>
          </div>
          <PolicyAnalyzer analyzePolicy={analyzePolicy} />
        </div>
      )}

      {/* ── Settings ── */}
      {activeTab==='settings' && (
        <div style={S.card}>
          <h3 style={{ margin:'0 0 4px' }}>Extension Settings</h3>
          <p style={{ ...S.label, marginBottom:'20px' }}>Changes are saved immediately to storage.</p>
          {[
            ['blockTrackers',      '🚫 Block Trackers',       'Block known tracker domains via declarativeNetRequest'],
            ['blockAds',           '🚫 Block Ads',             'Block advertising and retargeting networks'],
            ['blockAnalytics',     '📊 Block Analytics',       'Block analytics scripts (Google Analytics, Mixpanel, etc.)'],
            ['blockFingerprinting','🔍 Block Fingerprinting',  'Intercept and alert on fingerprinting API calls'],
            ['autoCleanCookies',   '🍪 Auto-Clean Cookies',    'Automatically remove non-essential cookies on page load'],
            ['showBadge',          '🔢 Show Badge Counter',    'Display blocked tracker count on extension icon'],
            ['showNotifications',  '🔔 Show Notifications',    'Show browser notifications for high-risk detections'],
          ].map(([key, label, desc])=>(
            <div key={key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0', borderBottom:'1px solid rgba(148,163,184,0.08)' }}>
              <div>
                <p style={{ margin:0, fontWeight:500 }}>{label}</p>
                <p style={{ ...S.label, margin:'2px 0 0' }}>{desc}</p>
              </div>
              <div
                onClick={()=>updateSettings({ ...safeSettings, [key]:!safeSettings[key] })}
                style={{ width:44, height:24, borderRadius:12, background:safeSettings[key]?'#6366f1':'#374151', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}
              >
                <div style={{ position:'absolute', top:3, left:safeSettings[key]?22:3, width:18, height:18, borderRadius:'50%', background:'white', transition:'left 0.2s' }}/>
              </div>
            </div>
          ))}
          <div style={{ marginTop:'20px' }}>
            <p style={{ margin:'0 0 4px', fontWeight:500 }}>Backend URL</p>
            <p style={{ ...S.label, marginBottom:'8px' }}>URL for the local Flask AI engine</p>
            <input
              type="text" style={S.input} value={safeSettings.backendUrl || ''}
              onChange={e=>updateSettings({ ...safeSettings, backendUrl:e.target.value })}
              placeholder="http://127.0.0.1:5000"
            />
          </div>

          {/* ── Storage Health ── */}
          <div style={{ marginTop:'28px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
              <div>
                <p style={{ margin:0, fontWeight:600, fontSize:'1rem' }}>⚙️ Storage Health</p>
                <p style={{ ...S.label, margin:'2px 0 0' }}>Live metrics from the Persistence layer</p>
              </div>
              <button
                style={{ ...S.btnGhost, fontSize:'0.78rem', padding:'6px 12px' }}
                onClick={() => getPersistenceMetrics().then(m => { if (m) setMetrics(m); }).catch(()=>{})}
              >↻ Refresh</button>
            </div>
            {!metrics
              ? <p style={{ color:'#94a3b8', fontSize:'0.85rem' }}>Metrics not available in this context.</p>
              : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:'12px' }}>
                {[
                  ['💾 Cache Domains',   metrics.cacheSize,            null],
                  ['✅ Flush Count',      metrics.flushCount,           null],
                  ['⚡ Avg Write',       `${metrics.avgWriteMs} ms`,   metrics.avgWriteMs > 200 ? '#f59e0b' : '#22c55e'],
                  ['📋 Max Queue',       metrics.maxQueueSize,          metrics.maxQueueSize > 20 ? '#ef4444' : null],
                  ['🔧 Auto-repaired',   metrics.repairedRecords,       metrics.repairedRecords > 0 ? '#f59e0b' : null],
                  ['❌ Failed Writes',   metrics.failedFlushes,         metrics.failedFlushes > 0 ? '#ef4444' : null],
                  ['🕐 Dirty Queue',     metrics.currentDirtySize,      metrics.currentDirtySize > 0 ? '#f59e0b' : null],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${color ? color+'33' : 'rgba(148,163,184,0.1)'}`, borderRadius:'10px', padding:'12px 14px' }}>
                    <p style={{ margin:'0 0 4px', fontSize:'0.78rem', color:'#94a3b8' }}>{label}</p>
                    <p style={{ margin:0, fontWeight:700, fontSize:'1.1rem', color: color || '#f8fafc' }}>{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            )}
            {metrics?.lastError && (
              <div style={{ marginTop:'12px', padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'8px' }}>
                <p style={{ margin:0, fontSize:'0.82rem', color:'#fca5a5' }}>⚠ Last error: {metrics.lastError}</p>
              </div>
            )}
            {metrics?.lastFlushAt && (
              <p style={{ ...S.label, marginTop:'10px', fontSize:'0.78rem' }}>
                Last flush: {new Date(metrics.lastFlushAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;