import { useState, useRef, useCallback } from "react";

const ease = "cubic-bezier(0.22,1,0.36,1)";

/* ═══════════════════════════════════════════════════
   TOKENS
   ═══════════════════════════════════════════════════ */
const T = {
  dark: {
    bg:"#080B12",bgA:"#0C1019",sf:"#111620",sfR:"#161C28",hv:"#1A2234",
    bd:"#1E2738",bdA:"#2A3548",
    tx:"#E8ECF2",tx2:"#94A3B8",txM:"#546380",txD:"#2D3A50",
    acc:"#F59E0B",accH:"#FBBF24",accD:"#92400E",accG:"rgba(245,158,11,0.08)",accB:"rgba(245,158,11,0.2)",
    cy:"#22D3EE",cyG:"rgba(34,211,238,0.1)",
    gn:"#10B981",gnG:"rgba(16,185,129,0.1)",
    rd:"#EF4444",rdG:"rgba(239,68,68,0.1)",
    pr:"#A78BFA",prG:"rgba(167,139,250,0.1)",
    pk:"#F472B6",pkG:"rgba(244,114,182,0.1)",
    og:"#F97316",ogG:"rgba(249,115,22,0.1)",
    sh:"0 1px 3px rgba(0,0,0,0.4)",
    face:"#1E293B",shell:"#64748B",inner:"#334155",
    vA:"#F59E0B",vB:"#D97706",vL:"#FDE68A",
  },
  light: {
    bg:"#F3F2ED",bgA:"#ECEAE4",sf:"#FFFFFF",sfR:"#FAFAF6",hv:"#F0EFE9",
    bd:"#DDD9D0",bdA:"#CCC8BF",
    tx:"#1A1A18",tx2:"#57564E",txM:"#8A8980",txD:"#C0BFB8",
    acc:"#C77D05",accH:"#A86A04",accD:"#92400E",accG:"rgba(199,125,5,0.06)",accB:"rgba(199,125,5,0.2)",
    cy:"#0891B2",cyG:"rgba(8,145,178,0.07)",
    gn:"#059669",gnG:"rgba(5,150,105,0.07)",
    rd:"#DC2626",rdG:"rgba(220,38,38,0.07)",
    pr:"#7C3AED",prG:"rgba(124,58,237,0.07)",
    pk:"#DB2777",pkG:"rgba(219,39,119,0.07)",
    og:"#EA580C",ogG:"rgba(234,88,12,0.07)",
    sh:"0 1px 2px rgba(0,0,0,0.05)",
    face:"#CBD5E1",shell:"#475569",inner:"#94A3B8",
    vA:"#D97706",vB:"#B45309",vL:"#FDE68A",
  }
};

/* ═══════════════════════════════════════════════════
   ATOM LOGO
   ═══════════════════════════════════════════════════ */
function Logo({s=32,t,id="x",pulse=false}){
  return(
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
        {pulse&&<animate attributeName="opacity" values="1;0.6;1" dur="3s" repeatCount="indefinite"/>}
      </path>
      <line x1="46" y1="57.5" x2="74" y2="57.5" stroke={t.vL} strokeWidth="0.7" opacity="0.4"/>
      <path d="M50 72H70L67 84H53Z" fill={t.inner}/>
      <path d="M25 44L34 41V66L25 63Z" fill={t.inner}/><path d="M95 44L86 41V66L95 63Z" fill={t.inner}/>
      <path d="M56 10L60 3L64 10" stroke={t.vA} strokeWidth="1.5" fill="none" filter={`url(#g${id})`}/>
      <line x1="27" y1="50" x2="32" y2="50" stroke={t.vA} strokeWidth="1.5" filter={`url(#g${id})`}/>
      <line x1="88" y1="50" x2="93" y2="50" stroke={t.vA} strokeWidth="1.5" filter={`url(#g${id})`}/>
      <circle cx="60" cy="90" r="2.5" fill={t.vA} filter={`url(#gc${id})`}>
        {pulse&&<animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite"/>}
      </circle>
    </svg>
  );
}

function Word({s=20,t}){
  const st={fontFamily:"'Bebas Neue',sans-serif",fontSize:s,letterSpacing:"0.12em",lineHeight:1};
  return <span><span style={{...st,color:t.tx}}>AT</span><span style={{...st,color:t.acc}}>O</span><span style={{...st,color:t.tx}}>M</span></span>;
}

/* ═══════════════════════════════════════════════════
   COMPONENT KIT PIECES
   ═══════════════════════════════════════════════════ */

/* ── BUTTONS ── */
function Btn({children,t,variant="primary",size="md",icon,disabled=false}){
  const [h,setH]=useState(false);
  const szMap={sm:{px:12,py:6,fs:10},md:{px:18,py:9,fs:11},lg:{px:24,py:12,fs:12}};
  const sz=szMap[size];
  const vars={
    primary:{bg:h?t.accH:t.acc,bd:"none",fg:T.dark===t?"#080B12":"#fff"},
    secondary:{bg:h?t.hv:t.sf,bd:`1px solid ${t.bd}`,fg:t.tx},
    ghost:{bg:h?t.accG:"transparent",bd:`1px solid ${h?t.accB:"transparent"}`,fg:t.acc},
    danger:{bg:h?t.rd:t.rdG,bd:`1px solid ${h?t.rd:t.rd+"40"}`,fg:h?"#fff":t.rd},
    outline:{bg:"transparent",bd:`1px solid ${h?t.tx2:t.bd}`,fg:h?t.tx:t.tx2},
  };
  const v=vars[variant];
  return(
    <button onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} disabled={disabled} style={{
      padding:`${sz.py}px ${sz.px}px`,borderRadius:6,cursor:disabled?"not-allowed":"pointer",
      transition:`all 0.2s ${ease}`,border:v.bd,background:v.bg,color:v.fg,opacity:disabled?0.4:1,
      fontFamily:"'Barlow Condensed',sans-serif",fontWeight:600,fontSize:sz.fs,
      letterSpacing:"0.1em",textTransform:"uppercase",display:"inline-flex",alignItems:"center",gap:6,
    }}>
      {icon&&<span style={{fontSize:sz.fs+2,lineHeight:1}}>{icon}</span>}{children}
    </button>
  );
}

/* ── BADGES ── */
function Badge({label,color,bg,t,dot=true,size="md"}){
  const fs=size==="sm"?8:size==="lg"?11:9;
  const pd=size==="sm"?"2px 6px":size==="lg"?"5px 12px":"3px 9px";
  return(
    <span style={{
      display:"inline-flex",alignItems:"center",gap:5,padding:pd,borderRadius:4,
      background:bg||t.accG,fontSize:fs,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,
      color:color||t.acc,letterSpacing:"0.1em",textTransform:"uppercase",
    }}>
      {dot&&<span style={{width:size==="sm"?4:5,height:size==="sm"?4:5,borderRadius:"50%",background:color||t.acc,flexShrink:0}}/>}{label}
    </span>
  );
}

/* ── STATUS DOT ── */
function StatusDot({status="active",t,label}){
  const c=status==="active"?t.gn:status==="warning"?t.acc:status==="error"?t.rd:t.txM;
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:500,color:t.tx2}}>
      <span style={{width:7,height:7,borderRadius:"50%",background:c,boxShadow:`0 0 6px ${c}60`,flexShrink:0}}/>
      {label}
    </span>
  );
}

/* ── STAT CARD ── */
function StatCard({label,value,sub,accent,danger,t}){
  const [h,setH]=useState(false);
  const bc=danger?t.rd:accent?t.acc:"transparent";
  return(
    <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
      padding:"16px 18px",background:t.sf,borderRadius:10,
      border:`1px solid ${h?t.bdA:t.bd}`,borderTop:`2px solid ${bc}`,
      boxShadow:t.sh,transition:`all 0.25s ${ease}`,cursor:"default",
      transform:h?"translateY(-2px)":"none",
    }}>
      <div style={{fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:"0.16em",color:t.txM,textTransform:"uppercase",marginBottom:6}}>{label}</div>
      <div style={{fontSize:32,fontFamily:"'Bebas Neue',sans-serif",color:danger?t.rd:accent?t.acc:t.tx,letterSpacing:"0.02em",lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:10,fontFamily:"'Barlow Condensed',sans-serif",color:t.txM,marginTop:4}}>{sub}</div>}
    </div>
  );
}

/* ── AGENT CARD ── */
function AgentCard({letter,name,desc,color,ghost,t,active}){
  const [h,setH]=useState(false);
  return(
    <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
      display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
      background:h?t.hv:t.sf,borderRadius:8,
      border:`1px solid ${active?color+"40":h?t.bdA:t.bd}`,
      cursor:"pointer",transition:`all 0.2s ${ease}`,
    }}>
      <div style={{
        width:34,height:34,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
        background:ghost,border:`1px solid ${color}25`,
        fontFamily:"'Bebas Neue',sans-serif",fontSize:15,color,letterSpacing:"0.04em",
      }}>{letter}</div>
      <div style={{minWidth:0,flex:1}}>
        <div style={{fontSize:12,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:600,color:t.tx,letterSpacing:"0.03em"}}>{name}</div>
        <div style={{fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",color:t.txM}}>{desc}</div>
      </div>
      {active&&<span style={{width:6,height:6,borderRadius:"50%",background:t.gn,flexShrink:0}}/>}
    </div>
  );
}

/* ── PANEL ── */
function Panel({title,icon,t,children,noPad,action}){
  return(
    <div style={{background:t.sf,borderRadius:10,border:`1px solid ${t.bd}`,boxShadow:t.sh,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",borderBottom:`1px solid ${t.bd}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {icon&&<span style={{fontSize:13,lineHeight:1}}>{icon}</span>}
          <span style={{fontSize:12,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:"0.1em",color:t.tx,textTransform:"uppercase"}}>{title}</span>
        </div>
        {action}
      </div>
      <div style={noPad?{}:{padding:"16px 18px"}}>{children}</div>
    </div>
  );
}

/* ── TABLE ── */
function TH({children,t,w}){
  return <th style={{padding:"8px 12px",fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:"0.14em",color:t.txM,textTransform:"uppercase",textAlign:"left",width:w,borderBottom:`1px solid ${t.bd}`,background:t.sfR}}>{children}</th>;
}
function TD({children,t,acc,mono,danger}){
  return <td style={{padding:"8px 12px",fontSize:11,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:acc||danger?600:400,color:danger?t.rd:acc?t.acc:t.tx2,letterSpacing:mono?"0.04em":"0.01em",borderBottom:`1px solid ${t.bd}`}}>{children}</td>;
}

/* ── BAR ── */
function Bar({label,value,max,color,t}){
  const pct=Math.min((value/max)*100,100);
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
      <span style={{width:80,fontSize:10,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:500,color:t.tx2,textAlign:"right",flexShrink:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
      <div style={{flex:1,height:20,background:t.bgA,borderRadius:4,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:4,transition:`width 0.6s ${ease}`,display:"flex",alignItems:"center",paddingLeft:8}}>
          <span style={{fontSize:10,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.3)"}}>{value}</span>
        </div>
      </div>
    </div>
  );
}

/* ── SCORE RING ── */
function ScoreRing({score,max=1000,color,t,size=60}){
  const r=(size/2)-4;
  const circ=2*Math.PI*r;
  const pct=score/max;
  return(
    <div style={{position:"relative",width:size,height:size}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={t.bd} strokeWidth="4"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color||t.gn} strokeWidth="4"
          strokeDasharray={`${pct*circ} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:`stroke-dasharray 0.8s ${ease}`}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue',sans-serif",fontSize:size*0.27,color:color||t.gn}}>{score}</div>
    </div>
  );
}

/* ── INPUT ── */
function Input({placeholder,t,icon,value,onChange,type="text"}){
  const [f,setF]=useState(false);
  return(
    <div style={{
      display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
      background:t.sf,borderRadius:6,border:`1px solid ${f?t.acc:t.bd}`,
      transition:`border-color 0.2s ${ease}`,boxShadow:f?`0 0 0 2px ${t.accG}`:"none",
    }}>
      {icon&&<span style={{fontSize:12,color:t.txM,flexShrink:0}}>{icon}</span>}
      <input
        type={type} placeholder={placeholder} value={value} onChange={onChange}
        onFocus={()=>setF(true)} onBlur={()=>setF(false)}
        style={{
          flex:1,background:"transparent",border:"none",outline:"none",
          fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,color:t.tx,letterSpacing:"0.02em",
        }}
      />
    </div>
  );
}

/* ── SELECT ── */
function Select({options,t,value,onChange}){
  const [f,setF]=useState(false);
  return(
    <select value={value} onChange={onChange} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{
      padding:"8px 12px",background:t.sf,borderRadius:6,
      border:`1px solid ${f?t.acc:t.bd}`,outline:"none",
      fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,color:t.tx,
      letterSpacing:"0.02em",cursor:"pointer",appearance:"auto",
      boxShadow:f?`0 0 0 2px ${t.accG}`:"none",transition:`all 0.2s ${ease}`,
    }}>
      {options.map(o=><option key={o.v} value={o.v} style={{background:t.sf,color:t.tx}}>{o.l}</option>)}
    </select>
  );
}

/* ── TOGGLE ── */
function Toggle({on,onToggle,t}){
  return(
    <button onClick={onToggle} style={{
      width:38,height:20,borderRadius:10,cursor:"pointer",border:`1px solid ${t.bd}`,
      background:on?t.accG:t.bgA,position:"relative",transition:`all 0.3s ${ease}`,
    }}>
      <div style={{width:14,height:14,borderRadius:7,background:t.acc,position:"absolute",top:2,left:on?20:2,transition:`left 0.3s ${ease}`}}/>
    </button>
  );
}

/* ── TOOLTIP ── */
function Tooltip({text,children,t}){
  const [show,setShow]=useState(false);
  return(
    <div style={{position:"relative",display:"inline-block"}} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      {children}
      {show&&<div style={{
        position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",
        padding:"5px 10px",borderRadius:4,background:t.tx,color:t.bg,
        fontSize:10,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:500,
        whiteSpace:"nowrap",zIndex:99,letterSpacing:"0.03em",
        boxShadow:"0 4px 12px rgba(0,0,0,0.2)",
      }}>
        {text}
        <div style={{position:"absolute",top:"100%",left:"50%",marginLeft:-4,width:0,height:0,borderLeft:"4px solid transparent",borderRight:"4px solid transparent",borderTop:`4px solid ${t.tx}`}}/>
      </div>}
    </div>
  );
}

/* ── TAB BAR ── */
function Tabs({tabs,active,onSelect,t}){
  return(
    <div style={{display:"flex",gap:0,borderBottom:`1px solid ${t.bd}`}}>
      {tabs.map(tab=>(
        <button key={tab} onClick={()=>onSelect(tab)} style={{
          padding:"10px 16px",fontSize:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",
          fontFamily:"'Barlow Condensed',sans-serif",color:active===tab?t.acc:t.txM,
          background:"transparent",border:"none",cursor:"pointer",
          borderBottom:active===tab?`2px solid ${t.acc}`:"2px solid transparent",
          transition:`all 0.2s ${ease}`,
        }}>{tab}</button>
      ))}
    </div>
  );
}

/* ── PROGRESS BAR ── */
function Progress({value,max=100,color,t,label}){
  const pct=Math.min((value/max)*100,100);
  return(
    <div>
      {label&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:10,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:600,color:t.tx2,letterSpacing:"0.06em"}}>{label}</span>
        <span style={{fontSize:10,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,color:color||t.acc}}>{Math.round(pct)}%</span>
      </div>}
      <div style={{height:6,background:t.bgA,borderRadius:3,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:color||t.acc,borderRadius:3,transition:`width 0.6s ${ease}`}}/>
      </div>
    </div>
  );
}

/* ── ALERT / BANNER ── */
function Alert({type="info",message,t}){
  const map={info:{c:t.cy,g:t.cyG,i:"ℹ"},warning:{c:t.acc,g:t.accG,i:"⚠"},error:{c:t.rd,g:t.rdG,i:"✕"},success:{c:t.gn,g:t.gnG,i:"✓"}};
  const v=map[type];
  return(
    <div style={{
      display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:8,
      background:v.g,border:`1px solid ${v.c}25`,
    }}>
      <span style={{width:22,height:22,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",background:v.c+"20",fontSize:11,color:v.c,fontWeight:700,flexShrink:0}}>{v.i}</span>
      <span style={{fontSize:12,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:500,color:t.tx,letterSpacing:"0.02em"}}>{message}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   SHOWCASE SECTIONS
   ═══════════════════════════════════════════════════ */
function SectionTitle({num,title,t}){
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:20,paddingTop:36}}>
      <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:48,lineHeight:0.85,color:t.acc,opacity:0.12}}>{num}</span>
      <div style={{paddingBottom:2}}>
        <div style={{fontSize:8,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:"0.22em",color:t.acc,opacity:0.6,marginBottom:2}}>COMPONENTE {num}</div>
        <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:t.tx,letterSpacing:"0.08em",lineHeight:1,margin:0}}>{title}</h2>
      </div>
    </div>
  );
}

function ShowcaseRow({label,t,children}){
  return(
    <div style={{marginBottom:14}}>
      <div style={{fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:600,letterSpacing:"0.14em",color:t.txM,textTransform:"uppercase",marginBottom:8}}>{label}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>{children}</div>
    </div>
  );
}

function CodeHint({text,t}){
  return(
    <div style={{marginTop:10,padding:"8px 12px",background:t.bgA,borderRadius:6,border:`1px solid ${t.bd}`,fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:t.txM,lineHeight:1.5,overflowX:"auto",whiteSpace:"pre"}}>
      {text}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════ */
export default function AtomComponentKit(){
  const [mode,setMode]=useState("dark");
  const [activeTab,setActiveTab]=useState("Geral");
  const t=T[mode];
  const dk=mode==="dark";

  return(
    <div style={{background:t.bg,minHeight:"100vh",color:t.tx,transition:`background 0.4s ${ease}`}}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${t.bd};border-radius:3px}option{background:${t.sf};color:${t.tx}}`}</style>

      {/* Grid bg */}
      <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",opacity:dk?0.02:0.03,backgroundImage:`linear-gradient(${t.txM} 1px,transparent 1px),linear-gradient(90deg,${t.txM} 1px,transparent 1px)`,backgroundSize:"60px 60px"}}/>

      {/* Header */}
      <div style={{position:"sticky",top:0,zIndex:20,background:t.sf,borderBottom:`1px solid ${t.bd}`,backdropFilter:"blur(12px)"}}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"12px 28px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Logo s={28} t={t} id="hd" pulse/>
            <Word s={18} t={t}/>
            <span style={{fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:"0.14em",color:t.acc,background:t.accG,padding:"2px 8px",borderRadius:3,border:`1px solid ${t.accB}`,marginLeft:4}}>DESIGN SYSTEM</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:10,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:500,color:t.txM,letterSpacing:"0.06em"}}>{dk?"DARK":"LIGHT"}</span>
            <Toggle on={!dk} onToggle={()=>setMode(m=>m==="dark"?"light":"dark")} t={t}/>
          </div>
        </div>
      </div>

      <div style={{position:"relative",zIndex:1,maxWidth:960,margin:"0 auto",padding:"0 28px 60px"}}>

        {/* ── 01 BUTTONS ── */}
        <SectionTitle num="01" title="BOTÕES" t={t}/>

        <ShowcaseRow label="Variantes" t={t}>
          <Btn t={t} variant="primary">Primário</Btn>
          <Btn t={t} variant="secondary">Secundário</Btn>
          <Btn t={t} variant="ghost">Ghost</Btn>
          <Btn t={t} variant="outline">Outline</Btn>
          <Btn t={t} variant="danger">Danger</Btn>
        </ShowcaseRow>
        <ShowcaseRow label="Tamanhos" t={t}>
          <Btn t={t} size="sm">Small</Btn>
          <Btn t={t} size="md">Medium</Btn>
          <Btn t={t} size="lg">Large</Btn>
        </ShowcaseRow>
        <ShowcaseRow label="Com Ícone" t={t}>
          <Btn t={t} variant="primary" icon="⚡">Executar</Btn>
          <Btn t={t} variant="secondary" icon="⚙">Config</Btn>
          <Btn t={t} variant="ghost" icon="↓">Exportar</Btn>
        </ShowcaseRow>
        <ShowcaseRow label="Disabled" t={t}>
          <Btn t={t} variant="primary" disabled>Disabled</Btn>
          <Btn t={t} variant="secondary" disabled>Disabled</Btn>
        </ShowcaseRow>

        <CodeHint t={t} text={`<Btn t={t} variant="primary|secondary|ghost|outline|danger" size="sm|md|lg" icon="⚡">Label</Btn>`}/>

        {/* ── 02 BADGES & STATUS ── */}
        <SectionTitle num="02" title="BADGES & STATUS" t={t}/>

        <ShowcaseRow label="Status Badges" t={t}>
          <Badge label="Online" color={t.gn} bg={t.gnG} t={t} />
          <Badge label="Em Alerta" color={t.acc} bg={t.accG} t={t} />
          <Badge label="Erro" color={t.rd} bg={t.rdG} t={t} />
          <Badge label="Info" color={t.cy} bg={t.cyG} t={t} />
          <Badge label="Novo" color={t.pr} bg={t.prG} t={t} />
        </ShowcaseRow>
        <ShowcaseRow label="Tamanhos" t={t}>
          <Badge label="Small" color={t.acc} bg={t.accG} t={t} size="sm"/>
          <Badge label="Medium" color={t.acc} bg={t.accG} t={t} size="md"/>
          <Badge label="Large" color={t.acc} bg={t.accG} t={t} size="lg"/>
        </ShowcaseRow>
        <ShowcaseRow label="Sem Dot" t={t}>
          <Badge label="V2.9" color={t.tx2} bg={t.bgA} t={t} dot={false}/>
          <Badge label="CNAB240" color={t.cy} bg={t.cyG} t={t} dot={false}/>
        </ShowcaseRow>
        <ShowcaseRow label="Status Dots" t={t}>
          <StatusDot status="active" t={t} label="Agente ativo"/>
          <StatusDot status="warning" t={t} label="Alerta"/>
          <StatusDot status="error" t={t} label="Offline"/>
          <StatusDot status="inactive" t={t} label="Inativo"/>
        </ShowcaseRow>

        {/* ── 03 STAT CARDS ── */}
        <SectionTitle num="03" title="STAT CARDS" t={t}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:12}}>
          <StatCard label="Eventos" value="103" sub="Total registrado" accent t={t}/>
          <StatCard label="Chequeios" value="21" sub="Precisão: 63%" t={t}/>
          <StatCard label="Expirados" value="8" sub="Free time vencido" danger t={t}/>
          <StatCard label="Demurrage" value="54" sub="Processos ativos" t={t}/>
        </div>

        {/* ── 04 AGENT CARDS ── */}
        <SectionTitle num="04" title="AGENT CARDS" t={t}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
          <AgentCard letter="C" name="Câmbio" desc="Extração de PDF" color={t.acc} ghost={t.accG} t={t} active/>
          <AgentCard letter="S" name="Serasa" desc="Score & crédito" color={t.cy} ghost={t.cyG} t={t}/>
          <AgentCard letter="F" name="Frete" desc="Análise de mercado" color={t.gn} ghost={t.gnG} t={t}/>
          <AgentCard letter="T" name="Tracking" desc="Rastreio Maersk" color={t.pr} ghost={t.prG} t={t} active/>
          <AgentCard letter="D" name="Demurrage" desc="Free Time Control" color={t.rd} ghost={t.rdG} t={t}/>
          <AgentCard letter="B" name="Booking" desc="Email → Skychart" color={t.pk} ghost={t.pkG} t={t}/>
        </div>

        {/* ── 05 PANELS & TABLES ── */}
        <SectionTitle num="05" title="PANELS & TABLES" t={t}/>
        <div style={{marginBottom:16}}>
          <Panel title="Últimos Chequeios" icon="✓" t={t} noPad action={<Badge label="3 registros" color={t.tx2} bg={t.bgA} t={t} dot={false} size="sm"/>}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>
                <TH t={t}>Quando</TH><TH t={t}>Módulo</TH><TH t={t}>Processo</TH><TH t={t} w="50px">Itens</TH><TH t={t} w="50px">Erros</TH><TH t={t} w="60px">Acerto</TH>
              </tr></thead>
              <tbody>
                {[
                  {w:"19/03, 16:18",m:"operacional",p:"IM01114/25",i:11,e:0,a:"55%"},
                  {w:"19/03, 15:42",m:"financeiro",p:"IM01098/25",i:8,e:1,a:"87%"},
                  {w:"19/03, 14:20",m:"operacional",p:"IM01087/25",i:14,e:2,a:"71%"},
                ].map((r,i)=>(
                  <tr key={i}>
                    <TD t={t}>{r.w}</TD>
                    <TD t={t}><Badge label={r.m} color={r.m==="operacional"?t.cy:t.acc} bg={r.m==="operacional"?t.cyG:t.accG} t={t}/></TD>
                    <TD t={t} mono>{r.p}</TD>
                    <TD t={t}>{r.i}</TD>
                    <TD t={t} danger={r.e>0}>{r.e}</TD>
                    <TD t={t} acc>{r.a}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        {/* ── 06 BARS & CHARTS ── */}
        <SectionTitle num="06" title="BARRAS & SCORE" t={t}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          <Panel title="Ranking" icon="🏆" t={t}>
            <Bar label="MSK — Maersk" value={27} max={27} color={t.acc} t={t}/>
            <Bar label="CMA CGM" value={10} max={27} color={t.pr} t={t}/>
            <Bar label="CSSC" value={5} max={27} color={t.cy} t={t}/>
            <Bar label="Evergreen" value={3} max={27} color={t.gn} t={t}/>
          </Panel>
          <Panel title="Score Ring" icon="📋" t={t}>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <ScoreRing score={952} color={t.gn} t={t} size={72}/>
              <div>
                <div style={{fontSize:13,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:600,color:t.tx}}>Risco Muito Baixo</div>
                <div style={{fontSize:10,fontFamily:"'Barlow Condensed',sans-serif",color:t.txM,marginTop:2}}>Score Serasa consultado</div>
              </div>
            </div>
            <div style={{marginTop:16}}>
              <Progress value={95.2} color={t.gn} t={t} label="Score / 1000"/>
            </div>
            <div style={{marginTop:10}}>
              <Progress value={63} color={t.acc} t={t} label="Precisão chequeios"/>
            </div>
            <div style={{marginTop:10}}>
              <Progress value={15} color={t.rd} t={t} label="Taxa de erro"/>
            </div>
          </Panel>
        </div>

        {/* ── 07 INPUTS & FORMS ── */}
        <SectionTitle num="07" title="INPUTS & FORMS" t={t}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:"0.14em",color:t.txM,textTransform:"uppercase",marginBottom:6}}>TEXT INPUT</div>
            <Input placeholder="Buscar processo..." t={t} icon="🔍"/>
          </div>
          <div>
            <div style={{fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:"0.14em",color:t.txM,textTransform:"uppercase",marginBottom:6}}>SELECT</div>
            <Select t={t} options={[{v:"all",l:"Todos os agentes"},{v:"cambio",l:"Câmbio"},{v:"serasa",l:"Serasa"},{v:"frete",l:"Frete"}]}/>
          </div>
          <div>
            <div style={{fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:"0.14em",color:t.txM,textTransform:"uppercase",marginBottom:6}}>TOGGLE</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <Toggle on={true} onToggle={()=>{}} t={t}/><span style={{fontSize:11,fontFamily:"'Barlow Condensed',sans-serif",color:t.tx2}}>Atualização automática</span>
            </div>
          </div>
        </div>

        {/* ── 08 ALERTS ── */}
        <SectionTitle num="08" title="ALERTS & BANNERS" t={t}/>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
          <Alert type="success" message="Chequeio concluído. 11 itens verificados, 0 erros encontrados." t={t}/>
          <Alert type="warning" message="Processo IM01114/25 está próximo do vencimento do free time." t={t}/>
          <Alert type="error" message="Falha na conexão com o agente Tracking. Tentando reconectar..." t={t}/>
          <Alert type="info" message="Nova versão 3.0 disponível. Atualize para acessar os novos recursos." t={t}/>
        </div>

        {/* ── 09 TABS ── */}
        <SectionTitle num="09" title="TABS & NAVIGATION" t={t}/>
        <div style={{background:t.sf,borderRadius:10,border:`1px solid ${t.bd}`,overflow:"hidden",marginBottom:16}}>
          <Tabs tabs={["Geral","Operacional","Financeiro","Demurrage"]} active={activeTab} onSelect={setActiveTab} t={t}/>
          <div style={{padding:"20px 18px"}}>
            <div style={{fontSize:12,fontFamily:"'Barlow Condensed',sans-serif",color:t.tx2}}>
              Conteúdo da aba <strong style={{color:t.acc}}>{activeTab}</strong> — cada aba filtra a visão do dashboard.
            </div>
          </div>
        </div>

        {/* ── 10 TOOLTIP ── */}
        <SectionTitle num="10" title="TOOLTIPS" t={t}/>
        <ShowcaseRow label="Hover nos elementos" t={t}>
          <Tooltip text="Agente processando dados" t={t}><Btn t={t} variant="secondary" icon="⚡">Hover aqui</Btn></Tooltip>
          <Tooltip text="Score: 952 / 1000" t={t}><Badge label="952" color={t.gn} bg={t.gnG} t={t}/></Tooltip>
          <Tooltip text="3 agentes conectados" t={t}><StatusDot status="active" t={t} label="Online"/></Tooltip>
        </ShowcaseRow>

        {/* ── 11 TYPOGRAPHY ── */}
        <SectionTitle num="11" title="TIPOGRAFIA" t={t}/>
        <div style={{background:t.sf,borderRadius:10,border:`1px solid ${t.bd}`,padding:"20px 24px",marginBottom:16}}>
          {[
            {font:"Bebas Neue",wt:"Regular",role:"DISPLAY / HEADLINES",sample:"ATOM INTELLIGENCE — CENTRO DE COMANDO",sz:30},
            {font:"Barlow Condensed",wt:"700",role:"LABELS / NAV",sample:"RANKING DE ARMADORES · PROCESSOS ATIVOS",sz:14},
            {font:"Barlow Condensed",wt:"400",role:"BODY / DESCRIPTION",sample:"Containers devolvidos com free time vencido nos últimos 30 dias.",sz:13},
            {font:"Barlow Condensed",wt:"500",role:"DATA / MONOSPACE",sample:"IM01114/25 · R$ 13.296.268,00 · Score 952",sz:14},
          ].map((r,i)=>(
            <div key={i} style={{padding:"14px 0",borderBottom:i<3?`1px solid ${t.bd}`:"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:"0.14em",color:t.acc}}>{r.role}</span>
                <span style={{fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",color:t.txM}}>{r.font} · {r.wt}</span>
              </div>
              <div style={{fontFamily:`'${r.font}',sans-serif`,fontWeight:parseInt(r.wt)||400,fontSize:r.sz,color:t.tx,lineHeight:1.3,letterSpacing:r.sz>20?"0.06em":"0.02em"}}>{r.sample}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,paddingTop:32,borderTop:`1px solid ${t.bd}`}}>
          <Logo s={18} t={t} id="ft"/>
          <span style={{fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:600,letterSpacing:"0.14em",color:t.txD}}>ATOM DESIGN SYSTEM · MOND SHIPPING · 2026</span>
        </div>
      </div>
    </div>
  );
}
