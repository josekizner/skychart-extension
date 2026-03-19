import { useState, useEffect, useCallback } from "react";

const ease = "cubic-bezier(0.22,1,0.36,1)";

const T = {
  dark: {
    bg: "#080B12", bgAlt: "#0C1019", surface: "#111620", surfaceR: "#161C28",
    hover: "#1A2234", border: "#1E2738", borderA: "#2A3548",
    tx: "#E8ECF2", tx2: "#94A3B8", txM: "#546380", txD: "#2D3A50",
    acc: "#F59E0B", accH: "#FBBF24", accG: "rgba(245,158,11,0.08)", accB: "rgba(245,158,11,0.2)",
    cyan: "#22D3EE", cyanG: "rgba(34,211,238,0.1)",
    grn: "#10B981", grnG: "rgba(16,185,129,0.1)",
    red: "#EF4444", redG: "rgba(239,68,68,0.1)",
    prp: "#A78BFA", prpG: "rgba(167,139,250,0.1)",
    pnk: "#F472B6", pnkG: "rgba(244,114,182,0.1)",
    org: "#F97316", orgG: "rgba(249,115,22,0.1)",
    sh: "0 1px 3px rgba(0,0,0,0.4)",
    face: "#1E293B", shell: "#64748B", inner: "#334155",
    vA: "#F59E0B", vB: "#D97706", vL: "#FDE68A",
  },
  light: {
    bg: "#F3F2ED", bgAlt: "#ECEAE4", surface: "#FFFFFF", surfaceR: "#FAFAF6",
    hover: "#F0EFE9", border: "#DDD9D0", borderA: "#CCC8BF",
    tx: "#1A1A18", tx2: "#57564E", txM: "#8A8980", txD: "#C0BFB8",
    acc: "#C77D05", accH: "#A86A04", accG: "rgba(199,125,5,0.06)", accB: "rgba(199,125,5,0.2)",
    cyan: "#0891B2", cyanG: "rgba(8,145,178,0.07)",
    grn: "#059669", grnG: "rgba(5,150,105,0.07)",
    red: "#DC2626", redG: "rgba(220,38,38,0.07)",
    prp: "#7C3AED", prpG: "rgba(124,58,237,0.07)",
    pnk: "#DB2777", pnkG: "rgba(219,39,119,0.07)",
    org: "#EA580C", orgG: "rgba(234,88,12,0.07)",
    sh: "0 1px 2px rgba(0,0,0,0.05)",
    face: "#CBD5E1", shell: "#475569", inner: "#94A3B8",
    vA: "#D97706", vB: "#B45309", vL: "#FDE68A",
  }
};

/* ── LOGO ── */
function Logo({ s = 36, t, id = "l", pulse = false }) {
  return (
    <svg width={s} height={s} viewBox="0 0 120 120" fill="none">
      <defs>
        <linearGradient id={`v${id}`} x1="30" y1="50" x2="90" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor={t.vA}/><stop offset="1" stopColor={t.vB}/>
        </linearGradient>
        <filter id={`g${id}`}><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id={`gc${id}`}><feGaussianBlur stdDeviation="4.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M60 10L95 34V76L74 106H46L25 76V34Z" fill={t.inner} stroke={t.shell} strokeWidth="1.2"/>
      <path d="M60 20L86 40V70L69 96H51L34 70V40Z" fill={t.face} stroke={t.inner} strokeWidth="0.8"/>
      <path d="M40 52L80 52L76 63H44Z" fill={`url(#v${id})`} filter={`url(#g${id})`}>
        {pulse && <animate attributeName="opacity" values="1;0.6;1" dur="3s" repeatCount="indefinite"/>}
      </path>
      <line x1="46" y1="57.5" x2="74" y2="57.5" stroke={t.vL} strokeWidth="0.7" opacity="0.4"/>
      <path d="M50 72H70L67 84H53Z" fill={t.inner}/>
      <path d="M25 44L34 41V66L25 63Z" fill={t.inner}/><path d="M95 44L86 41V66L95 63Z" fill={t.inner}/>
      <path d="M56 10L60 3L64 10" stroke={t.vA} strokeWidth="1.5" fill="none" filter={`url(#g${id})`}/>
      <line x1="27" y1="50" x2="32" y2="50" stroke={t.vA} strokeWidth="1.5" filter={`url(#g${id})`}/>
      <line x1="88" y1="50" x2="93" y2="50" stroke={t.vA} strokeWidth="1.5" filter={`url(#g${id})`}/>
      <circle cx="60" cy="90" r="2.5" fill={t.vA} filter={`url(#gc${id})`}>
        {pulse && <animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite"/>}
      </circle>
    </svg>
  );
}

function Word({ s = 22, t }) {
  const st = { fontFamily: "'Bebas Neue',sans-serif", fontSize: s, letterSpacing: "0.12em", lineHeight: 1 };
  return <span><span style={{ ...st, color: t.tx }}>AT</span><span style={{ ...st, color: t.acc }}>O</span><span style={{ ...st, color: t.tx }}>M</span></span>;
}

/* ── TINY COMPONENTS ── */
function StatCard({ label, value, sub, accent, danger, t, delay = 0 }) {
  const [h, setH] = useState(false);
  const borderC = danger ? t.red : accent ? t.acc : "transparent";
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      className="fu" style={{
        animationDelay: `${delay}s`,
        padding: "16px 18px", background: t.surface, borderRadius: 10,
        border: `1px solid ${h ? t.borderA : t.border}`, borderTop: `2px solid ${borderC}`,
        boxShadow: t.sh, transition: `all 0.25s ${ease}`, cursor: "default",
        transform: h ? "translateY(-2px)" : "none",
      }}>
      <div style={{ fontSize: 9, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, letterSpacing: "0.16em", color: t.txM, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontFamily: "'Bebas Neue',sans-serif", color: danger ? t.red : accent ? t.acc : t.tx, letterSpacing: "0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, fontFamily: "'Barlow Condensed',sans-serif", color: t.txM, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Badge({ label, color, bg }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 4,
      background: bg, fontSize: 9, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700,
      color, letterSpacing: "0.1em", textTransform: "uppercase",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />{label}
    </span>
  );
}

function AgentBtn({ letter, name, desc, color, ghost, t, active }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      background: h ? t.hover : t.surface, borderRadius: 8,
      border: `1px solid ${active ? color + "40" : h ? t.borderA : t.border}`,
      cursor: "pointer", transition: `all 0.2s ${ease}`, minWidth: 0,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        background: ghost, border: `1px solid ${color}25`,
        fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, color, letterSpacing: "0.04em",
      }}>{letter}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, color: t.tx, letterSpacing: "0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ fontSize: 9, fontFamily: "'Barlow Condensed',sans-serif", color: t.txM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{desc}</div>
      </div>
    </div>
  );
}

/* Bar chart row */
function BarRow({ label, value, max, color, t }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <span style={{ width: 90, fontSize: 10, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 500, color: t.tx2, textAlign: "right", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <div style={{ flex: 1, height: 18, background: t.bgAlt, borderRadius: 4, overflow: "hidden", position: "relative" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: `width 0.8s ${ease}`, display: "flex", alignItems: "center", paddingLeft: 8 }}>
          <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>{value}</span>
        </div>
      </div>
    </div>
  );
}

/* ── TABLE ── */
function TH({ children, t, w }) {
  return <th style={{ padding: "8px 12px", fontSize: 9, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, letterSpacing: "0.14em", color: t.txM, textTransform: "uppercase", textAlign: "left", width: w, borderBottom: `1px solid ${t.border}` }}>{children}</th>;
}
function TD({ children, t, acc, mono }) {
  return <td style={{ padding: "8px 12px", fontSize: 11, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: acc ? 600 : 400, color: acc ? t.acc : t.tx2, letterSpacing: mono ? "0.04em" : "0.01em" }}>{children}</td>;
}

/* ── SECTION PANEL ── */
function Panel({ title, icon, t, children, noPad, action }) {
  return (
    <div style={{
      background: t.surface, borderRadius: 10, border: `1px solid ${t.border}`,
      boxShadow: t.sh, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 18px", borderBottom: `1px solid ${t.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>{icon}</span>
          <span style={{ fontSize: 12, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, letterSpacing: "0.1em", color: t.tx, textTransform: "uppercase" }}>{title}</span>
        </div>
        {action && <div>{action}</div>}
      </div>
      <div style={noPad ? {} : { padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

/* ── SIDEBAR ── */
function Sidebar({ t, collapsed, onToggle }) {
  const agents = [
    { l: "C", n: "Câmbio", d: "Extração de PDF", c: t.acc, g: t.accG },
    { l: "S", n: "Serasa", d: "Score & crédito", c: t.cyan, g: t.cyanG },
    { l: "F", n: "Frete", d: "Análise de mercado", c: t.grn, g: t.grnG },
    { l: "T", n: "Tracking", d: "Rastreio Maersk", c: t.prp, g: t.prpG },
    { l: "Q", n: "Cotação", d: "Outlook & ofertas", c: t.org, g: t.orgG },
    { l: "V", n: "Chequeio Op", d: "Oferta vs Custos", c: t.cyan, g: t.cyanG },
    { l: "V", n: "Chequeio Fin", d: "Oferta vs Itens", c: t.grn, g: t.grnG },
    { l: "I", n: "Frequência", d: "Inside Sales Intel", c: t.pnk, g: t.pnkG },
    { l: "B", n: "Booking", d: "Email → Skychart", c: t.prp, g: t.prpG },
    { l: "D", n: "Demurrage", d: "Free Time Control", c: t.red, g: t.redG },
  ];
  
  return (
    <div style={{
      width: collapsed ? 56 : 230, flexShrink: 0, height: "100vh", position: "sticky", top: 0,
      background: t.surface, borderRight: `1px solid ${t.border}`,
      display: "flex", flexDirection: "column", transition: `width 0.35s ${ease}`, overflow: "hidden",
    }}>
      {/* Logo area */}
      <div style={{
        padding: collapsed ? "16px 12px" : "16px 16px", borderBottom: `1px solid ${t.border}`,
        display: "flex", alignItems: "center", gap: 10, minHeight: 60,
      }}>
        <Logo s={collapsed ? 30 : 32} t={t} id="sb" pulse />
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <Word s={18} t={t} />
            <div style={{ fontSize: 8, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, letterSpacing: "0.18em", color: t.txM, textTransform: "uppercase", marginTop: 1 }}>MOND SHIPPING</div>
          </div>
        )}
      </div>

      {/* Agents */}
      <div style={{ flex: 1, overflow: "auto", padding: collapsed ? "8px 6px" : "10px 10px" }}>
        {!collapsed && <div style={{ fontSize: 9, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, letterSpacing: "0.18em", color: t.txM, textTransform: "uppercase", padding: "6px 4px 8px", marginBottom: 2 }}>AGENTES</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {agents.map((a, i) => collapsed ? (
            <div key={i} title={a.n} style={{
              width: 36, height: 36, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto",
              background: a.g, border: `1px solid ${a.c}20`, fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, color: a.c, cursor: "pointer",
            }}>{a.l}</div>
          ) : (
            <AgentBtn key={i} letter={a.l} name={a.n} desc={a.d} color={a.c} ghost={a.g} t={t} />
          ))}
        </div>
      </div>

      {/* Bottom */}
      <div style={{ padding: collapsed ? "10px 6px" : "12px 14px", borderTop: `1px solid ${t.border}` }}>
        {!collapsed && (
          <div style={{
            padding: "10px 12px", background: t.accG, borderRadius: 8, border: `1px solid ${t.accB}`,
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8,
          }}>
            <span style={{ fontSize: 14 }}>📊</span>
            <span style={{ fontSize: 11, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, letterSpacing: "0.08em", color: t.acc, textTransform: "uppercase" }}>ATOM Intelligence</span>
          </div>
        )}
        <button onClick={onToggle} style={{
          width: "100%", padding: "8px", borderRadius: 6, background: t.bgAlt, border: `1px solid ${t.border}`,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10, fontWeight: 600, color: t.txM, letterSpacing: "0.08em",
        }}>
          {collapsed ? "→" : "← RECOLHER"}
        </button>
      </div>
    </div>
  );
}

/* ── MAIN ── */
export default function AtomDashboard() {
  const [mode, setMode] = useState("dark");
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const t = T[mode];
  const dk = mode === "dark";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: t.bg, transition: `background 0.4s ${ease}` }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${t.border};border-radius:3px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scan{0%{top:-5%}100%{top:105%}}
        .fu{animation:fadeUp 0.5s ${ease} both}
      `}</style>

      {/* Scan line - dark only */}
      {dk && <div style={{ position: "fixed", left: 0, right: 0, height: 1, zIndex: 50, pointerEvents: "none", background: `linear-gradient(90deg,transparent,${t.acc}25,transparent)`, animation: "scan 6s linear infinite" }} />}

      {/* Grid bg */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: dk ? 0.02 : 0.035, backgroundImage: `linear-gradient(${t.txM} 1px,transparent 1px),linear-gradient(90deg,${t.txM} 1px,transparent 1px)`, backgroundSize: "60px 60px" }} />

      <Sidebar t={t} collapsed={sideCollapsed} onToggle={() => setSideCollapsed(p => !p)} />

      {/* Main content */}
      <div style={{ flex: 1, position: "relative", zIndex: 1, overflow: "auto" }}>
        {/* Top bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 28px", borderBottom: `1px solid ${t.border}`, background: t.surface,
          position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(12px)",
        }}>
          <div>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: "0.08em", color: t.tx }}>ATOM INTELLIGENCE</span>
            <span style={{ fontSize: 10, fontFamily: "'Barlow Condensed',sans-serif", color: t.txM, marginLeft: 10, letterSpacing: "0.06em" }}>CENTRO DE COMANDO</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Badge label="3 AGENTES ATIVOS" color={t.grn} bg={t.grnG} />
            <Badge label="VERSÃO 2.9" color={t.tx2} bg={t.bgAlt} />
            {/* Theme toggle */}
            <button onClick={() => setMode(m => m === "dark" ? "light" : "dark")} style={{
              width: 36, height: 20, borderRadius: 10, cursor: "pointer", border: `1px solid ${t.border}`,
              background: dk ? t.bgAlt : t.border, position: "relative", transition: `all 0.3s ${ease}`, flexShrink: 0,
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: 7, background: t.acc,
                position: "absolute", top: 2, left: dk ? 2 : 18, transition: `left 0.3s ${ease}`,
              }} />
            </button>
            <span style={{ fontSize: 12 }}>{dk ? "🌙" : "☀️"}</span>
          </div>
        </div>

        <div style={{ padding: "24px 28px" }}>
          {/* ── STAT CARDS ROW 1 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 12 }}>
            <StatCard label="Total de Eventos" value="103" sub="Ações registradas por todos os agentes" accent t={t} delay={0.05} />
            <StatCard label="Chequeios" value="21" sub="Precisão média: 63%" t={t} delay={0.1} />
            <StatCard label="Processos Resolvidos" value="5" sub="Containers devolvidos (demurrage)" t={t} delay={0.15} />
            <StatCard label="Emails Processados" value="0" sub="0 cotações, 5 bookings" t={t} delay={0.2} />
          </div>

          {/* ── STAT CARDS ROW 2 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
            <StatCard label="Expirados" value="8" sub="Free time vencido" danger t={t} delay={0.1} />
            <StatCard label="Em Alerta" value="1" sub="Próximos do vencimento" t={t} delay={0.15} />
            <StatCard label="Clientes Serasa" value="1" sub="Scores consultados" t={t} delay={0.2} />
            <StatCard label="Total Demurrage" value="54" sub="Processos ativos no controle" t={t} delay={0.25} />
          </div>

          {/* ── EXTENSIONS ── */}
          <div className="fu" style={{ animationDelay: "0.15s", marginBottom: 24 }}>
            <Panel title="Extensões Ativas" icon="⚡" t={t} noPad
              action={<span style={{ fontSize: 9, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, letterSpacing: "0.1em", color: t.acc }}>VERSÃO ATUAL: 2.9</span>}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <TH t={t}>Usuário</TH><TH t={t} w="80px">Versão</TH><TH t={t}>Perfil</TH><TH t={t}>Última Atividade</TH>
                </tr></thead>
                <tbody>
                  {[
                    { u: "José Kizner", v: "2.9", p: "financeiro-demurrage", a: "agora" },
                    { u: "José Kizner", v: "2.9", p: "financeiro", a: "1 min atrás" },
                    { u: "José Kizner", v: "2.9", p: "master", a: "1 min atrás" },
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${t.border}` }}>
                      <TD t={t}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.grn, flexShrink: 0 }} />
                          {r.u}
                        </span>
                      </TD>
                      <TD t={t} acc>{r.v}</TD>
                      <TD t={t}>{r.p}</TD>
                      <TD t={t}>{r.a}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          {/* ── RANKING + SERASA ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div className="fu" style={{ animationDelay: "0.2s" }}>
              <Panel title="Ranking de Armadores" icon="🏆" t={t}>
                {[
                  { l: "MSK — Maersk", v: 27, c: t.acc },
                  { l: "CMA CGM", v: 10, c: t.prp },
                  { l: "CSSC — Transhi...", v: 5, c: t.cyan },
                  { l: "EMC — Evergreen", v: 3, c: t.grn },
                  { l: "PIL — Pacific Inte...", v: 3, c: t.grn },
                  { l: "HMM — Hyundai", v: 2, c: t.org },
                  { l: "COSCO", v: 1, c: t.pnk },
                  { l: "ONE — Ocean N...", v: 1, c: t.pnk },
                ].map((r, i) => <BarRow key={i} label={r.l} value={r.v} max={27} color={r.c} t={t} />)}
              </Panel>
            </div>

            <div className="fu" style={{ animationDelay: "0.25s" }}>
              <Panel title="Scores Serasa" icon="📋" t={t} noPad>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <TH t={t}>Cliente</TH><TH t={t} w="70px">Score</TH><TH t={t}>Limite</TH>
                  </tr></thead>
                  <tbody>
                    <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                      <TD t={t}>South Service Trading SA</TD>
                      <TD t={t} acc>952</TD>
                      <TD t={t}>R$ 13.296.268,00</TD>
                    </tr>
                  </tbody>
                </table>

                {/* Score visual */}
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ position: "relative", width: 56, height: 56 }}>
                      <svg width="56" height="56" viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="24" fill="none" stroke={t.border} strokeWidth="4" />
                        <circle cx="28" cy="28" r="24" fill="none" stroke={t.grn} strokeWidth="4"
                          strokeDasharray={`${(952/1000)*150.8} 150.8`} strokeLinecap="round"
                          transform="rotate(-90 28 28)" style={{ transition: `stroke-dasharray 1s ${ease}` }} />
                      </svg>
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: t.grn }}>952</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, color: t.tx, letterSpacing: "0.03em" }}>Risco Muito Baixo</div>
                      <div style={{ fontSize: 10, fontFamily: "'Barlow Condensed',sans-serif", color: t.txM }}>Score consultado via agente Serasa</div>
                    </div>
                  </div>
                </div>
              </Panel>
            </div>
          </div>

          {/* ── CHEQUEIOS + ATIVIDADE ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div className="fu" style={{ animationDelay: "0.3s" }}>
              <Panel title="Últimos Chequeios" icon="✓" t={t} noPad>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <TH t={t}>Quando</TH><TH t={t}>Módulo</TH><TH t={t}>Processo</TH><TH t={t} w="50px">Itens</TH><TH t={t} w="50px">Erros</TH><TH t={t} w="60px">Acerto</TH>
                  </tr></thead>
                  <tbody>
                    {[
                      { w: "19/03, 16:18", m: "operacional", p: "IM01114/25", i: 11, e: 0, a: "55%" },
                      { w: "19/03, 15:42", m: "financeiro", p: "IM01098/25", i: 8, e: 1, a: "87%" },
                      { w: "19/03, 14:20", m: "operacional", p: "IM01087/25", i: 14, e: 2, a: "71%" },
                    ].map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${t.border}` }}>
                        <TD t={t}>{r.w}</TD>
                        <TD t={t}><Badge label={r.m} color={r.m === "operacional" ? t.cyan : t.acc} bg={r.m === "operacional" ? t.cyanG : t.accG} /></TD>
                        <TD t={t} mono>{r.p}</TD>
                        <TD t={t}>{r.i}</TD>
                        <TD t={t}><span style={{ color: r.e === 0 ? t.grn : t.red, fontWeight: 600 }}>{r.e}</span></TD>
                        <TD t={t} acc>{r.a}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>

            <div className="fu" style={{ animationDelay: "0.35s" }}>
              <Panel title="Atividade por Usuário" icon="👤" t={t}>
                {[
                  { n: "José Kizner", v: 73, c: t.acc },
                  { n: "unknown", v: 23, c: t.cyan },
                ].map((r, i) => <BarRow key={i} label={r.n} value={r.v} max={73} color={r.c} t={t} />)}

                {/* Activity sparkline area */}
                <div style={{ marginTop: 20, padding: "14px 0 0", borderTop: `1px solid ${t.border}` }}>
                  <div style={{ fontSize: 9, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, letterSpacing: "0.14em", color: t.txM, textTransform: "uppercase", marginBottom: 10 }}>ATIVIDADE ÚLTIMAS 24H</div>
                  <svg width="100%" height="48" viewBox="0 0 300 48" preserveAspectRatio="none" style={{ display: "block" }}>
                    <defs>
                      <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={t.acc} stopOpacity="0.15"/>
                        <stop offset="100%" stopColor={t.acc} stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    <path d="M0 40 L20 35 L40 38 L60 30 L80 32 L100 20 L120 25 L140 15 L160 18 L180 10 L200 8 L220 12 L240 6 L260 10 L280 5 L300 3 L300 48 L0 48 Z" fill="url(#sparkFill)" />
                    <path d="M0 40 L20 35 L40 38 L60 30 L80 32 L100 20 L120 25 L140 15 L160 18 L180 10 L200 8 L220 12 L240 6 L260 10 L280 5 L300 3" fill="none" stroke={t.acc} strokeWidth="1.5" />
                  </svg>
                </div>
              </Panel>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", borderTop: `1px solid ${t.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Logo s={20} t={t} id="ft" />
              <span style={{ fontSize: 9, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, letterSpacing: "0.14em", color: t.txD, textTransform: "uppercase" }}>ATOM · MOND SHIPPING · 2026</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 9, fontFamily: "'Barlow Condensed',sans-serif", color: t.txD, letterSpacing: "0.06em" }}>Atualização automática</span>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.grn, animation: "scan 2s ease infinite" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
