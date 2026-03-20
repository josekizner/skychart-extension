import { useState, useEffect, useRef, useCallback } from "react";

const ease = "cubic-bezier(0.22,1,0.36,1)";

const T = {
  bg: "#090C14",
  sf: "#0F1219",
  sfR: "#141820",
  hv: "#1A1F2A",
  bd: "#1C222F",
  bdA: "#283040",
  tx: "#DEE2EA",
  tx2: "#8892A4",
  txM: "#4E586C",
  txD: "#2E3648",
  acc: "#F59E0B",
  accH: "#FBBF24",
  accD: "#92400E",
  accG: "rgba(245,158,11,0.08)",
  accB: "rgba(245,158,11,0.18)",
  cy: "#22D3EE",
  gn: "#10B981",
  rd: "#EF4444",
  face: "#1A2030",
  shell: "#5A6578",
  inner: "#2E3648",
  vA: "#F59E0B",
  vB: "#D97706",
  vL: "#FDE68A",
};

/* ═══════════════════════════════════
   ATOM ROBOT HEAD — REACTIVE STATES
   ═══════════════════════════════════ */
function AtomHead({ size = 64, state = "idle", scanProgress = 0 }) {
  // state: idle | recording | learning | executing | done
  const isRec = state === "recording";
  const isExec = state === "executing";
  const isLearn = state === "learning";
  const isDone = state === "done";

  const visorOpacity = isRec ? "1;0.6;1" : isExec ? "1;0.75;1" : "0.9;0.65;0.9";
  const visorDur = isRec ? "1.2s" : isExec ? "0.8s" : "3s";
  const coreOp = isRec ? "1;0.3;1" : isExec ? "1;0.5;1" : "0.85;0.25;0.85";
  const coreDur = isRec ? "0.8s" : isExec ? "0.6s" : "2s";

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="alV" x1="30" y1="50" x2="90" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor={isRec ? "#FF3B30" : isDone ? T.gn : T.vA} />
          <stop offset="1" stopColor={isRec ? "#CC2D25" : isDone ? "#059669" : T.vB} />
        </linearGradient>
        <filter id="alG"><feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <filter id="alGS"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <filter id="alGC"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        {/* Scan line gradient */}
        <linearGradient id="scanLine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isRec ? "#FF3B30" : T.acc} stopOpacity="0" />
          <stop offset="45%" stopColor={isRec ? "#FF3B30" : T.acc} stopOpacity="0.6" />
          <stop offset="50%" stopColor={isRec ? "#FF6B60" : T.accH} stopOpacity="1" />
          <stop offset="55%" stopColor={isRec ? "#FF3B30" : T.acc} stopOpacity="0.6" />
          <stop offset="100%" stopColor={isRec ? "#FF3B30" : T.acc} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Outer ambient glow when recording */}
      {(isRec || isExec) && (
        <circle cx="60" cy="60" r="58" fill="none" stroke={isRec ? "#FF3B3020" : "#F59E0B15"} strokeWidth="2">
          <animate attributeName="r" values="54;58;54" dur={isRec ? "1.5s" : "2s"} repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.3;1" dur={isRec ? "1.5s" : "2s"} repeatCount="indefinite" />
        </circle>
      )}

      {/* Shell */}
      <path d="M60 10L95 34V76L74 106H46L25 76V34Z" fill={T.inner} stroke={T.shell} strokeWidth="1.2" />
      {/* Face plate */}
      <path d="M60 20L86 40V70L69 96H51L34 70V40Z" fill={T.face} stroke={T.inner} strokeWidth="0.8" />

      {/* Visor — changes color based on state */}
      <path d="M40 52L80 52L76 63H44Z" fill="url(#alV)" filter="url(#alG)">
        <animate attributeName="opacity" values={visorOpacity} dur={visorDur} repeatCount="indefinite" />
      </path>

      {/* Visor scan line — moves during recording */}
      {isRec && (
        <line x1="44" y1="57" x2="76" y2="57" stroke="#FF6B60" strokeWidth="1.5" opacity="0.8" filter="url(#alG)">
          <animate attributeName="x1" values="40;76;40" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="x2" values="48;84;48" dur="1.8s" repeatCount="indefinite" />
        </line>
      )}

      {/* Visor inner line */}
      <line x1="46" y1="57.5" x2="74" y2="57.5" stroke={isRec ? "#FF9B90" : isDone ? "#6EE7B7" : T.vL} strokeWidth="0.7" opacity="0.4" />

      {/* Executing: progress bar inside visor */}
      {isExec && (
        <rect x="44" y="56" width={Math.max(0, (scanProgress / 100) * 32)} height="3" rx="1" fill={T.accH} opacity="0.7">
          <animate attributeName="opacity" values="0.7;1;0.7" dur="0.5s" repeatCount="indefinite" />
        </rect>
      )}

      {/* Chin plate */}
      <path d="M50 72H70L67 84H53Z" fill={T.inner} />
      {/* Side panels */}
      <path d="M25 44L34 41V66L25 63Z" fill={T.inner} />
      <path d="M95 44L86 41V66L95 63Z" fill={T.inner} />

      {/* Antenna — flares when recording */}
      <path d="M56 10L60 3L64 10" stroke={isRec ? "#FF3B30" : T.vA} strokeWidth="1.5" fill="none" filter="url(#alG)">
        {isRec && <animate attributeName="opacity" values="1;0.3;1" dur="0.6s" repeatCount="indefinite" />}
      </path>

      {/* Side accent lines */}
      <line x1="27" y1="50" x2="32" y2="50" stroke={isRec ? "#FF3B30" : T.vA} strokeWidth="1.5" filter="url(#alG)" />
      <line x1="88" y1="50" x2="93" y2="50" stroke={isRec ? "#FF3B30" : T.vA} strokeWidth="1.5" filter="url(#alG)" />

      {/* Core chest indicator */}
      <circle cx="60" cy="90" r="2.5" fill={isRec ? "#FF3B30" : isDone ? T.gn : T.vA} filter="url(#alGC)">
        <animate attributeName="opacity" values={coreOp} dur={coreDur} repeatCount="indefinite" />
      </circle>

      {/* Done: checkmark overlay */}
      {isDone && (
        <g filter="url(#alGS)">
          <path d="M50 57L56 63L72 50" stroke={T.gn} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
        </g>
      )}
    </svg>
  );
}

/* ═══════════════════════
   CAPTURED STEP CARD
   ═══════════════════════ */
function StepCapture({ step, index, isNew }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      background: isNew ? "rgba(245,158,11,0.06)" : T.sf,
      borderRadius: 8, border: `1px solid ${isNew ? T.accB : T.bd}`,
      transition: `all 0.4s ${ease}`,
      animation: isNew ? "stepSlideIn 0.4s ease-out" : "none",
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6,
        background: isNew ? T.accG : "rgba(255,255,255,0.03)",
        border: `1px solid ${isNew ? T.acc + "30" : T.bd}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 600,
        color: isNew ? T.acc : T.txM,
      }}>
        {String(index + 1).padStart(2, "0")}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
          color: T.tx, lineHeight: 1.3, whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis",
        }}>{step.action}</div>
        <div style={{
          fontSize: 9, fontFamily: "'DM Sans', sans-serif", color: T.txM,
          lineHeight: 1.2, marginTop: 1,
        }}>{step.target}</div>
      </div>
      {isNew && (
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: T.acc,
          boxShadow: `0 0 8px ${T.acc}60`,
          animation: "capturePulse 1s ease-out forwards",
        }} />
      )}
    </div>
  );
}

/* ═══════════════════════
   WORKFLOW CARD
   ═══════════════════════ */
function WorkflowCard({ workflow, onSelect, isSelected }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={() => onSelect(workflow.id)}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width: "100%", textAlign: "left", cursor: "pointer",
        padding: "12px 14px", borderRadius: 8,
        background: isSelected ? T.accG : h ? T.hv : T.sf,
        border: `1px solid ${isSelected ? T.acc + "40" : h ? T.bdA : T.bd}`,
        transition: `all 0.2s ${ease}`,
        transform: h ? "translateY(-1px)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: isSelected ? T.accG : "rgba(255,255,255,0.02)",
          border: `1px solid ${isSelected ? T.acc + "30" : T.bd}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 3L13 8L4 13V3Z" fill={isSelected ? T.acc : T.txM} />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
            color: T.tx, lineHeight: 1.3,
          }}>{workflow.name}</div>
          <div style={{
            fontSize: 9, fontFamily: "'DM Sans', sans-serif", color: T.txM,
            display: "flex", alignItems: "center", gap: 8, marginTop: 2,
          }}>
            <span>{workflow.steps} passos</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{workflow.lastRun}</span>
          </div>
        </div>
        {isSelected && (
          <div style={{
            padding: "3px 8px", borderRadius: 4,
            background: T.acc, fontSize: 9,
            fontFamily: "'Oswald', sans-serif", fontWeight: 600,
            color: "#000", letterSpacing: "0.06em",
          }}>GO</div>
        )}
      </div>
    </button>
  );
}

/* ═══════════════════════
   EXECUTION STEP
   ═══════════════════════ */
function ExecStep({ step, index, status }) {
  // status: pending | running | done
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
      opacity: status === "pending" ? 0.35 : 1,
      transition: `all 0.3s ${ease}`,
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: "50%",
        background: status === "done" ? T.gn + "20" : status === "running" ? T.accG : "transparent",
        border: `1.5px solid ${status === "done" ? T.gn : status === "running" ? T.acc : T.bd}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: `all 0.3s ${ease}`,
      }}>
        {status === "done" ? (
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke={T.gn} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : status === "running" ? (
          <div style={{
            width: 6, height: 6, borderRadius: "50%", background: T.acc,
            animation: "executePulse 0.8s ease-in-out infinite",
          }} />
        ) : (
          <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.txD }} />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 11, fontFamily: "'DM Sans', sans-serif",
          fontWeight: status === "running" ? 600 : 400,
          color: status === "running" ? T.tx : status === "done" ? T.tx2 : T.txM,
          transition: `all 0.3s ${ease}`,
        }}>{step.action}</div>
      </div>
      {status === "running" && (
        <div style={{
          fontSize: 9, fontFamily: "'Oswald', sans-serif", fontWeight: 500,
          color: T.acc, letterSpacing: "0.08em",
          animation: "blink 1s step-end infinite",
        }}>EXEC</div>
      )}
    </div>
  );
}

/* ═══════════════════════
   MAIN COMPONENT
   ═══════════════════════ */
export default function AtomLearn() {
  // view: idle | recording | recorded | play | executing | done
  const [view, setView] = useState("idle");
  const [capturedSteps, setCapturedSteps] = useState([]);
  const [latestStep, setLatestStep] = useState(-1);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [execStep, setExecStep] = useState(-1);
  const [execProgress, setExecProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // Simulated recorded steps
  const demoSteps = [
    { action: "Abrir painel de desempenho", target: "Skyline Cargo → Painel" },
    { action: "Selecionar período", target: "Filtro: Últimos 30 dias" },
    { action: "Exportar relatório operacional", target: "Botão: Gerar PDF" },
    { action: "Copiar dados de frete", target: "Tabela: Custos por rota" },
    { action: "Colar em planilha de cotação", target: "Excel → Aba Custos" },
    { action: "Enviar email com relatório", target: "Outlook → pricing@mond" },
  ];

  const workflows = [
    { id: 1, name: "Relatório operacional", steps: 6, lastRun: "Hoje, 08:30" },
    { id: 2, name: "Chequeio diário de frete", steps: 4, lastRun: "Hoje, 07:15" },
    { id: 3, name: "Extração câmbio + envio", steps: 8, lastRun: "Ontem, 17:40" },
    { id: 4, name: "Atualizar tracking Maersk", steps: 5, lastRun: "Ontem, 14:20" },
  ];

  // Recording simulation
  const startRecording = useCallback(() => {
    setView("recording");
    setCapturedSteps([]);
    setLatestStep(-1);
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    // Simulate capturing steps one by one
    demoSteps.forEach((step, i) => {
      setTimeout(() => {
        setCapturedSteps(prev => [...prev, step]);
        setLatestStep(i);
        // Clear "new" state after a moment
        setTimeout(() => setLatestStep(-1), 1200);
      }, (i + 1) * 2200);
    });

    // Auto-stop after all steps
    setTimeout(() => {
      clearInterval(timerRef.current);
      setView("recorded");
    }, (demoSteps.length + 1) * 2200);
  }, []);

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (capturedSteps.length > 0) {
      setView("recorded");
    } else {
      setView("idle");
    }
  };

  // Execution simulation
  const startExecution = useCallback(() => {
    setView("executing");
    setExecStep(0);
    setExecProgress(0);

    const totalSteps = demoSteps.length;
    demoSteps.forEach((_, i) => {
      setTimeout(() => {
        setExecStep(i);
        setExecProgress(((i + 1) / totalSteps) * 100);
      }, i * 1500);
    });

    setTimeout(() => {
      setExecStep(totalSteps);
      setExecProgress(100);
      setView("done");
    }, totalSteps * 1500);
  }, []);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const robotState = view === "recording" ? "recording"
    : view === "executing" ? "executing"
    : view === "done" ? "done"
    : "idle";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", padding: 40,
      background: "#060810",
      backgroundImage: `
        radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.03) 0%, transparent 60%),
        linear-gradient(180deg, #060810 0%, #0A0D16 100%)
      `,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button { font-family: inherit; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: ${T.bd}; border-radius: 2px; }

        @keyframes stepSlideIn {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes capturePulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes executePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes recPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
        @keyframes scanSweep {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100%); opacity: 0; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.3; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes progressShine {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes borderGlow {
          0%, 100% { border-color: rgba(245,158,11,0.15); }
          50% { border-color: rgba(245,158,11,0.35); }
        }
        @keyframes recBorderGlow {
          0%, 100% { border-color: rgba(239,68,68,0.2); }
          50% { border-color: rgba(239,68,68,0.5); }
        }
        @keyframes doneScale {
          0% { transform: scale(0.95); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* ═══ THE POPUP ═══ */}
      <div style={{
        width: 340,
        background: T.bg,
        borderRadius: 14,
        border: `1px solid ${view === "recording" ? T.rd + "35" : view === "executing" ? T.acc + "25" : T.bd}`,
        boxShadow: view === "recording"
          ? `0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(239,68,68,0.08), inset 0 1px 0 rgba(255,255,255,0.03)`
          : view === "executing"
          ? `0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(245,158,11,0.06), inset 0 1px 0 rgba(255,255,255,0.03)`
          : `0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)`,
        overflow: "hidden",
        transition: `all 0.5s ${ease}`,
        animation: view === "recording" ? "recBorderGlow 2s ease-in-out infinite" 
          : view === "executing" ? "borderGlow 2.5s ease-in-out infinite" : "none",
      }}>

        {/* ── HEADER ── */}
        <div style={{
          padding: "16px 18px 14px",
          background: `linear-gradient(180deg, ${T.sfR} 0%, ${T.bg} 100%)`,
          borderBottom: `1px solid ${T.bd}`,
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Ambient scan effect during recording */}
          {view === "recording" && (
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "linear-gradient(180deg, rgba(239,68,68,0.04) 0%, transparent 100%)",
              animation: "glowPulse 2s ease-in-out infinite",
            }} />
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <AtomHead size={44} state={robotState} scanProgress={execProgress} />
                {/* Recording ring */}
                {view === "recording" && (
                  <div style={{
                    position: "absolute", top: -3, left: -3, right: -3, bottom: -3,
                    borderRadius: "50%", border: "2px solid rgba(239,68,68,0.4)",
                    animation: "recPulse 1.5s ease-in-out infinite",
                  }} />
                )}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                    <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600, letterSpacing: "0.06em", color: T.tx }}>AT</span>
                    <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600, letterSpacing: "0.06em", color: T.acc }}>O</span>
                    <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600, letterSpacing: "0.06em", color: T.tx }}>M</span>
                  </div>
                  <span style={{
                    fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 500,
                    color: view === "recording" ? T.rd : T.acc,
                    letterSpacing: "0.1em", opacity: 0.8,
                  }}>LEARN</span>
                </div>
                <div style={{
                  fontSize: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                  letterSpacing: "0.1em", color: T.txM, textTransform: "uppercase", marginTop: 1,
                }}>
                  {view === "recording" ? "OBSERVANDO SUAS AÇÕES..."
                    : view === "executing" ? "EXECUTANDO WORKFLOW"
                    : view === "done" ? "WORKFLOW CONCLUÍDO"
                    : view === "recorded" ? "APRENDIZADO SALVO"
                    : "PRONTO PARA APRENDER"}
                </div>
              </div>
            </div>

            {/* Timer during recording */}
            {view === "recording" && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 6,
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", background: T.rd,
                  animation: "executePulse 1s ease-in-out infinite",
                }} />
                <span style={{
                  fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 500,
                  color: T.rd, letterSpacing: "0.05em",
                  fontVariantNumeric: "tabular-nums",
                }}>{formatTime(elapsed)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── CONTENT AREA ── */}
        <div style={{ padding: "14px 16px 16px" }}>

          {/* === IDLE STATE === */}
          {view === "idle" && (
            <div style={{ animation: `slideUp 0.3s ${ease}` }}>
              <div style={{
                textAlign: "center", padding: "20px 10px",
                marginBottom: 14,
              }}>
                <div style={{
                  fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: T.tx2,
                  lineHeight: 1.6, maxWidth: 240, margin: "0 auto",
                }}>
                  Aperte <strong style={{ color: T.rd }}>REC</strong> e eu vou observar cada ação sua. Depois, aperte <strong style={{ color: T.acc }}>PLAY</strong> e eu repito tudo sozinho.
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button onClick={startRecording} style={{
                  padding: "14px", borderRadius: 10, cursor: "pointer",
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  transition: `all 0.25s ${ease}`,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.06)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)"; e.currentTarget.style.transform = "none"; }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "rgba(239,68,68,0.15)", border: "2px solid rgba(239,68,68,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: T.rd }} />
                  </div>
                  <span style={{
                    fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 600,
                    color: T.rd, letterSpacing: "0.12em",
                  }}>REC</span>
                </button>

                <button onClick={() => setView("play")} style={{
                  padding: "14px", borderRadius: 10, cursor: "pointer",
                  background: T.accG,
                  border: `1px solid ${T.accB}`,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  transition: `all 0.25s ${ease}`,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(245,158,11,0.12)"; e.currentTarget.style.borderColor = "rgba(245,158,11,0.35)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.accG; e.currentTarget.style.borderColor = T.accB; e.currentTarget.style.transform = "none"; }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "rgba(245,158,11,0.12)", border: `2px solid ${T.acc}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M4 2L14 8L4 14V2Z" fill={T.acc} />
                    </svg>
                  </div>
                  <span style={{
                    fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 600,
                    color: T.acc, letterSpacing: "0.12em",
                  }}>PLAY</span>
                </button>
              </div>

              {/* Quick stats */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
                marginTop: 14, padding: "8px 0",
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600, color: T.acc }}>4</div>
                  <div style={{ fontSize: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: T.txM, letterSpacing: "0.08em" }}>WORKFLOWS</div>
                </div>
                <div style={{ width: 1, height: 20, background: T.bd }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600, color: T.tx }}>23</div>
                  <div style={{ fontSize: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: T.txM, letterSpacing: "0.08em" }}>PASSOS</div>
                </div>
                <div style={{ width: 1, height: 20, background: T.bd }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600, color: T.gn }}>12h</div>
                  <div style={{ fontSize: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: T.txM, letterSpacing: "0.08em" }}>ECONOMIZADAS</div>
                </div>
              </div>
            </div>
          )}

          {/* === RECORDING STATE === */}
          {view === "recording" && (
            <div style={{ animation: `slideUp 0.3s ${ease}` }}>
              {/* Captured steps list */}
              <div style={{
                maxHeight: 240, overflowY: "auto", marginBottom: 12,
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                {capturedSteps.length === 0 && (
                  <div style={{
                    padding: "24px 0", textAlign: "center",
                  }}>
                    <div style={{
                      fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: T.txM,
                      animation: "blink 2s ease-in-out infinite",
                    }}>Aguardando ações...</div>
                    <div style={{
                      fontSize: 9, fontFamily: "'DM Sans', sans-serif", color: T.txD, marginTop: 4,
                    }}>Faça algo no sistema. Eu estou de olho.</div>
                  </div>
                )}
                {capturedSteps.map((step, i) => (
                  <StepCapture key={i} step={step} index={i} isNew={i === latestStep} />
                ))}
              </div>

              {/* Capture counter */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8,
                background: "rgba(239,68,68,0.04)",
                border: "1px solid rgba(239,68,68,0.1)",
                marginBottom: 12,
              }}>
                <div style={{
                  fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: T.tx2,
                }}>
                  <span style={{ color: T.rd, fontFamily: "'Oswald', sans-serif", fontSize: 16, fontWeight: 600, marginRight: 4 }}>
                    {capturedSteps.length}
                  </span>
                  ações capturadas
                </div>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", background: T.rd,
                  animation: "executePulse 1.2s ease-in-out infinite",
                }} />
              </div>

              {/* Stop button */}
              <button onClick={stopRecording} style={{
                width: "100%", padding: "12px", borderRadius: 8, cursor: "pointer",
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: `all 0.2s ${ease}`,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
              >
                <div style={{
                  width: 12, height: 12, borderRadius: 2, background: T.rd,
                }} />
                <span style={{
                  fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 600,
                  color: T.rd, letterSpacing: "0.1em",
                }}>PARAR GRAVAÇÃO</span>
              </button>
            </div>
          )}

          {/* === RECORDED / LEARNING COMPLETE === */}
          {view === "recorded" && (
            <div style={{ animation: `doneScale 0.4s ${ease}` }}>
              <div style={{
                textAlign: "center", padding: "16px 10px 20px",
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%", margin: "0 auto 12px",
                  background: T.accG, border: `2px solid ${T.acc}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1.5L2.5 4V8.5C2.5 11.5 5 14 8 14.5C11 14 13.5 11.5 13.5 8.5V4L8 1.5Z" stroke={T.acc} strokeWidth="1.3" strokeLinejoin="round" fill="none" />
                    <path d="M5.5 8L7 9.5L10.5 6" stroke={T.acc} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{
                  fontFamily: "'Oswald', sans-serif", fontSize: 16, fontWeight: 600,
                  color: T.tx, letterSpacing: "0.06em", marginBottom: 4,
                }}>APRENDIZADO COMPLETO</div>
                <div style={{
                  fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: T.tx2, lineHeight: 1.5,
                }}>
                  Capturei <strong style={{ color: T.acc }}>{capturedSteps.length} ações</strong> em <strong style={{ color: T.acc }}>{formatTime(elapsed)}</strong>.<br />
                  Posso reproduzir quando quiser.
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button onClick={() => setView("idle")} style={{
                  padding: "10px", borderRadius: 8, cursor: "pointer",
                  background: T.sf, border: `1px solid ${T.bd}`,
                  fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600,
                  color: T.tx2, letterSpacing: "0.08em",
                  transition: `all 0.2s ${ease}`,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.hv; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.sf; }}
                >VOLTAR</button>

                <button onClick={startExecution} style={{
                  padding: "10px", borderRadius: 8, cursor: "pointer",
                  background: T.acc, border: `1px solid ${T.accH}`,
                  fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600,
                  color: "#000", letterSpacing: "0.08em",
                  transition: `all 0.2s ${ease}`,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.accH; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.acc; }}
                >EXECUTAR AGORA</button>
              </div>
            </div>
          )}

          {/* === PLAY / SELECT WORKFLOW === */}
          {view === "play" && (
            <div style={{ animation: `slideUp 0.3s ${ease}` }}>
              <div style={{
                fontSize: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                letterSpacing: "0.1em", color: T.txM, textTransform: "uppercase",
                marginBottom: 10, paddingLeft: 2,
              }}>REPRODUZIR WORKFLOW</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {workflows.map(w => (
                  <WorkflowCard
                    key={w.id} workflow={w}
                    isSelected={selectedWorkflow === w.id}
                    onSelect={setSelectedWorkflow}
                  />
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button onClick={() => { setView("idle"); setSelectedWorkflow(null); }} style={{
                  padding: "10px", borderRadius: 8, cursor: "pointer",
                  background: T.sf, border: `1px solid ${T.bd}`,
                  fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600,
                  color: T.tx2, letterSpacing: "0.08em",
                  transition: `all 0.2s ${ease}`,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.hv; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.sf; }}
                >VOLTAR</button>

                <button
                  onClick={selectedWorkflow ? startExecution : undefined}
                  style={{
                    padding: "10px", borderRadius: 8,
                    cursor: selectedWorkflow ? "pointer" : "not-allowed",
                    background: selectedWorkflow ? T.acc : T.sfR,
                    border: `1px solid ${selectedWorkflow ? T.accH : T.bd}`,
                    fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600,
                    color: selectedWorkflow ? "#000" : T.txD, letterSpacing: "0.08em",
                    transition: `all 0.25s ${ease}`,
                    opacity: selectedWorkflow ? 1 : 0.5,
                  }}
                  onMouseEnter={e => { if (selectedWorkflow) e.currentTarget.style.background = T.accH; }}
                  onMouseLeave={e => { if (selectedWorkflow) e.currentTarget.style.background = T.acc; }}
                >EXECUTAR</button>
              </div>
            </div>
          )}

          {/* === EXECUTING STATE === */}
          {view === "executing" && (
            <div style={{ animation: `slideUp 0.3s ${ease}` }}>
              {/* Progress bar */}
              <div style={{
                height: 3, borderRadius: 2, background: T.sfR,
                marginBottom: 16, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  width: `${execProgress}%`,
                  background: `linear-gradient(90deg, ${T.acc}, ${T.accH})`,
                  backgroundSize: "200% 100%",
                  animation: "progressShine 1.5s linear infinite",
                  transition: `width 0.5s ${ease}`,
                }} />
              </div>

              {/* Steps execution list */}
              <div style={{ marginBottom: 14 }}>
                {demoSteps.map((step, i) => (
                  <ExecStep
                    key={i} step={step} index={i}
                    status={i < execStep ? "done" : i === execStep ? "running" : "pending"}
                  />
                ))}
              </div>

              {/* Progress text */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8,
                background: T.accG, border: `1px solid ${T.accB}`,
              }}>
                <span style={{
                  fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: T.tx2,
                }}>Progresso</span>
                <span style={{
                  fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 600,
                  color: T.acc, letterSpacing: "0.05em",
                }}>{Math.round(execProgress)}%</span>
              </div>
            </div>
          )}

          {/* === DONE STATE === */}
          {view === "done" && (
            <div style={{ animation: `doneScale 0.5s ${ease}`, textAlign: "center" }}>
              <div style={{ padding: "16px 10px 20px" }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%", margin: "0 auto 14px",
                  background: "rgba(16,185,129,0.08)",
                  border: "2px solid rgba(16,185,129,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8.5L6.5 12L13 4" stroke={T.gn} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{
                  fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600,
                  color: T.gn, letterSpacing: "0.08em", marginBottom: 6,
                }}>MISSÃO CUMPRIDA</div>
                <div style={{
                  fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: T.tx2, lineHeight: 1.5,
                }}>
                  Todos os <strong style={{ color: T.tx }}>{demoSteps.length} passos</strong> foram executados com sucesso.
                </div>
              </div>

              <button onClick={() => { setView("idle"); setSelectedWorkflow(null); setExecStep(-1); setExecProgress(0); }} style={{
                width: "100%", padding: "12px", borderRadius: 8, cursor: "pointer",
                background: T.sf, border: `1px solid ${T.bd}`,
                fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600,
                color: T.tx2, letterSpacing: "0.08em",
                transition: `all 0.2s ${ease}`,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = T.hv; }}
                onMouseLeave={e => { e.currentTarget.style.background = T.sf; }}
              >VOLTAR AO INÍCIO</button>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          padding: "8px 16px 10px",
          borderTop: `1px solid ${T.bd}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{
            fontSize: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
            color: T.txD, letterSpacing: "0.1em",
          }}>ATOM LEARN · v1.0</span>
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <div style={{
              width: 4, height: 4, borderRadius: "50%",
              background: view === "recording" ? T.rd : T.gn,
              boxShadow: `0 0 6px ${view === "recording" ? T.rd : T.gn}60`,
            }} />
            <span style={{
              fontSize: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
              color: view === "recording" ? T.rd : T.gn,
              letterSpacing: "0.08em",
            }}>{view === "recording" ? "GRAVANDO" : "ONLINE"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
