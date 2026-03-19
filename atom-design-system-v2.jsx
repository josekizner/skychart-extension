import { useState } from "react";

const ease = "cubic-bezier(0.22,1,0.36,1)";

const T = {
  dark: {
    bg:"#07090F",bgA:"#0B0E16",sf:"#0F1219",sfR:"#141821",hv:"#181D28",
    bd:"#1C222E",bdA:"#272F3E",
    tx:"#D8DCE4",tx2:"#7E8A9E",txM:"#4A5468",txD:"#2A3242",
    acc:"#E8940A",accH:"#F5A623",accD:"#7A4E05",accG:"rgba(232,148,10,0.07)",accB:"rgba(232,148,10,0.18)",
    cy:"#1EADCF",cyG:"rgba(30,173,207,0.08)",
    gn:"#0EA572",gnG:"rgba(14,165,114,0.08)",
    rd:"#E0413A",rdG:"rgba(224,65,58,0.08)",
    pr:"#8B72E0",prG:"rgba(139,114,224,0.08)",
    pk:"#D4467A",pkG:"rgba(212,70,122,0.08)",
    og:"#E06A20",ogG:"rgba(224,106,32,0.08)",
    sh:"0 1px 2px rgba(0,0,0,0.5)",
    face:"#181E2A",shell:"#5A6578",inner:"#2E3648",chin:"#2E3648",
    vA:"#E8940A",vB:"#C47A08",vL:"#F5D88A",
  },
  light: {
    bg:"#EFEDEA",bgA:"#E6E4E0",sf:"#FAF9F7",sfR:"#F2F1EE",hv:"#ECEAE6",
    bd:"#D6D3CC",bdA:"#C4C0B8",
    tx:"#18181A",tx2:"#5C5B55",txM:"#8C8A82",txD:"#BFBDB6",
    acc:"#B47308",accH:"#9A6207",accD:"#7A4E05",accG:"rgba(180,115,8,0.06)",accB:"rgba(180,115,8,0.16)",
    cy:"#0B7D96",cyG:"rgba(11,125,150,0.06)",
    gn:"#0B7D55",gnG:"rgba(11,125,85,0.06)",
    rd:"#C23028",rdG:"rgba(194,48,40,0.06)",
    pr:"#6A52C7",prG:"rgba(106,82,199,0.06)",
    pk:"#B83564",pkG:"rgba(184,53,100,0.06)",
    og:"#C4580E",ogG:"rgba(196,88,14,0.06)",
    sh:"0 1px 2px rgba(0,0,0,0.04)",
    face:"#C8CDD6",shell:"#5A6578",inner:"#8892A2",chin:"#727C8E",
    vA:"#C47A08",vB:"#A66808",vL:"#F5D88A",
  }
};

/* ═══════════════════════
   SVG MICRO ICONS 
   ═══════════════════════ */
const I = {
  bolt:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M9.5 1L3 9.5H7.5L6.5 15L13 6.5H8.5L9.5 1Z" fill={c} opacity="0.9"/></svg>,
  check:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  x:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
  alert:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M8 2L14 13H2L8 2Z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/><line x1="8" y1="7" x2="8" y2="10" stroke={c} strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="11.8" r="0.8" fill={c}/></svg>,
  info:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1.5"/><line x1="8" y1="7" x2="8" y2="11.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="5" r="0.8" fill={c}/></svg>,
  gear:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke={c} strokeWidth="1.3"/><path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.1 3.1L4.2 4.2M11.8 11.8L12.9 12.9M12.9 3.1L11.8 4.2M4.2 11.8L3.1 12.9" stroke={c} strokeWidth="1.2" strokeLinecap="round"/></svg>,
  arrow:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M3 8H13M9.5 4L13 8L9.5 12" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  download:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M8 2V10.5M4.5 7.5L8 11L11.5 7.5M3 13.5H13" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  search:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke={c} strokeWidth="1.5"/><line x1="10.5" y1="10.5" x2="14" y2="14" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>,
  trophy:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M5 2H11V6C11 8.2 9.7 9.5 8 9.5C6.3 9.5 5 8.2 5 6V2Z" stroke={c} strokeWidth="1.3"/><path d="M5 3.5H3.5C3.5 5.5 4.2 6.5 5 6.5M11 3.5H12.5C12.5 5.5 11.8 6.5 11 6.5" stroke={c} strokeWidth="1.1"/><line x1="8" y1="9.5" x2="8" y2="12" stroke={c} strokeWidth="1.3"/><path d="M5.5 12H10.5V13H5.5Z" stroke={c} strokeWidth="1"/></svg>,
  user:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" stroke={c} strokeWidth="1.3"/><path d="M3 14C3 11.2 5.2 9.5 8 9.5C10.8 9.5 13 11.2 13 14" stroke={c} strokeWidth="1.3" strokeLinecap="round"/></svg>,
  chart:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="2" y="8" width="3" height="6" rx="0.5" stroke={c} strokeWidth="1.2"/><rect x="6.5" y="4" width="3" height="10" rx="0.5" stroke={c} strokeWidth="1.2"/><rect x="11" y="6" width="3" height="8" rx="0.5" stroke={c} strokeWidth="1.2"/></svg>,
  shield:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M8 1.5L2.5 4V8.5C2.5 11.5 5 14 8 14.5C11 14 13.5 11.5 13.5 8.5V4L8 1.5Z" stroke={c} strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  clock:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1.3"/><path d="M8 4.5V8L10.5 10" stroke={c} strokeWidth="1.3" strokeLinecap="round"/></svg>,
  layers:({c,s=14})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M8 2L14 5.5L8 9L2 5.5L8 2Z" stroke={c} strokeWidth="1.2" strokeLinejoin="round"/><path d="M2 8L8 11.5L14 8" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 10.5L8 14L14 10.5" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

/* ═══════════════════════
   LOGO
   ═══════════════════════ */
function Logo({s=32,t,id="x",pulse=false}){
  return(
    <svg width={s} height={s} viewBox="0 0 120 120" fill="none">
      <defs>
        <linearGradient id={`v${id}`} x1="30" y1="50" x2="90" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor={t.vA}/><stop offset="1" stopColor={t.vB}/></linearGradient>
        <filter id={`g${id}`}><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id={`gc${id}`}><feGaussianBlur stdDeviation="4.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M60 10L95 34V76L74 106H46L25 76V34Z" fill={t.inner} stroke={t.shell} strokeWidth="1.2"/>
      <path d="M60 20L86 40V70L69 96H51L34 70V40Z" fill={t.face} stroke={t.inner} strokeWidth="0.8"/>
      <path d="M40 52L80 52L76 63H44Z" fill={`url(#v${id})`} filter={`url(#g${id})`}>{pulse&&<animate attributeName="opacity" values="1;0.6;1" dur="3s" repeatCount="indefinite"/>}</path>
      <line x1="46" y1="57.5" x2="74" y2="57.5" stroke={t.vL} strokeWidth="0.7" opacity="0.4"/>
      <path d="M50 72H70L67 84H53Z" fill={t.inner}/><path d="M25 44L34 41V66L25 63Z" fill={t.inner}/><path d="M95 44L86 41V66L95 63Z" fill={t.inner}/>
      <path d="M56 10L60 3L64 10" stroke={t.vA} strokeWidth="1.5" fill="none" filter={`url(#g${id})`}/>
      <line x1="27" y1="50" x2="32" y2="50" stroke={t.vA} strokeWidth="1.5" filter={`url(#g${id})`}/><line x1="88" y1="50" x2="93" y2="50" stroke={t.vA} strokeWidth="1.5" filter={`url(#g${id})`}/>
      <circle cx="60" cy="90" r="2.5" fill={t.vA} filter={`url(#gc${id})`}>{pulse&&<animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite"/>}</circle>
    </svg>
  );
}
function Word({s=20,t}){
  const st={fontFamily:"'Oswald',sans-serif",fontSize:s,letterSpacing:"0.08em",lineHeight:1,fontWeight:600};
  return <span><span style={{...st,color:t.tx}}>AT</span><span style={{...st,color:t.acc}}>O</span><span style={{...st,color:t.tx}}>M</span></span>;
}

/* ═══════════════════════
   COMPONENTS
   ═══════════════════════ */
function Btn({children,t,v="primary",sz="md",icon,disabled}){
  const [h,setH]=useState(false);
  const s={sm:{px:10,py:5,fs:10,g:4},md:{px:16,py:8,fs:11,g:5},lg:{px:22,py:10,fs:12,g:6}}[sz];
  const vars={
    primary:{bg:h?t.accH:t.acc,bd:"none",fg:"#07090F"},
    secondary:{bg:h?t.hv:t.sf,bd:`1px solid ${h?t.bdA:t.bd}`,fg:t.tx},
    ghost:{bg:h?t.accG:"transparent",bd:`1px solid ${h?t.accB:"transparent"}`,fg:t.acc},
    danger:{bg:h?t.rdG:"transparent",bd:`1px solid ${h?t.rd:t.rd+"50"}`,fg:t.rd},
    outline:{bg:"transparent",bd:`1px solid ${h?t.tx2:t.bd}`,fg:h?t.tx:t.tx2},
  }[v];
  return(
    <button onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} disabled={disabled} style={{
      padding:`${s.py}px ${s.px}px`,borderRadius:4,cursor:disabled?"not-allowed":"pointer",
      transition:`all 0.15s ${ease}`,border:vars.bd,background:vars.bg,color:vars.fg,
      opacity:disabled?0.35:1,fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:s.fs,
      letterSpacing:"0.04em",textTransform:"uppercase",display:"inline-flex",alignItems:"center",gap:s.g,
    }}>{icon}{children}</button>
  );
}

function Badge({label,color,bg,t,dot=true}){
  return(
    <span style={{
      display:"inline-flex",alignItems:"center",gap:5,padding:"3px 8px",borderRadius:3,
      background:bg,fontSize:9,fontFamily:"'DM Sans',sans-serif",fontWeight:600,
      color,letterSpacing:"0.06em",textTransform:"uppercase",
    }}>{dot&&<span style={{width:5,height:5,borderRadius:"50%",background:color,flexShrink:0}}/>}{label}</span>
  );
}

function StatusDot({status,t,label}){
  const c=status==="active"?t.gn:status==="warning"?t.acc:status==="error"?t.rd:t.txM;
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontFamily:"'DM Sans',sans-serif",fontWeight:500,color:t.tx2}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:c,boxShadow:`0 0 5px ${c}50`,flexShrink:0}}/>{label}
    </span>
  );
}

function StatCard({label,value,sub,accent,danger,t,icon}){
  const [h,setH]=useState(false);
  return(
    <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
      padding:"16px 18px",background:t.sf,borderRadius:6,
      border:`1px solid ${h?t.bdA:t.bd}`,borderLeft:`3px solid ${danger?t.rd:accent?t.acc:t.bd}`,
      boxShadow:t.sh,transition:`all 0.2s ${ease}`,cursor:"default",
    }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <span style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,letterSpacing:"0.06em",color:t.txM,textTransform:"uppercase"}}>{label}</span>
        {icon&&<span style={{opacity:0.4}}>{icon}</span>}
      </div>
      <div style={{fontSize:30,fontFamily:"'Oswald',sans-serif",fontWeight:600,color:danger?t.rd:accent?t.acc:t.tx,letterSpacing:"0.01em",lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:11,fontFamily:"'DM Sans',sans-serif",color:t.txM,marginTop:5,fontWeight:400}}>{sub}</div>}
    </div>
  );
}

function AgentCard({letter,name,desc,color,ghost,t,active}){
  const [h,setH]=useState(false);
  return(
    <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
      display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
      background:h?t.hv:t.sf,borderRadius:6,
      border:`1px solid ${active?color+"35":h?t.bdA:t.bd}`,
      cursor:"pointer",transition:`all 0.15s ${ease}`,
    }}>
      <div style={{
        width:32,height:32,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
        background:ghost,fontFamily:"'Oswald',sans-serif",fontSize:14,fontWeight:600,color,
      }}>{letter}</div>
      <div style={{minWidth:0,flex:1}}>
        <div style={{fontSize:12,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:t.tx}}>{name}</div>
        <div style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",color:t.txM,fontWeight:400}}>{desc}</div>
      </div>
      {active&&<span style={{width:5,height:5,borderRadius:"50%",background:t.gn,flexShrink:0}}/>}
    </div>
  );
}

function Panel({title,t,children,noPad,action,icon}){
  return(
    <div style={{background:t.sf,borderRadius:6,border:`1px solid ${t.bd}`,boxShadow:t.sh,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderBottom:`1px solid ${t.bd}`}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {icon&&<span style={{opacity:0.5}}>{icon}</span>}
          <span style={{fontSize:11,fontFamily:"'DM Sans',sans-serif",fontWeight:700,letterSpacing:"0.04em",color:t.tx,textTransform:"uppercase"}}>{title}</span>
        </div>
        {action}
      </div>
      <div style={noPad?{}:{padding:"14px 16px"}}>{children}</div>
    </div>
  );
}

function TH({children,t,w}){return <th style={{padding:"7px 12px",fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,letterSpacing:"0.04em",color:t.txM,textTransform:"uppercase",textAlign:"left",width:w,borderBottom:`1px solid ${t.bd}`,background:t.sfR}}>{children}</th>;}
function TD({children,t,acc,danger}){return <td style={{padding:"7px 12px",fontSize:11,fontFamily:"'DM Sans',sans-serif",fontWeight:acc||danger?600:400,color:danger?t.rd:acc?t.acc:t.tx2,borderBottom:`1px solid ${t.bd}`}}>{children}</td>;}

function Bar({label,value,max,color,t}){
  const pct=Math.min((value/max)*100,100);
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
      <span style={{width:85,fontSize:11,fontFamily:"'DM Sans',sans-serif",fontWeight:500,color:t.tx2,textAlign:"right",flexShrink:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
      <div style={{flex:1,height:22,background:t.bgA,borderRadius:3,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:3,transition:`width 0.5s ${ease}`,display:"flex",alignItems:"center",paddingLeft:7}}>
          <span style={{fontSize:10,fontFamily:"'Oswald',sans-serif",fontWeight:500,color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.4)"}}>{value}</span>
        </div>
      </div>
    </div>
  );
}

function ScoreRing({score,max=1000,color,t,size=64}){
  const r=(size/2)-4;const circ=2*Math.PI*r;
  return(
    <div style={{position:"relative",width:size,height:size}}>
      <svg width={size} height={size}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={t.bd} strokeWidth="3.5"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color||t.gn} strokeWidth="3.5" strokeDasharray={`${(score/max)*circ} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:`stroke-dasharray 0.8s ${ease}`}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontSize:size*0.26,fontWeight:600,color:color||t.gn}}>{score}</div>
    </div>
  );
}

function Progress({value,max=100,color,t,label}){
  const pct=Math.min((value/max)*100,100);
  return(
    <div>
      {label&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:500,color:t.tx2}}>{label}</span>
        <span style={{fontSize:10,fontFamily:"'Oswald',sans-serif",fontWeight:500,color:color||t.acc}}>{Math.round(pct)}%</span>
      </div>}
      <div style={{height:4,background:t.bgA,borderRadius:2,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:color||t.acc,borderRadius:2,transition:`width 0.5s ${ease}`}}/></div>
    </div>
  );
}

function Input({placeholder,t,icon,type="text"}){
  const [f,setF]=useState(false);
  return(
    <div style={{display:"flex",alignItems:"center",gap:7,padding:"7px 11px",background:t.bgA,borderRadius:4,border:`1px solid ${f?t.acc:t.bd}`,transition:`border-color 0.15s ${ease}`}}>
      {icon&&<span style={{flexShrink:0,opacity:0.45}}>{icon}</span>}
      <input type={type} placeholder={placeholder} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{flex:1,background:"transparent",border:"none",outline:"none",fontFamily:"'DM Sans',sans-serif",fontSize:12,color:t.tx}}/>
    </div>
  );
}

function Toggle({on,onToggle,t}){
  return(<button onClick={onToggle} style={{width:36,height:18,borderRadius:9,cursor:"pointer",border:`1px solid ${t.bd}`,background:on?t.accG:t.bgA,position:"relative",transition:`all 0.25s ${ease}`}}>
    <div style={{width:12,height:12,borderRadius:6,background:t.acc,position:"absolute",top:2,left:on?20:2,transition:`left 0.25s ${ease}`}}/>
  </button>);
}

function Alert({type,message,t}){
  const m={info:{c:t.cy,g:t.cyG,icon:<I.info c={t.cy}/>},warning:{c:t.acc,g:t.accG,icon:<I.alert c={t.acc}/>},error:{c:t.rd,g:t.rdG,icon:<I.x c={t.rd}/>},success:{c:t.gn,g:t.gnG,icon:<I.check c={t.gn}/>}}[type];
  return(
    <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",borderRadius:4,background:m.g,border:`1px solid ${m.c}18`}}>
      <span style={{flexShrink:0,marginTop:1}}>{m.icon}</span>
      <span style={{fontSize:12,fontFamily:"'DM Sans',sans-serif",fontWeight:500,color:t.tx,lineHeight:1.5}}>{message}</span>
    </div>
  );
}

function Tabs({tabs,active,onSelect,t}){
  return(
    <div style={{display:"flex",gap:0,borderBottom:`1px solid ${t.bd}`}}>
      {tabs.map(tab=>(
        <button key={tab} onClick={()=>onSelect(tab)} style={{padding:"9px 16px",fontSize:11,fontWeight:600,letterSpacing:"0.03em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",color:active===tab?t.acc:t.txM,background:"transparent",border:"none",cursor:"pointer",borderBottom:active===tab?`2px solid ${t.acc}`:"2px solid transparent",transition:`all 0.15s ${ease}`}}>{tab}</button>
      ))}
    </div>
  );
}

function Tooltip({text,children,t}){
  const [s,setS]=useState(false);
  return(
    <div style={{position:"relative",display:"inline-block"}} onMouseEnter={()=>setS(true)} onMouseLeave={()=>setS(false)}>
      {children}
      {s&&<div style={{position:"absolute",bottom:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",padding:"4px 9px",borderRadius:3,background:t.tx,color:t.bg,fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:500,whiteSpace:"nowrap",zIndex:99}}>{text}<div style={{position:"absolute",top:"100%",left:"50%",marginLeft:-3,borderLeft:"3px solid transparent",borderRight:"3px solid transparent",borderTop:`3px solid ${t.tx}`}}/></div>}
    </div>
  );
}

/* ═══════════════════════
   SECTION HEADER
   ═══════════════════════ */
function Sec({num,title,t}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,paddingTop:40}}>
      <div style={{width:28,height:28,borderRadius:3,background:t.accG,border:`1px solid ${t.accB}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontSize:12,fontWeight:600,color:t.acc,flexShrink:0}}>{num}</div>
      <h2 style={{fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:600,color:t.tx,letterSpacing:"0.04em",margin:0,textTransform:"uppercase"}}>{title}</h2>
      <div style={{flex:1,height:1,background:t.bd}}/>
    </div>
  );
}

function Row({label,t,children}){
  return(
    <div style={{marginBottom:14}}>
      <div style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,letterSpacing:"0.04em",color:t.txM,textTransform:"uppercase",marginBottom:8}}>{label}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>{children}</div>
    </div>
  );
}

/* ═══════════════════════
   MAIN
   ═══════════════════════ */
export default function Kit(){
  const [mode,setMode]=useState("dark");
  const [tab,setTab]=useState("Geral");
  const t=T[mode]; const dk=mode==="dark";

  return(
    <div style={{background:t.bg,minHeight:"100vh",color:t.tx,transition:`background 0.35s ${ease}`}}>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${t.bd};border-radius:2px}`}</style>

      {/* Header */}
      <div style={{position:"sticky",top:0,zIndex:20,background:dk?t.sf+"E6":t.sf+"E6",backdropFilter:"blur(16px)",borderBottom:`1px solid ${t.bd}`}}>
        <div style={{maxWidth:920,margin:"0 auto",padding:"10px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Logo s={24} t={t} id="hd" pulse/>
            <Word s={16} t={t}/>
            <div style={{width:1,height:14,background:t.bd,margin:"0 4px"}}/>
            <span style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:t.txM,letterSpacing:"0.03em"}}>Component Kit</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:500,color:t.txM}}>{dk?"Dark":"Light"}</span>
            <Toggle on={!dk} onToggle={()=>setMode(m=>m==="dark"?"light":"dark")} t={t}/>
          </div>
        </div>
      </div>

      <div style={{maxWidth:920,margin:"0 auto",padding:"0 24px 60px"}}>

        {/* 01 — BUTTONS */}
        <Sec num="01" title="Botões" t={t}/>
        <Row label="Variantes" t={t}>
          <Btn t={t} v="primary">Primário</Btn>
          <Btn t={t} v="secondary">Secundário</Btn>
          <Btn t={t} v="ghost">Ghost</Btn>
          <Btn t={t} v="outline">Outline</Btn>
          <Btn t={t} v="danger">Danger</Btn>
        </Row>
        <Row label="Tamanhos" t={t}>
          <Btn t={t} sz="sm">Small</Btn><Btn t={t} sz="md">Medium</Btn><Btn t={t} sz="lg">Large</Btn>
        </Row>
        <Row label="Com ícone" t={t}>
          <Btn t={t} v="primary" icon={<I.bolt c="#07090F"/>}>Executar</Btn>
          <Btn t={t} v="secondary" icon={<I.gear c={t.tx}/>}>Configurar</Btn>
          <Btn t={t} v="ghost" icon={<I.download c={t.acc}/>}>Exportar</Btn>
          <Btn t={t} v="outline" icon={<I.arrow c={t.tx2}/>}>Detalhes</Btn>
        </Row>
        <Row label="Disabled" t={t}>
          <Btn t={t} v="primary" disabled>Desabilitado</Btn>
          <Btn t={t} v="secondary" disabled>Desabilitado</Btn>
        </Row>

        {/* 02 — BADGES */}
        <Sec num="02" title="Badges & Status" t={t}/>
        <Row label="Cores" t={t}>
          <Badge label="Online" color={t.gn} bg={t.gnG} t={t}/>
          <Badge label="Alerta" color={t.acc} bg={t.accG} t={t}/>
          <Badge label="Erro" color={t.rd} bg={t.rdG} t={t}/>
          <Badge label="Info" color={t.cy} bg={t.cyG} t={t}/>
          <Badge label="Tracking" color={t.pr} bg={t.prG} t={t}/>
          <Badge label="Booking" color={t.pk} bg={t.pkG} t={t}/>
        </Row>
        <Row label="Sem dot" t={t}>
          <Badge label="v2.9" color={t.tx2} bg={t.bgA} t={t} dot={false}/>
          <Badge label="FEBRABAN 240" color={t.cy} bg={t.cyG} t={t} dot={false}/>
          <Badge label="Master" color={t.acc} bg={t.accG} t={t} dot={false}/>
        </Row>
        <Row label="Status indicators" t={t}>
          <StatusDot status="active" t={t} label="Ativo"/>
          <StatusDot status="warning" t={t} label="Alerta"/>
          <StatusDot status="error" t={t} label="Offline"/>
          <StatusDot status="inactive" t={t} label="Inativo"/>
        </Row>

        {/* 03 — STAT CARDS */}
        <Sec num="03" title="Stat Cards" t={t}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          <StatCard label="Eventos" value="103" sub="Todos os agentes" accent t={t} icon={<I.layers c={t.acc} s={16}/>}/>
          <StatCard label="Chequeios" value="21" sub="Precisão: 63%" t={t} icon={<I.check c={t.tx2} s={16}/>}/>
          <StatCard label="Expirados" value="8" sub="Free time vencido" danger t={t} icon={<I.clock c={t.rd} s={16}/>}/>
          <StatCard label="Demurrage" value="54" sub="Processos no controle" t={t} icon={<I.chart c={t.tx2} s={16}/>}/>
        </div>

        {/* 04 — AGENT CARDS */}
        <Sec num="04" title="Agent Cards" t={t}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          <AgentCard letter="C" name="Câmbio" desc="Extração de PDF" color={t.acc} ghost={t.accG} t={t} active/>
          <AgentCard letter="S" name="Serasa" desc="Score & crédito" color={t.cy} ghost={t.cyG} t={t}/>
          <AgentCard letter="F" name="Frete" desc="Análise de mercado" color={t.gn} ghost={t.gnG} t={t}/>
          <AgentCard letter="T" name="Tracking" desc="Rastreio Maersk" color={t.pr} ghost={t.prG} t={t} active/>
          <AgentCard letter="D" name="Demurrage" desc="Free Time Control" color={t.rd} ghost={t.rdG} t={t}/>
          <AgentCard letter="B" name="Booking" desc="Email → Skychart" color={t.pk} ghost={t.pkG} t={t}/>
        </div>

        {/* 05 — PANELS & TABLES */}
        <Sec num="05" title="Panels & Tables" t={t}/>
        <Panel title="Últimos Chequeios" t={t} noPad icon={<I.check c={t.txM}/>} action={<Badge label="3 registros" color={t.tx2} bg={t.bgA} t={t} dot={false}/>}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr><TH t={t}>Quando</TH><TH t={t}>Módulo</TH><TH t={t}>Processo</TH><TH t={t} w="50px">Itens</TH><TH t={t} w="50px">Erros</TH><TH t={t} w="60px">Acerto</TH></tr></thead>
            <tbody>
              {[{w:"19/03, 16:18",m:"operacional",p:"IM01114/25",i:11,e:0,a:"55%"},{w:"19/03, 15:42",m:"financeiro",p:"IM01098/25",i:8,e:1,a:"87%"},{w:"19/03, 14:20",m:"operacional",p:"IM01087/25",i:14,e:2,a:"71%"}].map((r,i)=>(
                <tr key={i}><TD t={t}>{r.w}</TD><TD t={t}><Badge label={r.m} color={r.m==="operacional"?t.cy:t.acc} bg={r.m==="operacional"?t.cyG:t.accG} t={t}/></TD><TD t={t}>{r.p}</TD><TD t={t}>{r.i}</TD><TD t={t} danger={r.e>0}>{r.e}</TD><TD t={t} acc>{r.a}</TD></tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* 06 — BARS & SCORE */}
        <Sec num="06" title="Barras, Score Ring & Progress" t={t}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Panel title="Ranking Armadores" t={t} icon={<I.trophy c={t.txM}/>}>
            <Bar label="MSK — Maersk" value={27} max={27} color={t.acc} t={t}/>
            <Bar label="CMA CGM" value={10} max={27} color={t.pr} t={t}/>
            <Bar label="CSSC" value={5} max={27} color={t.cy} t={t}/>
            <Bar label="Evergreen" value={3} max={27} color={t.gn} t={t}/>
            <Bar label="HMM" value={2} max={27} color={t.og} t={t}/>
          </Panel>
          <Panel title="Score & Progress" t={t} icon={<I.shield c={t.txM}/>}>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
              <ScoreRing score={952} color={t.gn} t={t} size={60}/>
              <div>
                <div style={{fontSize:12,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:t.tx}}>Risco Muito Baixo</div>
                <div style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",color:t.txM}}>Serasa — South Service Trading SA</div>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <Progress value={95.2} color={t.gn} t={t} label="Score / 1000"/>
              <Progress value={63} color={t.acc} t={t} label="Precisão chequeios"/>
              <Progress value={15} color={t.rd} t={t} label="Taxa de erro"/>
            </div>
          </Panel>
        </div>

        {/* 07 — INPUTS */}
        <Sec num="07" title="Inputs & Controls" t={t}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <div>
            <div style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:t.txM,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:6}}>Search</div>
            <Input placeholder="Buscar processo..." t={t} icon={<I.search c={t.txM}/>}/>
          </div>
          <div>
            <div style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:t.txM,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:6}}>Text</div>
            <Input placeholder="Nome do favorecido" t={t}/>
          </div>
          <div>
            <div style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:t.txM,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:6}}>Toggle</div>
            <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:2}}>
              <Toggle on={true} onToggle={()=>{}} t={t}/><span style={{fontSize:11,fontFamily:"'DM Sans',sans-serif",color:t.tx2}}>Atualização automática</span>
            </div>
          </div>
        </div>

        {/* 08 — ALERTS */}
        <Sec num="08" title="Alerts" t={t}/>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <Alert type="success" message="Chequeio concluído — 11 itens verificados, 0 erros." t={t}/>
          <Alert type="warning" message="Processo IM01114/25 próximo do vencimento do free time." t={t}/>
          <Alert type="error" message="Falha na conexão com agente Tracking. Reconectando..." t={t}/>
          <Alert type="info" message="Versão 3.0 disponível. Atualize para novos recursos." t={t}/>
        </div>

        {/* 09 — TABS */}
        <Sec num="09" title="Tabs" t={t}/>
        <div style={{background:t.sf,borderRadius:6,border:`1px solid ${t.bd}`,overflow:"hidden"}}>
          <Tabs tabs={["Geral","Operacional","Financeiro","Demurrage"]} active={tab} onSelect={setTab} t={t}/>
          <div style={{padding:"14px 16px",fontSize:12,fontFamily:"'DM Sans',sans-serif",color:t.tx2}}>Conteúdo da aba <strong style={{color:t.acc}}>{tab}</strong></div>
        </div>

        {/* 10 — TOOLTIPS */}
        <Sec num="10" title="Tooltips" t={t}/>
        <Row label="Hover nos elementos" t={t}>
          <Tooltip text="Executar agente" t={t}><Btn t={t} v="secondary" icon={<I.bolt c={t.tx}/>}>Hover aqui</Btn></Tooltip>
          <Tooltip text="Score: 952 / 1000" t={t}><Badge label="952" color={t.gn} bg={t.gnG} t={t}/></Tooltip>
          <Tooltip text="3 agentes online" t={t}><StatusDot status="active" t={t} label="Online"/></Tooltip>
        </Row>

        {/* 11 — TYPOGRAPHY */}
        <Sec num="11" title="Tipografia" t={t}/>
        <div style={{background:t.sf,borderRadius:6,border:`1px solid ${t.bd}`,overflow:"hidden"}}>
          {[
            {role:"Display",font:"Oswald 600",sz:28,sample:"ATOM INTELLIGENCE — CENTRO DE COMANDO",ls:"0.04em"},
            {role:"Heading",font:"Oswald 500",sz:18,sample:"Ranking de Armadores · Processos Ativos",ls:"0.03em"},
            {role:"Body",font:"DM Sans 400",sz:13,sample:"Containers devolvidos com free time vencido nos últimos 30 dias. Acompanhe o status em tempo real.",ls:"0"},
            {role:"Label",font:"DM Sans 600",sz:10,sample:"TOTAL DE EVENTOS · CHEQUEIOS · PROCESSOS RESOLVIDOS",ls:"0.04em"},
            {role:"Data",font:"Oswald 500",sz:20,sample:"103 · 21 · 54 · R$ 13.296.268,00",ls:"0.02em"},
          ].map((r,i)=>(
            <div key={i} style={{padding:"14px 16px",borderBottom:i<4?`1px solid ${t.bd}`:"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:9,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:t.acc,letterSpacing:"0.06em",textTransform:"uppercase"}}>{r.role}</span>
                <span style={{fontSize:9,fontFamily:"'DM Sans',sans-serif",color:t.txM}}>{r.font}</span>
              </div>
              <div style={{fontFamily:r.font.includes("Oswald")?"'Oswald',sans-serif":"'DM Sans',sans-serif",fontWeight:parseInt(r.font.split(" ")[1]),fontSize:r.sz,color:t.tx,lineHeight:1.35,letterSpacing:r.ls}}>{r.sample}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,paddingTop:32,marginTop:8,borderTop:`1px solid ${t.bd}`}}>
          <Logo s={16} t={t} id="ft"/><span style={{fontSize:9,fontFamily:"'DM Sans',sans-serif",fontWeight:500,color:t.txD}}>ATOM Design System · Mond Shipping · 2026</span>
        </div>
      </div>
    </div>
  );
}
