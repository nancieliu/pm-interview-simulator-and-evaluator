"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Stage = "setup" | "interview" | "report";
type Style = "General Lead PM" | "Meta-style";
type InterviewerId = "alex" | "maya";
type TranscriptEntry = { speaker: "Interviewer" | "You"; text: string; at: number };
type Evaluation = { overallSummary: string; strongestSignal: string; topImprovement: string; deliveryScore: number; productScore: number; deliveryEvidence: Array<{ title: string; evidence: string; coaching: string }>; productEvidence: Array<{ title: string; evidence: string; coaching: string }>; improvedExample: string };

const SESSION_SECONDS = 35 * 60;
const QUESTIONS: Record<Style, string[]> = {
  "General Lead PM": [
    "Design a product that helps people make better use of their free time.",
    "How would you improve Google Maps for people who commute to work?",
    "Design a product that helps first-time managers build stronger teams.",
    "Choose a consumer product you use often. What would you improve and why?",
  ],
  "Meta-style": [
    "Design a product for Facebook that helps neighbors support each other.",
    "How would you improve Instagram Stories for close friends?",
    "Design a product for people to discover and join local communities.",
    "How would you improve WhatsApp for families living in different countries?",
  ],
};
const FILLERS = ["um", "uh", "like", "you know", "kind of", "sort of", "basically", "actually"];
const INTERVIEWERS = {
  alex: { name: "Alex", voice: "Cedar", image: "/interviewer-alex.png" },
  maya: { name: "Maya", voice: "Coral", image: "/interviewer-maya-v2.png" },
} as const;

function formatTime(total: number) {
  const safe = Math.max(0, total);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
function countFillers(text: string) {
  return FILLERS.reduce((sum, filler) => sum + (text.toLowerCase().match(new RegExp(`\\b${filler.replace(" ", "\\s+")}\\b`, "g"))?.length ?? 0), 0);
}
function scoreLabel(score: number) {
  if (score >= 85) return "Strong interview signal";
  if (score >= 72) return "Promising, with a few gaps";
  return "Needs another focused practice";
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("setup");
  const [style, setStyle] = useState<Style>("General Lead PM");
  const [interviewerId, setInterviewerId] = useState<InterviewerId>("alex");
  const [questionMode, setQuestionMode] = useState<"random" | "custom">("random");
  const [customQuestion, setCustomQuestion] = useState("");
  const [question, setQuestion] = useState(QUESTIONS["General Lead PM"][0]);
  const [notes, setNotes] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [interviewerSpeaking, setInterviewerSpeaking] = useState(false);
  const [status, setStatus] = useState("Ready to begin");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [interimText, setInterimText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [deviceMessage, setDeviceMessage] = useState("Camera and microphone will be checked when you join.");
  const [followUpIndex, setFollowUpIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [aiConnected, setAiConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationMessage, setEvaluationMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const noteSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedNotesRef = useRef("");
  const realtimeResponseCountRef = useRef(0);

  const selectedQuestion = useMemo(() => questionMode === "custom" && customQuestion.trim() ? customQuestion.trim() : question, [customQuestion, question, questionMode]);
  const interviewer = INTERVIEWERS[interviewerId];
  useEffect(() => setQuestion(QUESTIONS[style][0]), [style]);
  useEffect(() => {
    if (stage !== "interview") return;
    const timer = window.setInterval(() => setSecondsLeft((current) => current > 0 ? current - 1 : 0), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);
  useEffect(() => { if (stage === "interview" && secondsLeft === 0) finishInterview(); }, [secondsLeft, stage]);
  useEffect(() => {
    if (!aiConnected || stage !== "interview" || dataChannelRef.current?.readyState !== "open") return;
    if (notes === lastSyncedNotesRef.current) return;
    if (noteSyncTimerRef.current) clearTimeout(noteSyncTimerRef.current);
    noteSyncTimerRef.current = setTimeout(() => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== "open") return;
      channel.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{
            type: "input_text",
            text: `[SILENT SHARED-NOTES UPDATE — do not respond and do not treat this as a spoken answer. The candidate's visible working document now reads:\n${notes.slice(0, 6000) || "(blank)"}`,
          }],
        },
      }));
      lastSyncedNotesRef.current = notes;
    }, 700);
    return () => { if (noteSyncTimerRef.current) clearTimeout(noteSyncTimerRef.current); };
  }, [aiConnected, notes, stage]);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recognitionRef.current?.stop?.();
    window.speechSynthesis?.cancel();
    peerRef.current?.close();
  }, []);

  const elapsedSeconds = startedAt ? Math.max(1, Math.round(((endedAt ?? Date.now()) - startedAt) / 1000)) : 1;
  const setupRecognition = useCallback(() => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { setDeviceMessage("Audio recording is ready. Live transcript is unavailable in this browser."); return; }
    const recognition = new Recognition();
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = "en-US";
    recognition.onstart = () => setStatus("Listening");
    recognition.onspeechstart = () => setStatus("You are speaking");
    recognition.onresult = (event: any) => {
      let finalText = "", interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const value = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += value; else interim += value;
      }
      setInterimText(interim);
      if (finalText.trim()) setTranscript((current) => [...current, { speaker: "You", text: finalText.trim(), at: SESSION_SECONDS - secondsLeft }]);
    };
    recognition.onspeechend = () => { setInterimText(""); setStatus("Listening"); };
    recognition.onerror = () => setDeviceMessage("Recording continues, but the live transcript paused.");
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* already started */ }
  }, [secondsLeft]);

  async function connectRealtime(stream: MediaStream, actualQuestion: string) {
    try {
      const tokenResponse = await fetch("/api/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: actualQuestion, style, interviewer: interviewerId }),
      });
      if (!tokenResponse.ok) {
        const detail = await tokenResponse.json().catch(() => ({}));
        throw new Error(detail?.error?.message || detail?.reason || `OpenAI connection failed (${tokenResponse.status})`);
      }
      const token = await tokenResponse.json();
      if (!token.value) throw new Error("OpenAI did not return a Realtime session token.");

      const pc = new RTCPeerConnection();
      const audio = document.createElement("audio");
      audio.autoplay = true;
      pc.ontrack = (event) => { audio.srcObject = event.streams[0]; };
      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
      const dc = pc.createDataChannel("oai-events");
      dc.addEventListener("open", () => {
        setAiConnected(true);
        setConnectionError("");
        setStatus(`${interviewer.name} is speaking`);
        dc.send(JSON.stringify({ type: "response.create", response: { output_modalities: ["audio"] } }));
      });
      dc.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "input_audio_buffer.speech_started") setStatus("You are speaking");
        if (message.type === "input_audio_buffer.speech_stopped") setStatus(`${interviewer.name} is thinking`);
        if (message.type === "response.created") setStatus(`${interviewer.name} is thinking`);
        if (message.type === "output_audio_buffer.started" || message.type === "response.output_audio.delta") {
          setInterviewerSpeaking(true); setStatus(`${interviewer.name} is speaking`);
        }
        if (message.type === "output_audio_buffer.stopped" || message.type === "response.done") {
          setInterviewerSpeaking(false); setStatus("Listening");
        }
        if (message.type === "response.done") {
          if (realtimeResponseCountRef.current > 0) setFollowUpIndex((current) => current + 1);
          realtimeResponseCountRef.current += 1;
        }
        if (message.type === "error") {
          setConnectionError(message.error?.message || "The live interviewer encountered an audio error.");
          setStatus("Connection error");
        }
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answerResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/sdp" },
      });
      if (!answerResponse.ok) {
        const detail = await answerResponse.text();
        pc.close();
        throw new Error(detail || `Realtime call failed (${answerResponse.status})`);
      }
      await pc.setRemoteDescription({ type: "answer", sdp: await answerResponse.text() });
      peerRef.current = pc; dataChannelRef.current = dc; remoteAudioRef.current = audio;
      return true;
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "The live interviewer could not connect.");
      setStatus("Connection failed");
      return false;
    }
  }

  async function startInterview() {
    const actual = questionMode === "random" ? QUESTIONS[style][Math.floor(Math.random() * QUESTIONS[style].length)] : customQuestion.trim();
    if (!actual) return;
    setQuestion(actual); setTranscript([]); setSecondsLeft(SESSION_SECONDS); setFollowUpIndex(0); setAudioUrl(null); setStartedAt(Date.now()); setEndedAt(null); setEvaluation(null); setEvaluationMessage(""); setConnectionError(""); lastSyncedNotesRef.current = ""; realtimeResponseCountRef.current = 0;
    setStage("interview");
    let mediaStream: MediaStream | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      mediaStream = stream;
      streamRef.current = stream;
      window.setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 0);
      const recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()));
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => setAudioUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })));
      recorder.start(1000); recorderRef.current = recorder;
      setDeviceMessage("Audio recording active · Video is not recorded");
    } catch { setCameraOn(false); setDeviceMessage("Camera or microphone access was blocked."); setConnectionError("Presence needs microphone access for the live interviewer. Allow microphone access in your browser, then start a new interview."); }
    window.setTimeout(async () => {
      setupRecognition();
      const connected = mediaStream ? await connectRealtime(mediaStream, actual) : false;
      if (!connected && mediaStream) setDeviceMessage("The live interviewer did not connect. See the error shown in the interview room.");
    }, 500);
  }

  function toggleMute() {
    const next = !isMuted; setIsMuted(next);
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    if (next) recognitionRef.current?.stop?.(); else setupRecognition();
  }
  function toggleCamera() {
    const next = !cameraOn; setCameraOn(next);
    streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
  }
  async function requestEvaluation(duration: number) {
    const capturedText = transcript.filter((entry) => entry.speaker === "You").map((entry) => entry.text).join(" ");
    const capturedWords = capturedText.trim() ? capturedText.trim().split(/\s+/).length : 0;
    const measuredPace = Math.round(capturedWords / Math.max(duration / 60, .1));
    setEvaluating(true); setEvaluationMessage("Reviewing your interview evidence…");
    try {
      const response = await fetch("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: selectedQuestion, style, durationSeconds: duration, pace: measuredPace, fillerCount: countFillers(capturedText), followUpCount: followUpIndex, notes, transcript }) });
      if (!response.ok) throw new Error("Evaluation unavailable");
      const result = await response.json();
      setEvaluation(result.evaluation); setEvaluationMessage("");
    } catch { setEvaluationMessage("AI evaluation was unavailable. Showing local delivery signals instead."); }
    finally { setEvaluating(false); }
  }
  function finishInterview() {
    const now = Date.now();
    const duration = startedAt ? Math.max(1, Math.round((now - startedAt) / 1000)) : 1;
    setEndedAt(now);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    recognitionRef.current?.stop?.();
    window.speechSynthesis?.cancel(); streamRef.current?.getTracks().forEach((track) => track.stop()); setStage("report");
    peerRef.current?.close(); setAiConnected(false); void requestEvaluation(duration);
  }

  const userText = transcript.filter((entry) => entry.speaker === "You").map((entry) => entry.text).join(" ");
  const wordCount = userText.trim() ? userText.trim().split(/\s+/).length : 0;
  const fillerCount = countFillers(userText);
  const pace = Math.round(wordCount / Math.max(elapsedSeconds / 60, .1));
  const noteSections = notes.split("\n").filter((line) => /^#|^- |^\d+\./.test(line.trim())).length;
  const localDeliveryScore = Math.max(45, Math.min(94, 82 - fillerCount * 2 + Math.min(noteSections, 4) * 2));
  const localProductScore = Math.max(50, Math.min(93, 70 + Math.min(noteSections, 5) * 3 + Math.min(followUpIndex, 5) * 2));
  const deliveryScore = evaluation?.deliveryScore ?? localDeliveryScore;
  const productScore = evaluation?.productScore ?? localProductScore;
  const overallScore = Math.round((deliveryScore + productScore) / 2);

  if (stage === "setup") return (
    <main className="app-shell setup-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">P</span><span>Presence</span></div><div className="secure-pill"><span className="status-dot" /> Private practice</div></header>
      <section className="setup-wrap">
        <div className="setup-copy"><span className="eyebrow">Product sense practice</span><h1>Practice the room,<br />not just the answer.</h1><p>Build calm, structured delivery in a realistic interview. Your session includes every follow-up and stays private to you.</p><div className="expect-list"><div><b>35 min</b><span>Full interview</span></div><div><b>50 / 50</b><span>Delivery + thinking</span></div><div><b>Audio only</b><span>Video isn’t recorded</span></div></div></div>
        <div className="setup-card">
          <div className="card-heading"><div><span className="step-label">Session setup</span><h2>Product Sense Interview</h2></div><span className="duration-badge">35:00</span></div>
          <label>Interviewer</label><div className="interviewer-options">{(Object.keys(INTERVIEWERS) as InterviewerId[]).map((id) => { const option = INTERVIEWERS[id]; return <button key={id} className={interviewerId === id ? "active" : ""} onClick={() => setInterviewerId(id)}><img src={option.image} alt={`${option.name}, fictional interviewer`} /><span><b>{option.name}</b><small>{option.voice} voice</small></span><i>{interviewerId === id ? "✓" : ""}</i></button>; })}</div>
          <label>Interview style</label><div className="segmented">{(["General Lead PM", "Meta-style"] as Style[]).map((item) => <button key={item} className={style === item ? "active" : ""} onClick={() => setStyle(item)}>{item}</button>)}</div>
          <label>Question</label><div className="segmented compact"><button className={questionMode === "random" ? "active" : ""} onClick={() => setQuestionMode("random")}>Surprise me</button><button className={questionMode === "custom" ? "active" : ""} onClick={() => setQuestionMode("custom")}>Use my question</button></div>
          {questionMode === "custom" ? <textarea className="question-input" value={customQuestion} onChange={(e) => setCustomQuestion(e.target.value)} placeholder="Paste the exact Product Sense question…" /> : <div className="question-preview"><span>Randomized at the start</span><p>{QUESTIONS[style][0]}</p></div>}
          <div className="device-row"><div className="device-icons"><span>◉</span><span>⌁</span></div><div><b>Camera + microphone</b><span>{deviceMessage}</span></div></div>
          <button className="primary-button" onClick={startInterview} disabled={questionMode === "custom" && !customQuestion.trim()}>Join interview <span>→</span></button><p className="consent-copy">By joining, you consent to local audio recording for your private review.</p>
        </div>
      </section>
    </main>
  );

  if (stage === "interview") return (
    <main className="meeting-shell">
      <header className="meeting-header"><div className="meeting-title"><span className="live-dot" /> Product Sense Interview <span>•</span> {style}</div><div className={`timer ${secondsLeft <= 300 ? "warning" : ""}`}><span>◷</span>{formatTime(secondsLeft)}</div><div className="recording-label"><span className="record-dot" /> REC · Audio only</div></header>
      <div className={`meeting-content ${notesOpen ? "with-notes" : ""}`}>
        <section className="video-stage">
          <div className={`interviewer-tile ${interviewerSpeaking ? "speaking" : ""}`}><img className="interviewer-photo" src={interviewer.image} alt={`${interviewer.name}, the fictional interviewer`} /><div className="photo-shade" /><div className="voice-bars"><i /><i /><i /><i /></div><div className="participant-label"><span className="mini-mic">●</span> {interviewer.name} · Interviewer</div><div className="interviewer-status">{status}{aiConnected ? " · Connected" : ""}</div>{connectionError && <div className="connection-alert"><b>Live interviewer not connected</b><span>{connectionError}</span><small>End this interview, check your API key and microphone permission, then try again.</small></div>}</div>
          <div className="user-tile">{cameraOn ? <video ref={videoRef} autoPlay muted playsInline /> : <div className="camera-off"><span>NL</span><p>Camera off</p></div>}<div className="participant-label">Nancie {isMuted ? "· Muted" : ""}</div></div>
          {interimText && <div className="live-caption">{interimText}</div>}
        </section>
        {notesOpen && <aside className="notes-panel"><div className="notes-heading"><div><span className="shared-badge">Live shared</span><h3>Working notes</h3></div><button onClick={() => setNotesOpen(false)} aria-label="Close notes">×</button></div><div className="prompt-note-card"><span>Interview prompt</span><p>{selectedQuestion}</p></div><div className="notes-hint"><span className="sync-dot" /> {interviewer.name} sees updates automatically—there is no Send button.</div><textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={"Start typing…\n\nGoal\n\nUsers\n\nProblems\n\nSolutions\n\nMetrics"} /><div className="notes-footer"><span>{notes.trim() ? notes.trim().split(/\s+/).length : 0} words</span><span>{aiConnected ? "Synced to interviewer" : "Saved locally"}</span></div></aside>}
      </div>
      <footer className="meeting-controls"><div className="control-group"><button className={isMuted ? "danger" : ""} onClick={toggleMute}><span>{isMuted ? "×" : "●"}</span>{isMuted ? "Unmute" : "Mute"}</button><button onClick={toggleCamera}><span>{cameraOn ? "▣" : "□"}</span>{cameraOn ? "Stop video" : "Start video"}</button><button className={notesOpen ? "selected" : ""} onClick={() => setNotesOpen((value) => !value)}><span>▤</span>{notesOpen ? "Notes shared" : "Share notes"}</button></div><button className="leave-button" onClick={finishInterview}>End interview</button></footer>
    </main>
  );

  return (
    <main className="report-shell">
      <header className="topbar report-topbar"><div className="brand"><span className="brand-mark">P</span><span>Presence</span></div><button className="text-button" onClick={() => { setStage("setup"); setNotes(""); }}>New interview</button></header>
      <section className="report-wrap">
        <div className="report-intro"><span className="eyebrow">Interview complete</span><h1>{evaluating ? "Reviewing your interview…" : scoreLabel(overallScore)}</h1><p>{evaluation?.overallSummary ?? "Your local delivery signals are ready. The full AI review will appear here when evaluation completes."}</p>{evaluationMessage && <div className="evaluation-notice">{evaluationMessage}</div>}</div>
        <div className="score-hero"><div className="overall-score"><span>Overall</span><strong>{overallScore}</strong><small>/ 100</small></div><div className="score-split"><div><span>Delivery</span><b>{deliveryScore}</b><div className="score-track"><i style={{ width: `${deliveryScore}%` }} /></div><small>50% of overall</small></div><div><span>Product thinking</span><b>{productScore}</b><div className="score-track coral"><i style={{ width: `${productScore}%` }} /></div><small>50% of overall</small></div></div></div>
        <div className="report-grid">
          <section className="report-card focus-card"><span className="card-kicker">Highest-impact coaching</span><h2>{evaluation?.topImprovement ?? "Lead with the decision."}</h2><p>{evaluation?.strongestSignal ?? "Your reasoning becomes easier to follow when you state the choice first, then give the evidence."}</p><div className="practice-line"><span>Stronger delivery example</span><p>{evaluation?.improvedExample ?? "Give every major answer in two layers: decision first, then two reasons."}</p></div></section>
          <section className="report-card metrics-card"><div className="card-title-row"><div><span className="card-kicker">Delivery signals</span><h2>How you sounded</h2></div>{audioUrl && <audio controls src={audioUrl} />}</div><div className="metric-grid"><div><strong>{pace || "—"}</strong><span>words / min</span><small>{pace >= 110 && pace <= 165 ? "Steady pace" : "Aim for 110–165"}</small></div><div><strong>{fillerCount}</strong><span>filler words</span><small>{fillerCount <= 4 ? "Controlled" : "Replace with pauses"}</small></div><div><strong>{wordCount}</strong><span>words captured</span><small>Across {formatTime(elapsedSeconds)}</small></div><div><strong>{followUpIndex}</strong><span>follow-ups</span><small>Answered in session</small></div></div></section>
          <section className="report-card notes-review"><span className="card-kicker">Your working document</span><h2>Structure you shared</h2><pre>{notes || "No working notes were captured in this session."}</pre></section>
          <section className="report-card transcript-card"><span className="card-kicker">Session evidence</span><h2>Transcript</h2><div className="transcript-list">{transcript.length ? transcript.map((entry, index) => <div key={`${entry.at}-${index}`} className={entry.speaker === "You" ? "user-entry" : "interviewer-entry"}><span>{formatTime(entry.at)}</span><div><b>{entry.speaker}</b><p>{entry.text}</p></div></div>) : <p className="empty-copy">No transcript was available. Your audio recording may still be played above.</p>}</div></section>
          {evaluation && <section className="report-card evidence-card"><span className="card-kicker">AI evidence</span><h2>Delivery and product thinking</h2><div className="evidence-columns"><div><h3>Delivery</h3>{evaluation.deliveryEvidence.map((item) => <article key={item.title}><b>{item.title}</b><p>{item.evidence}</p><small>{item.coaching}</small></article>)}</div><div><h3>Product thinking</h3>{evaluation.productEvidence.map((item) => <article key={item.title}><b>{item.title}</b><p>{item.evidence}</p><small>{item.coaching}</small></article>)}</div></div></section>}
        </div>
        <div className="report-actions"><button className="secondary-button" onClick={() => setStage("setup")}>Choose another question</button><button className="primary-button" onClick={() => { setStage("setup"); setCustomQuestion(selectedQuestion); setQuestionMode("custom"); }}>Retry this question <span>→</span></button></div>
      </section>
    </main>
  );
}
