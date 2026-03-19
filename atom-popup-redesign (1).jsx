import { useState } from "react";

const ease = "cubic-bezier(0.22,1,0.36,1)";

const T = {
  dark: {
    bg:"#090C14",sf:"#0F1219",sfR:"#141820",hv:"#1A1F2A",
    bd:"#1C222F",bdA:"#283040",
    tx:"#DEE2EA",tx2:"#8892A4",txM:"#4E586C",txD:"#2E3648",
    acc:"#F59E0B",accH:"#FBBF24",accG:"rgba(245,158,11,0.08)",accB:"rgba(245,158,11,0.15)",
    cy:"#22D3EE",cyG:"rgba(34,211,238,0.10)",
    gn:"#10B981",gnG:"rgba(16,185,129,0.10)",
    rd:"#EF4444",rdG:"rgba(239,68,68,0.10)",
    pr:"#A78BFA",prG:"rgba(167,139,250,0.10)",
    pk:"#F472B6",pkG:"rgba(244,114,182,0.10)",
    og:"#FB923C",ogG:"rgba(251,146,60,0.10)",
    bl:"#60A5FA",blG:"rgba(96,165,250,0.10)",
    face:"#1A2030",shell:"#5A6578",inner:"#2E3648",
    vA:"#F59E0B",vB:"#D97706",vL:"#FDE68A",
    inputBg:"#0B0F18",
  },
  light: {
    bg:"#F0EEEA",sf:"#FAFAF8",sfR:"#F2F1ED",hv:"#ECEAE5",
    bd:"#D8D5CC",bdA:"#C8C4BA",
    tx:"#1A1B1E",tx2:"#5C5A54",txM:"#908D84",txD:"#C4C1BA",
    acc:"#C07808",accH:"#A56807",accG:"rgba(192,120,8,0.06)",accB:"rgba(192,120,8,0.14)",
    cy:"#0B8A9E",cyG:"rgba(11,138,158,0.07)",
    gn:"#0A7D58",gnG:"rgba(10,125,88,0.07)",
    rd:"#CC2E28",rdG:"rgba(204,46,40,0.07)",
    pr:"#6B55C2",prG:"rgba(107,85,194,0.07)",
    pk:"#C03468",pkG:"rgba(192,52,104,0.07)",
    og:"#D46A14",ogG:"rgba(212,106,20,0.07)",
    bl:"#3B7FD9",blG:"rgba(59,127,217,0.07)",
    face:"#C0C8D4",shell:"#5A6578",inner:"#8892A2",
    vA:"#C07808",vB:"#A56807",vL:"#F5D88A",
    inputBg:"#EDECEA",
  }
};

function Logo({s=32,t,id="p",pulse=false}){
  return(
    <svg width={s} height={s} viewBox="0 0 120 120" fill="none">
      <defs>
        <linearGradient id={`v${id}`} x1="30" y1="50" x2="90" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor={t.vA}/><stop offset="1" stopColor={t.vB}/></linearGradient>
        <filter id={`g${id}`}><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id={`gc${id}`}><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M60 10L95 34V76L74 106H46L25 76V34Z" fill={t.inner} stroke={t.shell} strokeWidth="1.2"/>
      <path d="M60 20L86 40V70L69 96H51L34 70V40Z" fill={t.face} stroke={t.inner} strokeWidth="0.8"/>
      <path d="M40 52L80 52L76 63H44Z" fill={`url(#v${id})`} filter={`url(#g${id})`}>
        {pulse&&<animate attributeName="opacity" values="1;0.55;1" dur="3s" repeatCount="indefinite"/>}
      </path>
      <line x1="46" y1="57.5" x2="74" y2="57.5" stroke={t.vL} strokeWidth="0.7" opacity="0.35"/>
      <path d="M50 72H70L67 84H53Z" fill={t.inner}/>
      <path d="M25 44L34 41V66L25 63Z" fill={t.inner}/><path d="M95 44L86 41V66L95 63Z" fill={t.inner}/>
      <path d="M56 10L60 3L64 10" stroke={t.vA} strokeWidth="1.5" fill="none" filter={`url(#g${id})`}/>
      <line x1="27" y1="50" x2="32" y2="50" stroke={t.vA} strokeWidth="1.5" filter={`url(#g${id})`}/>
      <line x1="88" y1="50" x2="93" y2="50" stroke={t.vA} strokeWidth="1.5" filter={`url(#g${id})`}/>
      <circle cx="60" cy="90" r="2.5" fill={t.vA} filter={`url(#gc${id})`}>
        {pulse&&<animate attributeName="opacity" values="0.85;0.25;0.85" dur="2s" repeatCount="indefinite"/>}
      </circle>
    </svg>
  );
}

function AgentBtn({letter,name,desc,color,ghost,t,onClick}){
  const [h,setH]=useState(false);
  return(
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{
      display:"flex",alignItems:"center",gap:10,padding:"9px 10px",width:"100%",
      background:h?t.hv:"transparent",borderRadius:6,border:`1px solid ${h?t.bdA:t.bd}`,
      cursor:"pointer",transition:`all 0.15s ${ease}`,textAlign:"left",
    }}>
      <div style={{
        width:30,height:30,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
        background:ghost,border:`1px solid ${color}18`,
        fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:600,color,
      }}>{letter}</div>
      <div style={{minWidth:0,flex:1}}>
        <div style={{fontSize:12,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:t.tx,lineHeight:1.2}}>{name}</div>
        <div style={{fontSize:9,fontFamily:"'DM Sans',sans-serif",color:t.txM,fontWeight:400,lineHeight:1.2,marginTop:1}}>{desc}</div>
      </div>
    </button>
  );
}

export default function AtomPopup(){
  const [mode,setMode]=useState("dark");
  const [activeAgent,setActiveAgent]=useState(null);
  const t=T[mode];
  const dk=mode==="dark";

  const agents=[
    {l:"C",n:"Câmbio",d:"Extração de PDF",c:t.acc,g:t.accG},
    {l:"S",n:"Serasa",d:"Score & crédito",c:t.cy,g:t.cyG},
    {l:"F",n:"Frete",d:"Análise de mercado",c:t.gn,g:t.gnG},
    {l:"T",n:"Tracking",d:"Rastreio Maersk",c:t.pr,g:t.prG},
    {l:"Q",n:"Cotação",d:"Outlook & ofertas",c:t.og,g:t.ogG},
    {l:"V",n:"Chequeio Op",d:"Oferta vs Custos",c:t.bl,g:t.blG},
    {l:"V",n:"Chequeio Fin",d:"Oferta vs Itens",c:t.cy,g:t.cyG},
    {l:"I",n:"Frequência",d:"Inside Sales Intel",c:t.pk,g:t.pkG},
    {l:"B",n:"Booking",d:"Email → Skychart",c:t.pr,g:t.prG},
    {l:"D",n:"Demurrage",d:"Free Time Control",c:t.rd,g:t.rdG},
  ];

  return(
    <div style={{
      display:"flex",alignItems:"flex-start",justifyContent:"center",gap:40,
      minHeight:"100vh",padding:"40px 20px",
      background:dk?"#050810":"#E4E2DC",
      transition:`background 0.4s ${ease}`,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}button{font-family:inherit}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${t.bd};border-radius:2px}
      `}</style>

      {/* ── THE POPUP ── */}
      <div style={{
        width:320,background:t.bg,borderRadius:12,
        border:`1px solid ${t.bd}`,
        boxShadow:dk?"0 20px 60px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.03)":"0 20px 60px rgba(0,0,0,0.1)",
        overflow:"hidden",transition:`all 0.35s ${ease}`,
      }}>

        {/* ── HEADER ── */}
        <div style={{
          padding:"18px 18px 14px",
          background:dk?`linear-gradient(180deg, ${t.sfR} 0%, ${t.bg} 100%)`:`linear-gradient(180deg, ${t.sfR} 0%, ${t.bg} 100%)`,
          borderBottom:`1px solid ${t.bd}`,
        }}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Logo s={36} t={t} id="popup" pulse/>
              <div>
                <div style={{display:"flex",alignItems:"baseline",gap:2}}>
                  <span style={{fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:600,letterSpacing:"0.06em",color:t.tx}}>AT</span>
                  <span style={{fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:600,letterSpacing:"0.06em",color:t.acc}}>O</span>
                  <span style={{fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:600,letterSpacing:"0.06em",color:t.tx}}>M</span>
                </div>
                <div style={{fontSize:8,fontFamily:"'DM Sans',sans-serif",fontWeight:600,letterSpacing:"0.12em",color:t.txM,textTransform:"uppercase",marginTop:-1}}>MULTIAGENTES · MOND SHIPPING</div>
              </div>
            </div>

            {/* Theme toggle */}
            <button onClick={()=>setMode(m=>m==="dark"?"light":"dark")} style={{
              width:28,height:28,borderRadius:6,border:`1px solid ${t.bd}`,background:t.sf,
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              transition:`all 0.2s ${ease}`,fontSize:11,
            }}>
              {dk?"☀":"☾"}
            </button>
          </div>

          {/* Status bar */}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{
              display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,
              background:t.gnG,border:`1px solid ${t.gn}18`,
            }}>
              <span style={{width:5,height:5,borderRadius:"50%",background:t.gn,boxShadow:`0 0 6px ${t.gn}60`}}/>
              <span style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:t.gn}}>Todos os agentes ativos</span>
            </div>
            <div style={{
              padding:"4px 10px",borderRadius:20,
              background:t.accG,border:`1px solid ${t.accB}`,
              fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:t.acc,
            }}>Master</div>
          </div>
        </div>

        {/* ── AGENTS GRID ── */}
        <div style={{padding:"14px 14px 10px"}}>
          <div style={{fontSize:9,fontFamily:"'DM Sans',sans-serif",fontWeight:700,letterSpacing:"0.08em",color:t.txM,textTransform:"uppercase",marginBottom:8,paddingLeft:2}}>Agentes</div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
            {agents.map((a,i)=>(
              <AgentBtn key={i} letter={a.l} name={a.n} desc={a.d} color={a.c} ghost={a.g} t={t}
                onClick={()=>setActiveAgent(activeAgent===i?null:i)}/>
            ))}
          </div>
        </div>

        {/* ── INTELLIGENCE BUTTON ── */}
        <div style={{padding:"6px 14px 12px"}}>
          <button style={{
            width:"100%",padding:"10px",borderRadius:6,cursor:"pointer",
            background:t.accG,border:`1px solid ${t.accB}`,
            display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            transition:`all 0.2s ${ease}`,
          }}
          onMouseEnter={e=>e.currentTarget.style.background=t.acc+"18"}
          onMouseLeave={e=>e.currentTarget.style.background=t.accG}>
            <Logo s={16} t={t} id="btn"/>
            <span style={{fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:600,letterSpacing:"0.06em",color:t.acc,textTransform:"uppercase"}}>ATOM Intelligence</span>
          </button>
        </div>

        {/* ── SEPARATOR ── */}
        <div style={{height:1,background:t.bd,margin:"0 14px"}}/>

        {/* ── CONFIG ── */}
        <div style={{padding:"12px 14px 16px"}}>
          <div style={{fontSize:9,fontFamily:"'DM Sans',sans-serif",fontWeight:700,letterSpacing:"0.08em",color:t.txM,textTransform:"uppercase",marginBottom:8,paddingLeft:2}}>Configurações</div>

          <div style={{marginBottom:8}}>
            <div style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:500,color:t.tx2,marginBottom:4,paddingLeft:2}}>E-mail de alerta (Pricing)</div>
            <div style={{
              padding:"8px 10px",borderRadius:5,background:t.inputBg,border:`1px solid ${t.bd}`,
              fontSize:11,fontFamily:"'DM Sans',sans-serif",fontWeight:500,color:t.tx,
              display:"flex",alignItems:"center",gap:6,
            }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,opacity:0.35}}>
                <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke={t.tx2} strokeWidth="1.3"/>
                <path d="M2 4L8 9L14 4" stroke={t.tx2} strokeWidth="1.2"/>
              </svg>
              paulo.zanella@mondshipping.com.br
            </div>
          </div>

          {/* Version info */}
          <div style={{
            display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"6px 10px",borderRadius:5,background:t.sf,border:`1px solid ${t.bd}`,
          }}>
            <span style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:500,color:t.txM}}>Versão</span>
            <span style={{fontSize:10,fontFamily:"'Oswald',sans-serif",fontWeight:500,color:t.acc}}>2.9</span>
          </div>
        </div>
      </div>
    </div>
  );
}
