"use client";
import { useState, useRef, useEffect } from "react";

type EntryConfig = {
  id: string;
  mode: "fixed" | "random";
  fixedValue: string;
  options: string[];
  customOptions: string;
};

type LogLine = { text: string; type: "ok" | "err" | "info" };

function parsePayload(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const params = new URLSearchParams(raw.replace(/\n/g, "&"));
  params.forEach((value, key) => {
    if (key.endsWith("_sentinel")) return;
    if (key.startsWith("entry.")) result[key] = value;
  });
  return result;
}

function extractFormId(url: string): string {
  const m = url.match(/\/forms\/d\/e\/([^/]+)\/viewform/);
  return m ? m[1] : "";
}

function randomFbzx(): string {
  const sign = Math.random() > 0.5 ? "" : "-";
  const digits = Array.from({ length: 18 }, () => Math.floor(Math.random() * 10)).join("");
  return sign + digits;
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [formUrl, setFormUrl] = useState("");
  const [payload, setPayload] = useState("");
  const [formId, setFormId] = useState("");
  const [configs, setConfigs] = useState<EntryConfig[]>([]);

  // Modo envío
  const [sendMode, setSendMode] = useState<"burst" | "scheduled">("burst");

  // Ráfaga
  const [cantidad, setCantidad] = useState(10);
  const [delay, setDelay] = useState(0.5);

  // Programado
  const [intervalMin, setIntervalMin] = useState(5);
  const [totalProg, setTotalProg] = useState(20);
  const [sentProg, setSentProg] = useState(0);
  const [nextIn, setNextIn] = useState(0); // segundos para próximo envío
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compartido
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [done, setDone] = useState(false);
  const abortRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const sentProgRef = useRef(0);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  function addLog(text: string, type: LogLine["type"] = "info") {
    setLog((prev) => {
      const next = [...prev, { text, type }];
      setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
      return next;
    });
  }

  function handleParsePayload() {
    const id = extractFormId(formUrl);
    if (!id) return alert("URL inválida.");
    const parsed = parsePayload(payload);
    if (Object.keys(parsed).length === 0) return alert("No se encontraron entries. Revisa el payload.");
    setFormId(id);
    const cfgs: EntryConfig[] = Object.entries(parsed).map(([entryId, val]) => ({
      id: entryId,
      mode: "fixed",
      fixedValue: val,
      options: val ? [val] : [],
      customOptions: val || "",
    }));
    setConfigs(cfgs);
    setStep(2);
  }

  function updateConfig(index: number, patch: Partial<EntryConfig>) {
    setConfigs((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function handleOptionsChange(index: number, raw: string) {
    const opts = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    updateConfig(index, { customOptions: raw, options: opts, fixedValue: opts[0] || "" });
  }

  function pickValue(cfg: EntryConfig): string {
    if (cfg.mode === "fixed") return cfg.fixedValue;
    if (cfg.options.length === 0) return cfg.fixedValue;
    return cfg.options[Math.floor(Math.random() * cfg.options.length)];
  }

  async function sendOne(index: number, total: number): Promise<boolean> {
    const fbzx = randomFbzx();
    const data = new URLSearchParams();
    data.append("fvv", "1");
    data.append("pageHistory", "0");
    data.append("fbzx", fbzx);
    data.append("partialResponse", `[null,null,"${fbzx}"]`);
    configs.forEach((cfg) => {
      data.append(cfg.id, pickValue(cfg));
      data.append(`${cfg.id}_sentinel`, "");
    });
    const url = `https://docs.google.com/forms/d/e/${formId}/formResponse`;
    try {
      await fetch(url, { method: "POST", body: data, mode: "no-cors" });
      addLog(`[${index}/${total}] ✓ Enviado`, "ok");
      return true;
    } catch {
      addLog(`[${index}/${total}] ✗ Error de red`, "err");
      return false;
    }
  }

  function validate(): boolean {
    const sinValor = configs.filter(c => c.mode === "fixed" && !c.fixedValue);
    if (sinValor.length > 0) { alert(`${sinValor.length} campo(s) fijo(s) sin valor.`); return false; }
    const sinOpc = configs.filter(c => c.mode === "random" && c.options.length === 0);
    if (sinOpc.length > 0) { alert(`${sinOpc.length} campo(s) aleatorio(s) sin opciones.`); return false; }
    return true;
  }

  // ── RÁFAGA ──
  async function handleBurst() {
    if (!validate()) return;
    setSending(true); setDone(false); setLog([]); abortRef.current = false;
    addLog(`Iniciando ráfaga: ${cantidad} envíos con ${delay}s de delay...`, "info");
    let ok = 0;
    for (let i = 1; i <= cantidad; i++) {
      if (abortRef.current) { addLog("Cancelado.", "err"); break; }
      const r = await sendOne(i, cantidad);
      if (r) ok++;
      if (i < cantidad) await new Promise((r) => setTimeout(r, delay * 1000));
    }
    addLog(`Listo: ${ok}/${cantidad}. Verifica en Google Forms → Respuestas.`, "info");
    setSending(false); setDone(true);
  }

  // ── PROGRAMADO ──
  function handleScheduledStart() {
    if (!validate()) return;
    setSending(true); setDone(false); setLog([]); abortRef.current = false;
    sentProgRef.current = 0; setSentProg(0);
    const intervalSec = intervalMin * 60;
    setNextIn(intervalSec);

    addLog(`Modo programado: ${totalProg} envíos cada ${intervalMin} min.`, "info");

    // Envía el primero inmediatamente
    const doSend = async () => {
      sentProgRef.current += 1;
      const current = sentProgRef.current;
      setSentProg(current);
      await sendOne(current, totalProg);
      if (current >= totalProg) {
        stopScheduled(true);
      } else {
        setNextIn(intervalSec);
      }
    };

    doSend();

    intervalRef.current = setInterval(doSend, intervalSec * 1000);

    // Countdown
    countdownRef.current = setInterval(() => {
      setNextIn((prev) => (prev > 1 ? prev - 1 : intervalSec));
    }, 1000);
  }

  function stopScheduled(finished = false) {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setSending(false); setDone(true); setNextIn(0);
    if (!finished) addLog("Programado detenido manualmente.", "err");
    else addLog(`Programado completo: ${totalProg}/${totalProg} enviados.`, "info");
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      <div className="border-b border-white/10 px-6 py-4 flex items-center gap-3">
        <div className="w-7 h-7 rounded bg-lime-400 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7h10M7 2l5 5-5 5" stroke="#0a0a0f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span className="font-semibold tracking-tight text-lg">FormBlaster</span>
        <span className="ml-auto text-xs text-white/30">Envío masivo para Google Forms</span>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                step >= s ? "bg-lime-400 text-black" : "bg-white/10 text-white/40"
              }`}>{s}</div>
              <span className={`text-sm ${step >= s ? "text-white" : "text-white/30"}`}>
                {s === 1 ? "Configurar" : s === 2 ? "Respuestas" : "Enviar"}
              </span>
              {s < 3 && <div className={`w-8 h-px mx-1 ${step > s ? "bg-lime-400" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Aviso de compatibilidad */}
            <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
              <p className="text-xs text-red-400 font-semibold mb-2">⚠️ Este tool solo funciona con formularios que:</p>
              <ul className="space-y-1">
                {[
                  "No requieren inicio de sesión con Google",
                  "No tienen captcha",
                  "No piden nombre o número con validación especial",
                  "No requieren correo verificado",
                ].map((t, i) => (
                  <li key={i} className="text-xs text-red-300/70 flex gap-2">
                    <span>✗</span><span>{t}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-white/30 mt-2">Ideal para: encuestas Likert anónimas sin restricciones.</p>
            </div>

            <div>
              <label className="block text-sm text-white/50 mb-2">URL del formulario</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lime-400/50 placeholder-white/20"
                placeholder="https://docs.google.com/forms/d/e/.../viewform"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
            </div>

            <div className="bg-white/3 border border-white/8 rounded-xl p-5 space-y-3">
              <p className="text-xs text-lime-400 font-semibold uppercase tracking-widest">Cómo obtener el payload</p>
              {[
                "Abre el formulario en Chrome (modo incógnito recomendado)",
                "Presiona F12 → pestaña Network",
                "Llena el formulario con cualquier respuesta válida y envía",
                'Busca la request "formResponse" → clic → Payload',
                "Copia todo y pégalo abajo",
              ].map((t, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xs text-lime-400/60 font-mono mt-0.5">{i + 1}.</span>
                  <span className="text-sm text-white/60">{t}</span>
                </div>
              ))}
              <div className="mt-2 p-3 bg-amber-400/5 border border-amber-400/20 rounded-lg">
                <p className="text-xs text-amber-400/80">
                  ⚠️ Las opciones deben ser exactamente iguales a las del formulario (mayúsculas, tildes, espacios).
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm text-white/50 mb-2">Payload</label>
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-xs font-mono focus:outline-none focus:border-lime-400/50 placeholder-white/20 resize-none"
                rows={5}
                placeholder="entry.123456=valor&entry.789012=..."
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
              />
            </div>

            <button
              onClick={handleParsePayload}
              disabled={!formUrl || !payload}
              className="w-full py-3 rounded-lg bg-lime-400 text-black font-semibold text-sm hover:bg-lime-300 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Analizar formulario →
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-400/5 border border-blue-400/20 rounded-lg">
              <p className="text-xs text-blue-300">
                <strong>Fijo:</strong> siempre envía el valor seleccionado. &nbsp;
                <strong>Aleatorio:</strong> escribe todas las opciones válidas (una por línea) y elige al azar.
              </p>
            </div>

            {configs.map((cfg, i) => (
              <div key={cfg.id} className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-white/40">{cfg.id}</span>
                  <div className="flex gap-1">
                    {(["fixed", "random"] as const).map((m) => (
                      <button key={m} onClick={() => updateConfig(i, { mode: m })}
                        className={`px-3 py-1 rounded text-xs font-medium transition ${
                          cfg.mode === m ? "bg-lime-400 text-black" : "bg-white/5 text-white/40 hover:bg-white/10"
                        }`}>
                        {m === "fixed" ? "Fijo" : "Aleatorio"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/30 mb-1 block">
                    {cfg.mode === "fixed" ? "Opciones (selecciona abajo)" : "Opciones para aleatorio — una por línea, exactas"}
                  </label>
                  <textarea
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white/80 focus:outline-none focus:border-lime-400/50 resize-none"
                    rows={Math.max(cfg.options.length, 2) + 1}
                    value={cfg.customOptions}
                    onChange={(e) => handleOptionsChange(i, e.target.value)}
                  />
                </div>

                {cfg.mode === "fixed" && (
                  <select value={cfg.fixedValue} onChange={(e) => updateConfig(i, { fixedValue: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-lime-400/50">
                    {cfg.options.length === 0 && <option value="" className="bg-[#0a0a0f]">— escribe opciones arriba —</option>}
                    {cfg.options.map((o) => <option key={o} value={o} className="bg-[#0a0a0f]">{o}</option>)}
                  </select>
                )}

                {cfg.mode === "random" && (
                  <p className="text-xs text-white/25">
                    {cfg.options.length > 0 ? `Eligiendo al azar entre: ${cfg.options.join(", ")}` : "⚠️ Escribe al menos una opción arriba"}
                  </p>
                )}
              </div>
            ))}

            <div className="flex gap-4 pt-2">
              <button onClick={() => setStep(1)} className="px-5 py-3 rounded-lg border border-white/10 text-sm text-white/60 hover:bg-white/5 transition">← Volver</button>
              <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-lg bg-lime-400 text-black font-semibold text-sm hover:bg-lime-300 transition">Continuar →</button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-6">

            {/* Selector de modo */}
            <div className="grid grid-cols-2 gap-3">
              {(["burst", "scheduled"] as const).map((m) => (
                <button key={m} onClick={() => { if (!sending) setSendMode(m); }}
                  className={`p-4 rounded-xl border text-left transition ${
                    sendMode === m ? "border-lime-400/50 bg-lime-400/5" : "border-white/10 bg-white/3 hover:bg-white/5"
                  } ${sending ? "opacity-50 cursor-not-allowed" : ""}`}>
                  <p className={`text-sm font-semibold mb-1 ${sendMode === m ? "text-lime-400" : "text-white/60"}`}>
                    {m === "burst" ? "⚡ Ráfaga" : "🕐 Programado"}
                  </p>
                  <p className="text-xs text-white/30">
                    {m === "burst" ? "Envía todo de una vez con delay entre envíos" : "Envía 1 por vez cada X minutos — deja la pestaña abierta"}
                  </p>
                </button>
              ))}
            </div>

            {/* Config ráfaga */}
            {sendMode === "burst" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/50 mb-2">Cantidad de respuestas</label>
                  <input type="number" min={1} max={500} value={cantidad}
                    onChange={(e) => setCantidad(Number(e.target.value))}
                    disabled={sending}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lime-400/50 disabled:opacity-40" />
                </div>
                <div>
                  <label className="block text-sm text-white/50 mb-2">Delay entre envíos (seg)</label>
                  <input type="number" min={0.1} max={60} step={0.1} value={delay}
                    onChange={(e) => setDelay(Number(e.target.value))}
                    disabled={sending}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lime-400/50 disabled:opacity-40" />
                </div>
              </div>
            )}

            {/* Config programado */}
            {sendMode === "scheduled" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/50 mb-2">Total de respuestas</label>
                    <input type="number" min={1} max={500} value={totalProg}
                      onChange={(e) => setTotalProg(Number(e.target.value))}
                      disabled={sending}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lime-400/50 disabled:opacity-40" />
                  </div>
                  <div>
                    <label className="block text-sm text-white/50 mb-2">Intervalo (minutos)</label>
                    <input type="number" min={1} max={60} value={intervalMin}
                      onChange={(e) => setIntervalMin(Number(e.target.value))}
                      disabled={sending}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lime-400/50 disabled:opacity-40" />
                  </div>
                </div>

                {sending && (
                  <div className="bg-white/3 border border-white/8 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-white/40">Progreso</p>
                      <p className="text-2xl font-semibold text-lime-400">{sentProg}<span className="text-sm text-white/30">/{totalProg}</span></p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/40">Próximo envío en</p>
                      <p className="text-2xl font-mono font-semibold text-white">{formatTime(nextIn)}</p>
                    </div>
                  </div>
                )}

                {!sending && (
                  <div className="p-3 bg-amber-400/5 border border-amber-400/20 rounded-lg">
                    <p className="text-xs text-amber-400/80">
                      ⚠️ Mantén esta pestaña abierta. El envío para si cierras el navegador.
                      Tiempo total estimado: ~{Math.round((totalProg - 1) * intervalMin)} min.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Resumen campos */}
            <div className="bg-white/3 border border-white/8 rounded-xl p-4 text-xs text-white/40 space-y-1">
              {configs.map(cfg => (
                <p key={cfg.id} className="font-mono">
                  {cfg.id.replace("entry.", "")}: <span className="text-white/60">
                    {cfg.mode === "fixed" ? `"${cfg.fixedValue}"` : `aleatorio (${cfg.options.length} opciones)`}
                  </span>
                </p>
              ))}
            </div>

            {/* Log */}
            {log.length > 0 && (
              <div ref={logRef} className="bg-black border border-white/10 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs space-y-1">
                {log.map((l, i) => (
                  <div key={i} className={l.type === "ok" ? "text-lime-400" : l.type === "err" ? "text-red-400" : "text-white/40"}>
                    {l.text}
                  </div>
                ))}
                {sending && <div className="text-white/30 animate-pulse">▌</div>}
              </div>
            )}

            <div className="flex gap-4">
              <button onClick={() => setStep(2)} disabled={sending}
                className="px-5 py-3 rounded-lg border border-white/10 text-sm text-white/60 hover:bg-white/5 transition disabled:opacity-30">
                ← Volver
              </button>

              {!sending ? (
                <button
                  onClick={sendMode === "burst" ? handleBurst : handleScheduledStart}
                  className="flex-1 py-3 rounded-lg bg-lime-400 text-black font-semibold text-sm hover:bg-lime-300 transition">
                  {done ? "Enviar de nuevo" : sendMode === "burst" ? "Iniciar ráfaga" : "Iniciar programado"}
                </button>
              ) : (
                <button
                  onClick={() => {
                    abortRef.current = true;
                    if (sendMode === "scheduled") stopScheduled(false);
                    else setSending(false);
                  }}
                  className="flex-1 py-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 font-semibold text-sm hover:bg-red-500/30 transition">
                  Detener
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}