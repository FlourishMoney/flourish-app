import { useState, useRef, useCallback } from "react";

const SERVER = "http://localhost:3001";

const NICHES   = ["gardening / plants","homesteading","cooking / recipes","DIY / home reno","fitness","beauty / skincare","travel","pets","finance tips","education / how-to"];
const TONES    = ["conversational & warm","educational & authoritative","hype & energetic","funny & relatable","calm & aesthetic","storytelling / personal"];
const HOOK_TYPES = [
  { id:"result",   label:"Result first",  ex:'"This is my garden after 30 days."' },
  { id:"claim",    label:"Bold claim",    ex:'"I grew 200 tomatoes from 3 plants."' },
  { id:"question", label:"Question hook", ex:'"Did you know seedlings die from THIS?"' },
  { id:"story",    label:"Story opener",  ex:'"Last spring I killed every seedling."' },
  { id:"myth",     label:"Myth buster",   ex:'"Everyone says water daily. Wrong."' },
  { id:"pov",      label:"POV / trend",   ex:'"POV: You finally figured out why."' },
];
const PLATFORMS = [
  { id:"tiktok",   label:"TikTok",    color:"#FF2D55" },
  { id:"reels",    label:"Reels",     color:"#E040FB" },
  { id:"ytshorts", label:"YT Shorts", color:"#FF0000" },
  { id:"youtube",  label:"YouTube",   color:"#FF6B35" },
];

const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080808;color:#e8e8e8;font-family:'DM Sans',system-ui,sans-serif;min-height:100vh}
:root{--bg:#080808;--card:#111;--card2:#181818;--border:#242424;--accent:#B5FF47;--accent2:#7DF9FF;--muted:#666;--danger:#FF4757;--beat:#FF6B35;--scene:#A78BFA}
/* Scene detection */
.scene-card{background:linear-gradient(135deg,rgba(167,139,250,.06),rgba(167,139,250,.02));border:1px solid rgba(167,139,250,.2);border-radius:12px;padding:16px;margin-bottom:12px}
.scene-label{font-size:10px;font-family:'DM Mono',monospace;color:var(--scene);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
.quality-bar-wrap{height:3px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:4px}
.quality-bar{height:100%;border-radius:2px;transition:width .6s ease}
.clip-analysis-row{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)}
.clip-analysis-row:last-child{border-bottom:none}
.quality-badge{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;font-family:'DM Mono',monospace;flex-shrink:0}
.quality-great{background:rgba(181,255,71,.15);color:var(--accent)}
.quality-good{background:rgba(125,249,255,.15);color:var(--accent2)}
.quality-usable{background:rgba(255,165,0,.12);color:#FFA500}
.quality-skip{background:rgba(255,71,87,.12);color:var(--danger)}
.metric-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:5px}
.metric-pill{font-size:9px;font-family:'DM Mono',monospace;padding:2px 7px;border-radius:4px;background:var(--card2);border:1px solid var(--border);color:var(--muted)}
.sparkline{display:flex;gap:1px;align-items:flex-end;height:24px;margin-top:6px}
.spark-bar{width:3px;border-radius:1px;flex-shrink:0;transition:height .1s}
.trim-pill{display:inline-flex;align-items:center;gap:5px;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.25);border-radius:5px;padding:2px 8px;font-size:9px;font-family:'DM Mono',monospace;color:var(--scene);margin-top:4px}
.scene-summary-bar{display:flex;gap:8px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--border);margin-bottom:12px}
.scene-stat{text-align:center;flex:1;min-width:60px}
.scene-stat-num{font-size:18px;font-weight:600;font-family:'DM Mono',monospace}
.scene-stat-label{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:1px}
/* Voice DNA */
.vdna-card{background:linear-gradient(135deg,rgba(255,107,53,.05),rgba(181,255,71,.03));border:1px solid rgba(255,107,53,.18);border-radius:12px;padding:18px;margin-bottom:12px}
.vdna-label{font-size:10px;font-family:'DM Mono',monospace;color:var(--beat);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
.vdna-hint{font-size:11px;color:var(--muted);margin-bottom:12px;line-height:1.5}
.stage-indicator{display:flex;flex-direction:column;align-items:center;gap:14px;padding:60px 20px}
.stage-ring{width:44px;height:44px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite}
.stage-label{font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);text-align:center;max-width:240px;line-height:1.6}
.stage-steps{display:flex;flex-direction:column;gap:8px;width:100%;max-width:280px}
.stage-step{display:flex;align-items:center;gap:10px;font-size:12px;padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card2);transition:all .3s}
.stage-step.active{border-color:var(--accent);background:rgba(181,255,71,.06);color:var(--accent)}
.stage-step.done{border-color:#333;color:#555}
.stage-step-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}
.posting-assets-toggle{display:flex;align-items:center;gap:8px;padding:10px 0;cursor:pointer;font-size:13px;color:var(--muted);border-top:1px solid var(--border);margin-top:12px;user-select:none}
.posting-assets-toggle:hover{color:#e8e8e8}
.blocklist-pill{display:inline-block;background:rgba(255,71,87,.08);border:1px solid rgba(255,71,87,.2);border-radius:4px;padding:1px 7px;font-size:10px;color:var(--danger);font-family:'DM Mono',monospace;margin:2px}
.app{max-width:800px;margin:0 auto;padding:24px 20px 80px}
.logo{display:flex;align-items:center;gap:10px;margin-bottom:28px}
.logo-mark{width:34px;height:34px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;font-size:13px;font-weight:500;color:#080808}
.logo-text{font-size:17px;font-weight:600;letter-spacing:-.3px}
.logo-sub{font-size:11px;color:var(--muted);font-family:'DM Mono',monospace}
.steps{display:flex;gap:6px;margin-bottom:24px}
.step-dot{height:3px;flex:1;border-radius:2px;background:var(--border);transition:background .3s}
.step-dot.done{background:var(--accent)}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:12px}
.section-label{font-size:10px;font-family:'DM Mono',monospace;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}
textarea,input[type=text],input[type=password],select{width:100%;background:var(--card2);border:1px solid var(--border);border-radius:8px;color:#e8e8e8;font-family:'DM Sans',sans-serif;font-size:14px;padding:10px 14px;outline:none;transition:border-color .2s;resize:vertical}
textarea:focus,input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(181,255,71,.08)}
select option{background:#111}
.chip-group{display:flex;flex-wrap:wrap;gap:7px}
.chip{padding:6px 13px;border-radius:20px;border:1px solid var(--border);background:var(--card2);color:var(--muted);font-size:12px;cursor:pointer;transition:all .15s;user-select:none}
.chip.active{background:var(--accent);border-color:var(--accent);color:#080808;font-weight:500}
.plat-chip{display:flex;align-items:center;gap:6px;padding:6px 13px;border-radius:20px;border:1px solid var(--border);background:var(--card2);color:var(--muted);font-size:12px;cursor:pointer;transition:all .15s;user-select:none}
.plat-chip.active{border-width:1.5px;color:#e8e8e8}
.plat-dot{width:7px;height:7px;border-radius:50%}
.hook-card{border:1px solid var(--border);border-radius:9px;padding:12px;cursor:pointer;transition:all .15s;background:var(--card2)}
.hook-card.active{border-color:var(--accent);background:rgba(181,255,71,.06)}
.hook-label{font-size:12px;font-weight:500;margin-bottom:3px}
.hook-ex{font-size:10px;color:var(--muted);font-style:italic;font-family:'DM Mono',monospace}
.btn-primary{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px;border-radius:10px;background:var(--accent);color:#080808;border:none;font-size:15px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;transition:all .15s}
.btn-primary:hover{background:#c8ff60;transform:translateY(-1px)}
.btn-primary:disabled{opacity:.4;cursor:default;transform:none}
.btn-sec{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;background:var(--card2);border:1px solid var(--border);color:#e8e8e8;font-size:13px;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif}
.btn-sec:hover{border-color:#444}
.tab-bar{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:18px;overflow-x:auto}
.tab{padding:9px 14px;font-size:12px;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;white-space:nowrap;background:none;border-top:none;border-left:none;border-right:none;font-family:'DM Sans',sans-serif}
.tab.active{color:var(--accent);border-bottom-color:var(--accent)}
.dropzone{border:1.5px dashed var(--border);border-radius:12px;padding:28px 20px;text-align:center;cursor:pointer;transition:all .2s;background:var(--card2)}
.dropzone.over{border-color:var(--accent);background:rgba(181,255,71,.05)}
.dropzone.beat-zone.over{border-color:var(--beat);background:rgba(255,107,53,.05)}
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-top:10px}
.media-thumb{position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;border:1px solid var(--border);background:var(--card2)}
.media-thumb video,.media-thumb img{width:100%;height:100%;object-fit:cover}
.thumb-label{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.75);font-size:9px;padding:3px 5px;font-family:'DM Mono',monospace;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.thumb-badge{position:absolute;top:3px;left:3px;background:rgba(0,0,0,.7);font-size:9px;padding:1px 5px;border-radius:3px;font-family:'DM Mono',monospace;color:var(--accent)}
.thumb-beat{color:var(--beat)!important}
.thumb-remove{position:absolute;top:3px;right:3px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.7);border:none;color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.script-block{border:1px solid var(--border);border-radius:9px;overflow:hidden;margin-bottom:8px}
.script-ts{background:#1a1a1a;padding:6px 12px;font-family:'DM Mono',monospace;font-size:10px;color:var(--accent);border-bottom:1px solid var(--border);display:flex;justify-content:space-between}
.script-body{padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.script-col-label{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;font-family:'DM Mono',monospace}
.caption-pill{display:inline-block;background:var(--card2);border:1px solid var(--border);border-radius:5px;padding:2px 7px;font-size:10px;color:var(--accent2);font-family:'DM Mono',monospace;margin-top:4px}
.shot-row{display:flex;gap:10px;padding:12px;border-bottom:1px solid var(--border)}
.shot-row:last-child{border-bottom:none}
.shot-num{width:26px;height:26px;border-radius:6px;background:var(--accent);color:#080808;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:'DM Mono',monospace}
.shot-type{font-size:9px;color:var(--accent2);text-transform:uppercase;letter-spacing:.06em;font-family:'DM Mono',monospace;margin-bottom:2px}
.elev-block{background:var(--card2);border-radius:9px;padding:16px;font-family:'DM Mono',monospace;font-size:12px;line-height:1.8;color:#ccc;white-space:pre-wrap;word-break:break-word}
.copy-btn{background:none;border:1px solid var(--border);border-radius:5px;color:var(--muted);font-size:10px;padding:3px 9px;cursor:pointer;font-family:'DM Mono',monospace;transition:all .15s}
.copy-btn:hover{border-color:#444;color:#e8e8e8}
.copy-btn.done{border-color:var(--accent);color:var(--accent)}
.tag{font-family:'DM Mono',monospace;font-size:11px;padding:3px 9px;border-radius:5px;background:var(--card2);border:1px solid var(--border);color:var(--muted)}
.tag-group{display:flex;flex-wrap:wrap;gap:5px}
.tip-row{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px}
.tip-row:last-child{border-bottom:none}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hook-display{background:linear-gradient(135deg,rgba(181,255,71,.08),rgba(125,249,255,.04));border:1px solid rgba(181,255,71,.25);border-radius:12px;padding:18px;margin-bottom:16px}
.hook-eyebrow{font-size:9px;font-family:'DM Mono',monospace;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}
.hook-main{font-size:17px;font-weight:600;line-height:1.4;letter-spacing:-.2px}
.toggle-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px}
.toggle-row:last-child{border-bottom:none}
.toggle{position:relative;display:inline-block;width:36px;height:20px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0}
.toggle-slider{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--border);border-radius:10px;cursor:pointer;transition:.2s}
.toggle-slider:before{content:'';position:absolute;height:14px;width:14px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s}
.toggle input:checked+.toggle-slider{background:var(--accent)}
.toggle input:checked+.toggle-slider:before{transform:translateX(16px)}
.beat-toggle input:checked+.toggle-slider{background:var(--beat)}
.progress-wrap{background:var(--card2);border-radius:100px;height:4px;overflow:hidden;margin-top:10px}
.progress-bar{height:100%;border-radius:100px;transition:width .5s ease}
.progress-bar.beat{background:var(--beat)}
.progress-bar.normal{background:var(--accent)}
.loading-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:16px}
.loading-ring{width:44px;height:44px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite}
.loading-ring.beat{border-top-color:var(--beat)}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-text{font-family:'DM Mono',monospace;font-size:12px;color:var(--muted);text-align:center}
.download-card{background:linear-gradient(135deg,rgba(181,255,71,.1),rgba(181,255,71,.04));border:1px solid rgba(181,255,71,.3);border-radius:14px;padding:24px;text-align:center;margin-bottom:16px}
.download-card.beat{background:linear-gradient(135deg,rgba(255,107,53,.1),rgba(255,107,53,.04));border-color:rgba(255,107,53,.3)}
.download-btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:10px;background:var(--accent);color:#080808;font-weight:600;font-size:15px;text-decoration:none;cursor:pointer;border:none;font-family:'DM Sans',sans-serif}
.download-btn.beat{background:var(--beat);color:#fff}

/* Beat visualiser */
.beat-viz{display:flex;gap:2px;align-items:flex-end;height:40px;margin:10px 0}
.beat-bar{width:3px;border-radius:2px;background:var(--beat);transition:height .1s;flex-shrink:0}
.beat-info-pill{display:inline-flex;align-items:center;gap:8px;background:rgba(255,107,53,.1);border:1px solid rgba(255,107,53,.3);border-radius:8px;padding:8px 14px;font-family:'DM Mono',monospace;font-size:12px;color:var(--beat);margin-bottom:12px}
.beat-dot{width:6px;height:6px;border-radius:50%;background:var(--beat);animation:pulse .6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.7)}}
.assembly-card{background:linear-gradient(135deg,rgba(125,249,255,.04),rgba(181,255,71,.03));border:1px solid rgba(125,249,255,.15);border-radius:12px;padding:18px;margin-bottom:12px}
.assembly-label{font-size:10px;font-family:'DM Mono',monospace;color:var(--accent2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}
.beat-assembly-card{background:linear-gradient(135deg,rgba(255,107,53,.06),rgba(255,107,53,.02));border:1px solid rgba(255,107,53,.2);border-radius:12px;padding:18px;margin-bottom:12px}
.beat-assembly-label{font-size:10px;font-family:'DM Mono',monospace;color:var(--beat);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}
@media(max-width:600px){.script-body,.grid2{grid-template-columns:1fr}}
/* Trend dashboard */
.trend-card{background:linear-gradient(135deg,rgba(125,249,255,.04),rgba(181,255,71,.03));border:1px solid rgba(125,249,255,.15);border-radius:12px;padding:18px;margin-bottom:12px}
.trend-label{font-size:10px;font-family:'DM Mono',monospace;color:var(--accent2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}
.trend-topic{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;color:#ccc;cursor:pointer;transition:color .15s}
.trend-topic:hover{color:var(--accent)}
.trend-topic:last-child{border-bottom:none}
.trend-badge{font-size:9px;font-family:'DM Mono',monospace;padding:2px 7px;border-radius:4px;flex-shrink:0}
.trend-hot{background:rgba(255,71,87,.12);color:var(--danger);border:1px solid rgba(255,71,87,.2)}
.trend-rising{background:rgba(181,255,71,.1);color:var(--accent);border:1px solid rgba(181,255,71,.2)}
.trend-steady{background:rgba(102,102,102,.15);color:var(--muted);border:1px solid var(--border)}
.format-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}
.format-row:last-child{border-bottom:none}
.velocity-up{color:var(--accent);font-family:'DM Mono',monospace;font-size:11px;min-width:24px}
.velocity-flat{color:var(--muted);font-family:'DM Mono',monospace;font-size:11px;min-width:24px}
.music-pill{display:inline-block;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.2);border-radius:12px;padding:3px 10px;font-size:11px;color:var(--scene);margin:3px;cursor:pointer;transition:all .15s}
.music-pill:hover{background:rgba(167,139,250,.2)}
.opp-bar{height:6px;border-radius:3px;background:var(--border);margin-top:4px;overflow:hidden}
.opp-fill{height:100%;border-radius:3px;background:var(--accent);transition:width .8s ease}
/* Modification scale */
.mod-card{background:linear-gradient(135deg,rgba(181,255,71,.04),rgba(181,255,71,.01));border:1px solid rgba(181,255,71,.18);border-radius:12px;padding:18px;margin-bottom:12px}
.mod-scale-track{position:relative;margin:16px 0 8px}
.mod-scale-labels{display:flex;justify-content:space-between;margin-top:6px}
.mod-scale-label{font-size:9px;font-family:'DM Mono',monospace;color:var(--muted);text-align:center;flex:1;transition:color .2s}
.mod-scale-label.active{color:var(--accent)}
.mod-level-desc{font-size:12px;color:#ccc;line-height:1.6;margin-top:10px;padding:10px 12px;background:var(--card2);border-radius:8px;border:1px solid var(--border)}
.mod-level-desc strong{color:var(--accent)}
/* Repurpose mode */
.mode-toggle{display:flex;gap:6px;margin-bottom:20px}
.mode-btn{flex:1;padding:10px;border-radius:9px;border:1px solid var(--border);background:var(--card2);color:var(--muted);font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif;text-align:center}
.mode-btn.active{background:rgba(181,255,71,.08);border-color:var(--accent);color:var(--accent)}
.repurpose-dropzone{border:2px dashed rgba(167,139,250,.4);border-radius:14px;padding:40px 20px;text-align:center;cursor:pointer;transition:all .2s;background:rgba(167,139,250,.03)}
.repurpose-dropzone:hover,.repurpose-dropzone.over{border-color:var(--scene);background:rgba(167,139,250,.07)}
.clip-moment{display:flex;gap:12px;align-items:center;padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all .15s}
.clip-moment:hover{border-color:#333}
.clip-moment.selected{border-color:var(--accent);background:rgba(181,255,71,.04)}
.clip-moment.selected .clip-check{background:var(--accent);border-color:var(--accent);color:#080808}
.clip-check{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;transition:all .15s}
.clip-energy-bar{height:4px;border-radius:2px;background:var(--border);margin-top:6px;overflow:hidden}
.clip-energy-fill{height:100%;border-radius:2px;background:var(--scene);transition:width .6s ease}
.repurpose-gen-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:10px;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);color:var(--scene);font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif;width:100%}
.repurpose-gen-btn:hover{background:rgba(167,139,250,.25)}`;

export default function ReelSprout() {
  const [step, setStep]             = useState(1);
  const [loading, setLoading]       = useState(false);
  const [loadMsg, setLoadMsg]       = useState("");
  const [tab, setTab]               = useState("script");
  const [copied, setCopied]         = useState("");
  const [form, setForm]             = useState({
    topic:"", niche:"gardening / plants", tone:"conversational & warm",
    hookType:"result", duration:"30", extras:"",
    platforms:["tiktok","reels","ytshorts"],
    elevenlabsKey:"", voiceId:"",
    // Voice DNA
    voiceTranscript:"",   // 5+ lines of how the creator actually talks
    fillerWords:"",       // e.g. "okay, honestly, like, anyway"
    tabooPhrases:"",      // phrases this creator would NEVER say
    referenceCreators:"", // e.g. "Epic Gardening, Jenna Marbles"
  });
  const [generationStage, setGenerationStage] = useState(""); // current pipeline stage label
  const [expandPostingAssets, setExpandPostingAssets] = useState(false);
  // App mode & modification scale
  const [appMode, setAppMode]       = useState("create");   // "create" | "repurpose"
  const [modScale, setModScale]     = useState(4);          // 1=suggest only → 5=full auto
  // Trend dashboard
  const [trendData, setTrendData]   = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendExpanded, setTrendExpanded] = useState(false);
  // Repurpose engine
  const [repourposeFile, setRepourposeFile] = useState(null);
  const [repurposeJobId, setRepurposeJobId] = useState(null);
  const [repurposeResult, setRepurposeResult] = useState(null);
  const [repurposeLoading, setRepurposeLoading] = useState(false);
  const [selectedMoments, setSelectedMoments] = useState(new Set());
  const [repurposeDragOver, setRepurposeDragOver] = useState(false);
  const repurposeInput = useRef();

  // ── Creator Brain — persistent creator profile ───────────────────────────
  // Schema: editing fingerprint, language fingerprint, visual identity,
  // and performance history. Stored in localStorage so it survives sessions.
  const CREATOR_BRAIN_KEY = "reelsprout_creator_brain";
  const defaultCreatorProfile = {
    editing: {
      avgShotDurationSec: null,    // null = no override (use trim/beat data)
      cutDensityPerSec:   null,    // null = default 0.15 SKIP_RATE
      jCutFrequency:      0.30,    // 30% of transitions get J-cut treatment
      captionStyle:       null,    // null = random rotation per video
    },
    language: {
      avgSentenceWords: null,
      fillerRate:       null,
      commonPhrases:    [],
      tabooPhrases:     [],
    },
    visual: {
      colorPalette:  [],           // hex colors the creator prefers
      framingStyle:  null,         // "close" | "medium" | "wide"
      brollTexture:  null,         // "minimal" | "moderate" | "heavy"
      captionStyle:  null,         // locked-in caption style
    },
    performance: {
      history:           [],       // { hookType, views, completionPct, durationSec, date }
      winningHookTypes:  [],
      bestDurationRange: null,
    },
    _lastUpdated: null,
  };

  const [creatorProfile, setCreatorProfileState] = useState(() => {
    try {
      const stored = localStorage.getItem(CREATOR_BRAIN_KEY);
      return stored ? { ...defaultCreatorProfile, ...JSON.parse(stored) } : defaultCreatorProfile;
    } catch (_) { return defaultCreatorProfile; }
  });
  const [brainExpanded, setBrainExpanded] = useState(false);

  const setCreatorProfile = (updater) => {
    setCreatorProfileState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const withTimestamp = { ...next, _lastUpdated: new Date().toISOString() };
      try { localStorage.setItem(CREATOR_BRAIN_KEY, JSON.stringify(withTimestamp)); } catch (_) {}
      return withTimestamp;
    });
  };

  const updateEditing = (key, val) =>
    setCreatorProfile(p => ({ ...p, editing: { ...p.editing, [key]: val } }));
  const updateVisual  = (key, val) =>
    setCreatorProfile(p => ({ ...p, visual:  { ...p.visual,  [key]: val } }));
  const [mediaFiles, setMediaFiles] = useState([]);
  const [musicFile, setMusicFile]   = useState(null);
  const [dragOver, setDragOver]     = useState(false);
  const [beatDragOver, setBeatDragOver] = useState(false);
  const fileInput                   = useRef();
  const musicInput                  = useRef();
  const [result, setResult]         = useState(null);
  const [assemblyOpts, setAssemblyOpts] = useState({
    addCaptions: true, addBgMusic: false,
    beatSync: false, beatsPerClip: 2,
  });
  const [jobId, setJobId]           = useState(null);
  const [jobStatus, setJobStatus]   = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [narrateStatus, setNarrateStatus] = useState("");
  const [narrationFilename, setNarrationFilename] = useState(null);
  const [beatData, setBeatData]     = useState(null);
  const [analyzingBeats, setAnalyzingBeats] = useState(false);
  const [sceneData, setSceneData]   = useState(null);
  const [analyzingScene, setAnalyzingScene] = useState(false);
  const [useSceneTrim, setUseSceneTrim] = useState(true);
  const [skippedClips, setSkippedClips] = useState(new Set()); // filenames excluded from assembly
  const [qualityThreshold, setQualityThreshold] = useState(30); // auto-skip below this

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key); setTimeout(() => setCopied(""), 2000);
  };
  const togglePlat = id => setForm(f => ({
    ...f, platforms: f.platforms.includes(id)
      ? f.platforms.filter(p => p !== id) : [...f.platforms, id],
  }));

  // ── Media upload ────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files) => {
    const arr = Array.from(files);
    const prev = arr.map(f => ({
      id: Math.random().toString(36).slice(2), file: f,
      localUrl: URL.createObjectURL(f), filename: null,
      isVideo: f.type.startsWith("video/"),
    }));
    setMediaFiles(p => [...p, ...prev]);
    const fd = new FormData();
    arr.forEach(f => fd.append("files", f));
    try {
      const res  = await fetch(`${SERVER}/api/upload`, { method:"POST", body:fd });
      const data = await res.json();
      setMediaFiles(p => p.map(m => {
        const match = data.files.find(sf => sf.originalName === m.file?.name);
        return match ? { ...m, filename: match.filename } : m;
      }));
    } catch (e) { console.error(e); }
  }, []);

  // ── Music/audio upload ──────────────────────────────────────────────────
  const handleMusic = async (file) => {
    const prev = { id: "music", file, localUrl: URL.createObjectURL(file), filename: null, isAudio: true };
    setMusicFile(prev);
    const fd = new FormData(); fd.append("files", file);
    try {
      const res  = await fetch(`${SERVER}/api/upload`, { method:"POST", body:fd });
      const data = await res.json();
      if (data.files[0]) setMusicFile(p => ({ ...p, filename: data.files[0].filename }));
    } catch (e) { console.error(e); }
  };

  // ── Beat analysis ───────────────────────────────────────────────────────
  const analyzeBeats = async () => {
    const audioSrc = musicFile?.filename || narrationFilename;
    if (!audioSrc) { alert("Upload a music track or generate narration first."); return; }
    setAnalyzingBeats(true);
    try {
      const res  = await fetch(`${SERVER}/api/beats`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          audioFilename: audioSrc,
          clips: mediaFiles.filter(m => m.isVideo && m.filename).map(m => ({ filename: m.filename })),
          beatsPerClip: assemblyOpts.beatsPerClip,
        }),
      });
      const data = await res.json();
      if (data.bpm) { setBeatData(data); }
      else          { alert("Beat analysis failed: " + (data.error || "Unknown error")); }
    } catch (e) { alert("Server error: " + e.message); }
    setAnalyzingBeats(false);
  };

  // ── Scene analysis ──────────────────────────────────────────────────────
  const analyzeScene = async () => {
    const videoClips = mediaFiles.filter(m => m.isVideo && m.filename);
    if (!videoClips.length) { alert("Upload at least one video clip first."); return; }
    setAnalyzingScene(true); setSceneData(null);
    try {
      // Start analysis job
      const res  = await fetch(`${SERVER}/api/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filenames: videoClips.map(m => m.filename),
          targetDuration: parseInt(form.duration) / Math.max(1, videoClips.length),
        }),
      });
      const { analysisId } = await res.json();

      // Poll until done
      await new Promise((resolve) => {
        const iv = setInterval(async () => {
          try {
            const jr = await fetch(`${SERVER}/api/job/${analysisId}`);
            const jd = await jr.json();
      // Auto-skip clips rated below threshold
      if (jd.status === "done") {
        const autoSkip = new Set(
          (jd.results || [])
            .filter(r => r.qualityScore < qualityThreshold)
            .map(r => r.filename)
        );
        setSkippedClips(autoSkip);
        setSceneData({ results: jd.results, summary: jd.summary });
        clearInterval(iv); resolve();
      }
            if (jd.status === "error") { alert("Scene analysis failed: " + jd.message); clearInterval(iv); resolve(); }
          } catch (_) {}
        }, 800);
      });
    } catch (e) { alert("Server error: " + e.message); }
    setAnalyzingScene(false);
  };

  // ── AI cliché blocklist — hard-banned phrases ───────────────────────────
  const AI_BLOCKLIST = [
    "here's the thing","the truth is","if you're doing","stop doing","I wish I knew",
    "nobody talks about","this changes everything","you're probably making",
    "game changer","level up","unlock","transform your","the secret to",
    "what nobody tells you","this is why you","most people don't know",
    "let me show you","here's what works","the biggest mistake",
    "you need to hear this","I had to share this","this is so important",
  ];

  // ── 3-Stage generation pipeline ─────────────────────────────────────────
  const generateScript = async () => {
    setLoading(true); setStep(3);

    const STAGES = [
      { id:"draft",     label:"Stage 1 / 4 — Writing rough spoken draft…"    },
      { id:"strategy",  label:"Stage 2 / 4 — Adding strategy & visual layer…" },
      { id:"roughen",   label:"Stage 3 / 4 — Removing AI fingerprint…"        },
      { id:"evaluate",  label:"Stage 4 / 4 — Would a creator actually post this?…" },
    ];

    const platNames = form.platforms.map(p => PLATFORMS.find(pl=>pl.id===p)?.label).join(", ");
    const hookEx    = HOOK_TYPES.find(h=>h.id===form.hookType)?.label;

    // Build voice DNA block from creator inputs
    const hasVoiceDNA = form.voiceTranscript || form.fillerWords || form.tabooPhrases;
    const VOICE_DNA = hasVoiceDNA ? `
CREATOR VOICE DNA (extracted from their real speech — honour this exactly):
${form.voiceTranscript ? `SPEECH SAMPLES:\n${form.voiceTranscript}\n` : ""}
${form.fillerWords ? `NATURAL FILLERS (use sparingly, only where authentic): ${form.fillerWords}` : ""}
${form.tabooPhrases ? `NEVER USE THESE — creator would never say them: ${form.tabooPhrases}` : ""}
${form.referenceCreators ? `CREATOR REFERENCES — study their style: ${form.referenceCreators}` : ""}

CRITICAL: Do not smooth out this creator's rough edges. If they use fragments, use fragments.
If they hedge, hedge. Their imperfections ARE their voice.` : "";

    const apiCall = async (system, user, maxTokens = 1200) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: maxTokens,
          system, messages: [{ role: "user", content: user }],
        }),
      });
      const data = await res.json();
      return (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
    };

    try {
      // ════════════════════════════════════════════════
      // STAGE 1: DRAFTER
      // Write a rough, believable spoken draft first.
      // No optimization vocabulary. No framework language.
      // Believability over virality.
      // ════════════════════════════════════════════════
      setGenerationStage("draft");
      setLoadMsg(STAGES[0].label);

      const DRAFT_SYSTEM = `You are writing a rough spoken draft for a real person making a video about something they genuinely know.

Write for believability first. Not virality. Not engagement. Believability.

HARD RULES:
- Sound like a person talking to camera from memory, not a strategist with a framework
- Do NOT use these phrases or anything like them: ${AI_BLOCKLIST.join(", ")}
- Do not write hooks that sound "designed" — write hooks that sound blurted
- Do not write complete, balanced, tidy sentences when a fragment works better
- Allow one slightly awkward phrase if it feels true to how this person talks
- Do not resolve every thought cleanly — humans trail off, restart, and land imperfectly
- No tricolons (groups of 3). No symmetrical clauses. No escalating lists.
- Every line must pass this test: "Would a real person actually say this out loud?"
${VOICE_DNA}

OUTPUT FORMAT: JSON only. No explanation. No markdown.`;

      const DRAFT_USER = `TOPIC: ${form.topic}
NICHE: ${form.niche}
TONE: ${form.tone}
DURATION: ${form.duration}s
PLATFORMS: ${platNames}
${form.extras ? `CONTEXT: ${form.extras}` : ""}
${trendData ? `
LIVE TREND CONTEXT (use to inform angles — don't force-fit):
- Top performing format right now: ${trendData.formatTrends?.[0]?.format || ""}
- Trending angle: ${trendData.hookAngles?.[0]?.hookIdea || ""}
- Niche music mood: ${trendData.musicMoods?.[0] || ""}` : ""}
${modScale <= 2 ? "NOTE: User will film and edit themselves. Focus on script clarity over assembly instructions." : ""}
${modScale >= 4 ? "NOTE: Full assembly pipeline will run. Include precise b-roll timing and clip-change cues." : ""}

Write a rough spoken script. Focus on: opening line, main content beats, closing line.
JSON:
{
  "rough_hook": "how this creator would actually open — unpolished is fine",
  "script_draft": [{"beat": "opening|middle|close", "text": "what they'd say", "feel": "emotional quality of this moment"}],
  "narration_rough": "full draft spoken narration — fragments ok, self-corrections ok, fillers ok where natural"
}`;

      const draftRaw  = await apiCall(DRAFT_SYSTEM, DRAFT_USER, 900);
      const draft     = JSON.parse(draftRaw);

      // ════════════════════════════════════════════════
      // STAGE 2: STRATEGIST
      // Takes the human draft and adds visual layer,
      // shot list, captions. Keeps the draft voice intact.
      // ════════════════════════════════════════════════
      setGenerationStage("strategy");
      setLoadMsg(STAGES[1].label);

      const STRAT_SYSTEM = `You are a video director and editor. You have been given a rough spoken draft written by a creator. Your job is to build the visual and structural layer around it — shot list, b-roll, captions, cut types.

RULES:
- Do not rewrite the spoken text. Preserve the creator's rough voice.
- Captions must NEVER repeat the spoken word. They add subtext, context, or irony.
- B-roll describes specific, grounded shots — not generic "lifestyle footage"
- Cut types should vary — not everything is a hard cut
- The CTA should feel like something this creator would actually say, not a marketing line
- The A/B hook must use genuinely different psychology — not just rephrasing the same idea
- Output compact JSON only.`;

      const STRAT_USER = `CREATOR DRAFT:
${JSON.stringify(draft)}

CREATOR PROFILE:
Niche: ${form.niche} | Tone: ${form.tone} | Hook style: ${hookEx} | Duration: ${form.duration}s | Platforms: ${platNames}
${VOICE_DNA}

Build the full content package around this draft. Preserve every rough edge in the spoken text.

JSON schema:
{
  "hook": "the rough_hook refined minimally — do not over-polish",
  "hook_visual": "what appears on screen in first 1.5s — specific",
  "hook_psychology": "one sentence: psychological trigger and why it works for THIS creator's audience",
  "ab_hook": "alternate opening using different psychology — must feel like a different instinct, not a variation",
  "script": [
    {"ts":"0:00","text":"exact spoken text from draft — preserve voice","visual":"specific b-roll: angle, subject, motion","caption":"adds subtext or irony — NOT a repeat","cut":"hard cut|smash cut|whip pan|jump cut|hold","duration":5,"retention_note":"why this beat holds attention"}
  ],
  "shots": [{"n":1,"type":"Close-up|Wide|POV|Macro","subject":"exactly what to film","dur":"3s","tip":"staging or timing note"}],
  "open_loop": "the unanswered tension that makes viewers replay or follow",
  "cta_engineering": "the closing line verbatim + what it triggers (save/share/comment)",
  "elevenlabs": "narration from draft — keep rough edges, add [pause] and CAPS for emphasis only where the creator would naturally stress, ~breath~ where a person actually would"
}`;

      const stratRaw  = await apiCall(STRAT_SYSTEM, STRAT_USER, 1400);
      const strategy  = JSON.parse(stratRaw);

      // ════════════════════════════════════════════════
      // STAGE 3: ROUGHENER (Anti-AI sanitation)
      // Scans every text field for AI tells.
      // Flags and rewrites only what's contaminated.
      // Preserves everything already human-sounding.
      // ════════════════════════════════════════════════
      setGenerationStage("roughen");
      setLoadMsg(STAGES[2].label);

      const ROUGH_SYSTEM = `You are an anti-AI editor. Your job is to remove every trace of AI writing from a video script without changing meaning or gutting personality.

WHAT TO FLAG AND FIX:
- Symmetrical clause structures ("not just X, but Y") → break the symmetry
- Slogan-shaped hooks → make them sound blurted, not designed  
- Abstract persuasion language ("transform," "unlock," "elevate") → replace with concrete verbs
- Manufactured authority ("what actually works," "the real secret") → cut or reframe
- Perfect sentence completion → occasionally let a thought trail or restart
- Captions that are too clever → some should just quietly note what's happening
- Any line from this blocklist: ${AI_BLOCKLIST.join(" | ")}
- ElevenLabs narration that sounds "written to be read aloud" → make it sound talked

WHAT TO PRESERVE:
- Creator's verbal tics and fillers (if present)
- Rough edges that feel authentic
- Specificity and lived detail
- Anything that already sounds genuinely human

OUTPUT: Return the full JSON with only contaminated fields rewritten. Identical JSON structure as input. JSON only.`;

      const ROUGH_USER = `Scan and fix this script package. Be surgical — only rewrite lines with AI tells. Preserve everything that already sounds human.

INPUT:
${JSON.stringify(strategy)}`;

      const roughRaw  = await apiCall(ROUGH_SYSTEM, ROUGH_USER, 1400);
      const roughened = JSON.parse(roughRaw);

      // ════════════════════════════════════════════════
      // STAGE 4: EVALUATOR (Quality gate)
      // Asks: would a real creator actually post this?
      // Scores humanness 0–100. Flags specific fields.
      // If score < 65, patches only the flagged fields.
      // Fail-safe: any error here passes roughened through.
      // ════════════════════════════════════════════════
      setGenerationStage("evaluate");
      setLoadMsg(STAGES[3].label);

      let finalOutput = roughened;
      let evalResult  = null;

      try {
        const EVAL_SYSTEM = `You are a brutally honest short-form video creator with 500k+ followers. You've seen every AI-generated script pattern. You can spot them instantly.

Your job: evaluate whether this script would embarrass a real creator if they posted it. Score it. Flag specific problems. Be surgical.

WHAT MAKES A SCRIPT FAIL:
- Hook sounds "designed" rather than blurted from experience
- Any line that could appear in 10,000 other videos without changing
- Captions that are too clever or ironic in a manufactured way
- Narration that sounds "written to be read aloud" rather than actually spoken
- Generic calls to action the creator would never actually say
- Symmetrical sentence structures still present after roughening
- Manufactured authority phrases still present
- Any phrase that sounds like it came from a content strategy framework

WHAT MAKES A SCRIPT PASS:
- Hook sounds like something this creator actually thought, not engineered
- At least one line has a rough edge that makes you think "only they would say it that way"
- Narration has natural spoken rhythm — not polished, not structured
- Captions feel like the creator's own subtext, not a strategist's layer
- Overall feel: this person made this, not a tool

OUTPUT: JSON only. No explanation. No markdown.

{
  "humanness_score": 0-100,
  "would_creator_post": true|false,
  "verdict": "passes"|"needs_patch",
  "evaluation_notes": "1-2 sentence honest assessment of the overall feel",
  "flags": [
    {
      "field": "hook|ab_hook|narration|script[N].text|script[N].caption|cta_engineering|elevenlabs",
      "issue": "specific problem in plain language",
      "severity": "low|medium|high"
    }
  ]
}

If humanness_score >= 65: verdict = "passes" (even with low/medium flags)
If humanness_score < 65: verdict = "needs_patch" and flags must include at least the high-severity issues
Only flag fields that genuinely have problems. Do not flag for the sake of flagging.`;

        const EVAL_USER = `CREATOR CONTEXT:
Niche: ${form.niche} | Tone: ${form.tone} | Hook style: ${hookEx}
${VOICE_DNA ? "Voice DNA present — check if the output actually honours it." : "No Voice DNA provided."}

SCRIPT TO EVALUATE:
${JSON.stringify(roughened, null, 2)}

Score this honestly. Would you post this if it was your channel?`;

        const evalRaw = await apiCall(EVAL_SYSTEM, EVAL_USER, 600);
        evalResult    = JSON.parse(evalRaw);

        // If it needs patching and has high-severity flags — fix only those fields
        if (evalResult.verdict === "needs_patch" && evalResult.flags?.length) {
          const highFlags = evalResult.flags.filter(f => f.severity === "high");
          const patchFields = highFlags.length ? highFlags : evalResult.flags.slice(0, 2);

          const PATCH_SYSTEM = `You are making final targeted fixes to a video script. Fix ONLY the specific fields listed. Do not touch anything else. Return the complete JSON with the patched fields replaced.

PATCH RULES:
- Remove any remaining AI tells in the flagged fields
- Sound more like the creator actually said this from experience
- Rougher is almost always better than smoother
- Do not introduce new polish while removing old polish
- Preserve every other field exactly as given
JSON only.`;

          const PATCH_USER = `Fix these specific fields in the script:

FIELDS TO PATCH:
${patchFields.map(f => `- ${f.field}: ${f.issue}`).join("\n")}

CREATOR CONTEXT: ${form.niche} | ${form.tone}
${VOICE_DNA}

FULL SCRIPT (return this complete JSON with only flagged fields changed):
${JSON.stringify(roughened, null, 2)}`;

          const patchRaw = await apiCall(PATCH_SYSTEM, PATCH_USER, 1400);
          finalOutput    = JSON.parse(patchRaw);
          evalResult._patched = true;
          evalResult._patchedFields = patchFields.map(f => f.field);
        }
      } catch (evalErr) {
        // Evaluator failure is non-fatal — roughened output still ships
        console.warn("Stage 4 evaluator failed, passing roughened output:", evalErr.message);
        evalResult = { humanness_score: null, verdict: "eval_failed", evaluation_notes: "Evaluator did not run." };
      }

      // ════════════════════════════════════════════════
      // ASSEMBLE FINAL RESULT
      // Core output ready. Posting assets generated
      // lazily only if user expands them.
      // ════════════════════════════════════════════════
      setResult({
        ...finalOutput,
        _draft: draft,              // keep draft for comparison
        _roughened: roughened,      // keep pre-evaluator version
        _eval: evalResult,          // humanness score + flags
        _postingAssetsReady: false, // lazy-load hashtags/SEO/times
      });
      setGenerationStage("");
      setStep(4);

    } catch (e) {
      console.error("Pipeline failed:", e);
      setGenerationStage("");
      setStep(2);
    }
    setLoading(false);
  };

  // ── Lazy-load posting assets (hashtags, SEO, times) ─────────────────────
  const generatePostingAssets = async () => {
    if (!result) return;
    setExpandPostingAssets("loading");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 700,
          system: "Respond only with compact JSON. No markdown. No explanation.",
          messages: [{
            role: "user",
            content: `Generate posting assets for this video.
Hook: "${result.hook}"
Niche: ${form.niche}
Platforms: ${form.platforms.join(", ")}
${trendData ? `Currently trending formats: ${trendData.formatTrends?.slice(0,3).map(f=>f.format).join(", ")}` : ""}

JSON:
{
  "hashtags":{"tiktok":["#tag"],"instagram":["#tag"],"youtube":["tag"]},
  "yt_title":"SEO title — primary keyword first",
  "yt_desc":"2 sentences: hook then keywords",
  "thumbnail":"foreground subject, background, text overlay, face expression",
  "audio_styles":["trending style 1","trending style 2"],
  "tips":["specific tip 1","tip 2","platform-specific tip"],
  "post_times":{"tiktok":"day + time EST","instagram":"day + time EST","youtube":"day + time EST"}
}

Rules: Hashtag mix should look like a real creator chose them, not an AI balanced tool-niche-micro strategy. Include 1-2 slightly niche-weird ones.`
          }],
        }),
      });
      const data  = await res.json();
      const clean = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
      const assets = JSON.parse(clean);
      setResult(r => ({ ...r, ...assets, _postingAssetsReady: true }));
      setExpandPostingAssets(true);
    } catch (e) { setExpandPostingAssets(false); }
  };

  // ── Fetch live trend data ────────────────────────────────────────────────
  const fetchTrends = async (niche) => {
    setTrendLoading(true);
    try {
      const res  = await fetch(`${SERVER}/api/trends?niche=${encodeURIComponent(niche || form.niche)}`);
      const data = await res.json();
      setTrendData(data);
      setTrendExpanded(true);
    } catch (e) { console.warn("Trends fetch failed:", e); }
    setTrendLoading(false);
  };

  // ── Repurpose engine ─────────────────────────────────────────────────────
  const handleRepourposeFile = async (file) => {
    if (!file) return;
    setRepourposeFile(file);
    setRepurposeResult(null);
    setSelectedMoments(new Set());
    setRepurposeLoading(true);
    try {
      // Upload the file first
      const fd = new FormData(); fd.append("files", file);
      const upRes  = await fetch(`${SERVER}/api/upload`, { method:"POST", body:fd });
      const upData = await upRes.json();
      const filename = upData.files?.[0]?.filename;
      if (!filename) throw new Error("Upload failed");

      // Start repurpose job
      const rpRes  = await fetch(`${SERVER}/api/repurpose`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ filename, clipCount:5, minDuration:15, maxDuration:60 }),
      });
      const { jobId } = await rpRes.json();
      setRepurposeJobId(jobId);

      // Poll for completion
      await new Promise((resolve) => {
        const iv = setInterval(async () => {
          try {
            const jRes  = await fetch(`${SERVER}/api/job/${jobId}`);
            const jData = await jRes.json();
            if (jData.status === "done") {
              setRepurposeResult(jData);
              // Select all moments by default
              setSelectedMoments(new Set(jData.clips?.map((_,i) => i) || []));
              clearInterval(iv); resolve();
            } else if (jData.status === "error") {
              clearInterval(iv); resolve();
            }
          } catch (_) {}
        }, 1000);
      });
    } catch (e) { console.error("Repurpose failed:", e); }
    setRepurposeLoading(false);
  };

  const generateRepurposeScripts = async () => {
    if (!repurposeResult?.clips) return;
    const chosen = repurposeResult.clips.filter((_, i) => selectedMoments.has(i));
    if (!chosen.length) return;

    setGenerationStage("draft");
    setLoadMsg(`Generating scripts for ${chosen.length} clips...`);
    setLoading(true);

    try {
      const scripts = await Promise.all(chosen.map(async (clip) => {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            model:"claude-sonnet-4-20250514", max_tokens:600,
            system:"You write short-form video hooks and scripts for specific moments pulled from longer videos. Sound like the creator talking, not a strategist. Output compact JSON only.",
            messages:[{ role:"user", content:
`This clip starts at ${clip.label} in a ${Math.round(repurposeResult.totalDuration/60)}-minute video.
Niche: ${form.niche}. Tone: ${form.tone}.
Energy score: ${clip.energyScore}/100. Duration: ${clip.duration}s.

Generate a viral short-form package for this clip:
{"hook":"opening line under 10 words","caption":"overlay text — not a repeat of hook","elevenlabs":"spoken intro for this clip with [pause] markers","hashtags":["#tag","#tag","#tag"]}`
            }],
          }),
        });
        const data  = await res.json();
        const clean = (data.content?.[0]?.text || "{}").replace(/```json|```/g,"").trim();
        return { ...clip, ...JSON.parse(clean) };
      }));

      setRepurposeResult(r => ({ ...r, scripts }));
    } catch (e) { console.error(e); }

    setGenerationStage("");
    setLoading(false);
  };

  // ── ElevenLabs narration ────────────────────────────────────────────────
  const generateNarration = async () => {
    if (!form.elevenlabsKey || !form.voiceId || !result?.elevenlabs) {
      setNarrateStatus("Enter your ElevenLabs API key and Voice ID."); return;
    }
    setNarrateStatus("Generating narration…");
    try {
      const res  = await fetch(`${SERVER}/api/narrate`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ text:result.elevenlabs, voiceId:form.voiceId, apiKey:form.elevenlabsKey }),
      });
      const data = await res.json();
      if (data.filename) { setNarrationFilename(data.filename); setNarrateStatus("Narration ready!"); }
      else               { setNarrateStatus("Error: " + (data.error || "Unknown")); }
    } catch (e) { setNarrateStatus("Server error — is the server running?"); }
  };

  // ── Video assembly ──────────────────────────────────────────────────────
  const startAssembly = async () => {
    // Filter out clips the user (or auto-skip) has excluded
    const uploadedClips  = mediaFiles.filter(m => m.isVideo  && m.filename && !skippedClips.has(m.filename));
    const uploadedImages = mediaFiles.filter(m => !m.isVideo && m.filename);
    if (!uploadedClips.length && !uploadedImages.length) { alert("No clips included — all are skipped. Toggle some back in the scene panel."); return; }
    setStep(5);

    // Merge scene analysis trim data into clips if available
    const clipsWithTrim = uploadedClips.map(m => {
      const analysis = sceneData?.results?.find(r => r.filename === m.filename);
      return {
        filename: m.filename,
        ...(useSceneTrim && analysis ? { trim: analysis.trim } : {}),
      };
    });

    try {
      const res  = await fetch(`${SERVER}/api/assemble`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          clips:          clipsWithTrim,
          images:         uploadedImages.map(m => ({ filename:m.filename, holdDuration:3 })),
          narrationFile:  narrationFilename || null,
          musicFile:      musicFile?.filename || null,
          scriptSegments: (result?.script||[]).map(s => ({ text:s.caption||s.text, duration:s.duration||5 })),
          platform:       form.platforms[0] || "tiktok",
          addCaptions:    assemblyOpts.addCaptions,
          addBgMusic:     assemblyOpts.addBgMusic || !!musicFile,
          beatSync:       assemblyOpts.beatSync,
          beatsPerClip:   assemblyOpts.beatsPerClip,
          useSceneTrim:   useSceneTrim && !!sceneData,
          // Creator Brain editing fingerprint — wires into FFmpeg pipeline:
          // cut density → SKIP_RATE, shot duration → clip length,
          // J-cut frequency → audio crossfade transitions, captionStyle → ASS renderer
          editingProfile: (creatorProfile.editing.avgShotDurationSec ||
                           creatorProfile.editing.cutDensityPerSec   ||
                           creatorProfile.editing.captionStyle        ||
                           creatorProfile.editing.jCutFrequency !== 0.30)
            ? creatorProfile.editing
            : { jCutFrequency: 0.30 },  // always pass J-cuts with default 30%
        }),
      });
      const data = await res.json();
      if (data.jobId) { setJobId(data.jobId); pollJob(data.jobId); }
    } catch (e) { alert("Server error — is localhost:3001 running?"); setStep(4); }
  };

  const pollJob = id => {
    const iv = setInterval(async () => {
      try {
        const res  = await fetch(`${SERVER}/api/job/${id}`);
        const data = await res.json();
        setJobStatus(data);
        if (data.status === "done")  { clearInterval(iv); setDownloadUrl(`${SERVER}${data.downloadUrl}`); setStep(6); }
        if (data.status === "error") { clearInterval(iv); alert("Error: "+data.message); setStep(4); }
      } catch (_) {}
    }, 1200);
  };

  const isBeatMode = assemblyOpts.beatSync;

  // ════════════════════════════════════════════════════════════════
  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="logo">
          <div className="logo-mark">RS</div>
          <div>
            <div className="logo-text">ReelSprout Studio</div>
            <div className="logo-sub">{isBeatMode ? "beat-sync mode active" : "full video assembly"}</div>
          </div>
        </div>

        <div className="steps">
          {[1,2,3,4,5,6].map(s => <div key={s} className={`step-dot ${step>=s?"done":""}`} />)}
        </div>

        {/* ── STEP 1: Brief ── */}
        {step === 1 && (
          <div>
            {/* Mode toggle */}
            <div className="mode-toggle">
              <div className={`mode-btn ${appMode==="create"?"active":""}`} onClick={()=>setAppMode("create")}>
                ✦ Create new video
              </div>
              <div className={`mode-btn ${appMode==="repurpose"?"active":""}`} onClick={()=>setAppMode("repurpose")}>
                ⟳ Repurpose long video
              </div>
            </div>

            {appMode === "create" && <>
            <div style={{fontSize:22,fontWeight:600,letterSpacing:"-.5px",marginBottom:4}}>What's your video about?</div>
            <div style={{fontSize:13,color:"var(--muted)",marginBottom:22,lineHeight:1.6}}>Fill in your brief, upload footage, and we'll script, narrate, and cut your video — synced to the beat.</div>

            {/* Modification scale */}
            <div className="mod-card">
              <div className="section-label" style={{color:"var(--accent)"}}>AI modification scale</div>
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:4}}>How much should AI change and enhance your raw content?</div>
              <div className="mod-scale-track">
                <input type="range" min={1} max={5} step={1} value={modScale}
                  onChange={e=>setModScale(Number(e.target.value))}
                  style={{width:"100%",accentColor:"var(--accent)"}} />
              </div>
              <div className="mod-scale-labels">
                {["Suggest only","Script + captions","+ Colour grade","+ Voice + assembly","Full auto"].map((l,i)=>(
                  <div key={i} className={`mod-scale-label${modScale===i+1?" active":""}`}>{l}</div>
                ))}
              </div>
              <div className="mod-level-desc">
                {modScale===1 && <><strong>Level 1 — Suggest only.</strong> AI writes the script and shots. You film, edit, and post everything yourself.</>}
                {modScale===2 && <><strong>Level 2 — Script + captions.</strong> AI scripts, directs your shots, and generates caption overlays. You handle the edit.</>}
                {modScale===3 && <><strong>Level 3 — + Visual enhance.</strong> Adds auto colour grade, LUT selection, and clip stabilisation on top of Level 2.</>}
                {modScale===4 && <><strong>Level 4 — + Voice + assembly.</strong> Full pipeline: ElevenLabs narration, beat-sync edit, captions, audio mix. Download and post.</>}
                {modScale===5 && <><strong>Level 5 — Full auto.</strong> Everything in Level 4, plus auto hashtags, optimal post time, and one-click publish to connected platforms.</>}
              </div>
            </div>

            <div className="card">
              <div className="section-label">Topic</div>
              <textarea rows={3} placeholder="e.g. My tomato seedlings at Day 7 — showing root development and why most people water wrong" value={form.topic} onChange={e=>setForm(f=>({...f,topic:e.target.value}))} />
            </div>
            <div className="grid2">
              <div className="card">
                <div className="section-label">Niche</div>
                <select value={form.niche} onChange={e=>{setForm(f=>({...f,niche:e.target.value}));setTrendData(null)}}>{NICHES.map(n=><option key={n}>{n}</option>)}</select>
              </div>
              <div className="card">
                <div className="section-label">Duration</div>
                <select value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))}>
                  <option value="15">15 seconds</option><option value="30">30 seconds</option>
                  <option value="60">60 seconds</option><option value="90">90 seconds</option>
                </select>
              </div>
            </div>

            {/* Trend intelligence panel */}
            <div className="trend-card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div className="trend-label" style={{marginBottom:0}}>Live trend intelligence</div>
                <button className="btn-sec" style={{fontSize:11,padding:"4px 12px"}}
                  onClick={()=>fetchTrends(form.niche)} disabled={trendLoading}>
                  {trendLoading ? "Fetching..." : trendData ? "↺ Refresh" : "Fetch trends"}
                </button>
              </div>
              {!trendData && !trendLoading && (
                <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.6}}>
                  Fetch live data for what's trending in <strong style={{color:"#ccc"}}>{form.niche}</strong> right now — sounds, formats, posting windows, and music moods — before generating your script.
                </div>
              )}
              {trendLoading && (
                <div style={{fontSize:12,color:"var(--muted)",padding:"12px 0",textAlign:"center"}}>Scanning trends...</div>
              )}
              {trendData && (
                <div>
                  {/* Opportunity score */}
                  <div style={{display:"flex",gap:12,marginBottom:14,alignItems:"center"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,color:"var(--muted)",marginBottom:2}}>Niche opportunity</div>
                      <div className="opp-bar"><div className="opp-fill" style={{width:`${trendData.nicheScore?.opportunity||70}%`}} /></div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:18,fontWeight:600,color:"var(--accent)"}}>{trendData.nicheScore?.opportunity}<span style={{fontSize:11,fontWeight:400,color:"var(--muted)"}}>/100</span></div>
                      <div style={{fontSize:10,color:"var(--muted)"}}>{trendData.nicheScore?.growth} growth</div>
                    </div>
                  </div>

                  {/* Format trends */}
                  {trendData.formatTrends?.length > 0 && (
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:10,color:"var(--muted)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>What's performing now</div>
                      {trendData.formatTrends.slice(0,3).map((f,i)=>(
                        <div key={i} className="format-row">
                          <div className={f.velocity.includes("↑↑")?"velocity-up":"velocity-flat"}>{f.velocity}</div>
                          <div>
                            <div style={{fontSize:12,fontWeight:500,color:"#ddd"}}>{f.format}</div>
                            <div style={{fontSize:11,color:"var(--muted)",lineHeight:1.5}}>{f.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Hook angles from trending topics */}
                  {trendData.hookAngles?.length > 0 && (
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:10,color:"var(--muted)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>Trending angles — click to use</div>
                      {trendData.hookAngles.map((h,i)=>(
                        <div key={i} className="trend-topic" onClick={()=>setForm(f=>({...f,topic:h.hookIdea}))}>
                          <span className="trend-badge trend-hot">trending</span>
                          <span>{h.hookIdea}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Music suggestions */}
                  {trendData.musicMoods?.length > 0 && (
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:10,color:"var(--muted)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>Music moods for your niche</div>
                      <div>{trendData.musicMoods.map((m,i)=><span key={i} className="music-pill">{m}</span>)}</div>
                    </div>
                  )}

                  {/* Best post times */}
                  <div>
                    <div style={{fontSize:10,color:"var(--muted)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>Best post windows this week</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      {Object.entries(trendData.postWindows||{}).map(([plat,times])=>(
                        <div key={plat} style={{background:"var(--card2)",borderRadius:8,padding:"8px 10px"}}>
                          <div style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>{plat}</div>
                          {(Array.isArray(times)?times:[times]).slice(0,2).map((t,i)=>(
                            <div key={i} style={{fontSize:11,color:"var(--accent2)"}}>{t}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="card">
              <div className="section-label">Platforms</div>
              <div className="chip-group">
                {PLATFORMS.map(p=>(
                  <div key={p.id} className={`plat-chip ${form.platforms.includes(p.id)?"active":""}`}
                    style={form.platforms.includes(p.id)?{borderColor:p.color,color:p.color}:{}} onClick={()=>togglePlat(p.id)}>
                    <div className="plat-dot" style={{background:p.color}}/>{p.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="section-label">Hook style</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                {HOOK_TYPES.map(h=>(
                  <div key={h.id} className={`hook-card ${form.hookType===h.id?"active":""}`} onClick={()=>setForm(f=>({...f,hookType:h.id}))}>
                    <div className="hook-label">{h.label}</div><div className="hook-ex">{h.ex}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="section-label">Tone</div>
              <div className="chip-group">{TONES.map(t=><div key={t} className={`chip ${form.tone===t?"active":""}`} onClick={()=>setForm(f=>({...f,tone:t}))}>{t}</div>)}</div>
            </div>

            {/* Voice DNA */}
            <div className="vdna-card">
              <div className="vdna-label">Voice DNA <span style={{color:"var(--muted)",fontWeight:400,textTransform:"none",letterSpacing:0}}>— optional but powerful</span></div>
              <div className="vdna-hint">The more of this you fill in, the less the output sounds like AI. Even 3 lines of how you talk is enough to shift the whole script.</div>

              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:5}}>How you actually talk — paste 3–10 lines from your past videos or voice memos</div>
                <textarea rows={4} placeholder={"okay so like, I've been doing this wrong for two years honestly\nand then I realized — wait, the soil isn't even the problem\nanyway. here's what I actually do now..."} value={form.voiceTranscript} onChange={e=>setForm(f=>({...f,voiceTranscript:e.target.value}))} style={{fontSize:12,lineHeight:1.6}} />
              </div>

              <div className="grid2" style={{gap:8,marginBottom:10}}>
                <div>
                  <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Your natural fillers <span style={{color:"var(--beat)"}}>*</span></div>
                  <input type="text" placeholder="okay, honestly, like, anyway, wait" value={form.fillerWords} onChange={e=>setForm(f=>({...f,fillerWords:e.target.value}))} />
                </div>
                <div>
                  <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Phrases you'd never say</div>
                  <input type="text" placeholder="game changer, unlock, level up" value={form.tabooPhrases} onChange={e=>setForm(f=>({...f,tabooPhrases:e.target.value}))} />
                </div>
              </div>

              <div>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Creators whose style resonates with you</div>
                <input type="text" placeholder="e.g. Epic Gardening, Mark Rober, Nara Smith" value={form.referenceCreators} onChange={e=>setForm(f=>({...f,referenceCreators:e.target.value}))} />
              </div>

              <div style={{marginTop:12,padding:"8px 0",borderTop:"1px solid var(--border)"}}>
                <div style={{fontSize:10,color:"var(--muted)",fontFamily:"'DM Mono',monospace",marginBottom:5}}>ALWAYS blocked regardless of input:</div>
                <div>{AI_BLOCKLIST.slice(0,8).map(p=><span key={p} className="blocklist-pill">{p}</span>)}<span style={{fontSize:10,color:"var(--muted)",marginLeft:4}}>+{AI_BLOCKLIST.length-8} more</span></div>
              </div>
            </div>

            <button className="btn-primary" onClick={()=>setStep(2)} disabled={!form.topic.trim()}>Next: Upload footage →</button>

            {/* ── Creator Brain ─────────────────────────────────────────── */}
            <div style={{marginTop:20}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"10px 14px",borderRadius:"var(--radius)",border:"1px solid var(--border)",background:brainExpanded?"rgba(125,249,255,.05)":"transparent"}}
                onClick={()=>setBrainExpanded(b=>!b)}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--accent2)"}}>⬡ Creator Brain</div>
                  {creatorProfile._lastUpdated && (
                    <span style={{fontSize:9,padding:"2px 7px",borderRadius:10,background:"rgba(125,249,255,.12)",color:"var(--accent2)",fontWeight:500}}>ACTIVE</span>
                  )}
                  <div style={{fontSize:11,color:"var(--muted)"}}>teach the engine your editing style</div>
                </div>
                <div style={{fontSize:12,color:"var(--muted)"}}>{brainExpanded?"▲":"▼"}</div>
              </div>

              {brainExpanded && (
                <div style={{border:"1px solid var(--border)",borderTop:"none",borderRadius:"0 0 var(--radius) var(--radius)",padding:"14px 14px 16px",background:"rgba(0,0,0,.15)"}}>

                  {/* Editing fingerprint */}
                  <div style={{fontSize:11,color:"var(--accent2)",fontWeight:600,textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>Editing fingerprint</div>
                  <div style={{fontSize:11,color:"var(--muted)",marginBottom:12,lineHeight:1.5}}>These values wire directly into the FFmpeg assembly pipeline — not just a prompt. Cut density controls the organic hold rate. Shot duration sets the default clip length when no beat/scene data is present.</div>

                  <div className="grid2" style={{gap:8,marginBottom:12}}>
                    <div>
                      <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Avg shot duration (sec)</div>
                      <input type="number" min="1" max="15" step="0.5"
                        placeholder="e.g. 3.5 — leave blank for auto"
                        value={creatorProfile.editing.avgShotDurationSec || ""}
                        onChange={e=>updateEditing("avgShotDurationSec", e.target.value ? parseFloat(e.target.value) : null)} />
                    </div>
                    <div>
                      <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Cut density (cuts/sec)</div>
                      <input type="number" min="0.5" max="5" step="0.1"
                        placeholder="e.g. 1.7 — leave blank for auto"
                        value={creatorProfile.editing.cutDensityPerSec || ""}
                        onChange={e=>updateEditing("cutDensityPerSec", e.target.value ? parseFloat(e.target.value) : null)} />
                    </div>
                  </div>

                  <div className="grid2" style={{gap:8,marginBottom:14}}>
                    <div>
                      <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>J-cut frequency</div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <input type="range" min="0" max="1" step="0.05"
                          value={creatorProfile.editing.jCutFrequency}
                          onChange={e=>updateEditing("jCutFrequency", parseFloat(e.target.value))}
                          style={{flex:1}} />
                        <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--scene)",minWidth:32}}>
                          {Math.round(creatorProfile.editing.jCutFrequency * 100)}%
                        </span>
                      </div>
                      <div style={{fontSize:10,color:"var(--muted)",marginTop:3}}>% of cuts that get audio crossfade treatment</div>
                    </div>
                    <div>
                      <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Caption style</div>
                      <select value={creatorProfile.editing.captionStyle || ""}
                        onChange={e=>updateEditing("captionStyle", e.target.value || null)}>
                        <option value="">Random per video</option>
                        <option value="default">Default</option>
                        <option value="clean">Clean</option>
                        <option value="bold">Bold</option>
                        <option value="lower">Lower third</option>
                      </select>
                    </div>
                  </div>

                  {/* Visual identity */}
                  <div style={{fontSize:11,color:"var(--accent2)",fontWeight:600,textTransform:"uppercase",letterSpacing:".07em",marginBottom:10,paddingTop:12,borderTop:"1px solid var(--border)"}}>Visual identity</div>

                  <div className="grid2" style={{gap:8,marginBottom:12}}>
                    <div>
                      <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Framing style</div>
                      <select value={creatorProfile.visual.framingStyle || ""}
                        onChange={e=>updateVisual("framingStyle", e.target.value || null)}>
                        <option value="">Not set</option>
                        <option value="close">Close-up</option>
                        <option value="medium">Medium</option>
                        <option value="wide">Wide</option>
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>B-roll density</div>
                      <select value={creatorProfile.visual.brollTexture || ""}
                        onChange={e=>updateVisual("brollTexture", e.target.value || null)}>
                        <option value="">Not set</option>
                        <option value="minimal">Minimal (talk-to-camera)</option>
                        <option value="moderate">Moderate</option>
                        <option value="heavy">Heavy (every 2–3 sec)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:4}}>
                    <div style={{fontSize:10,color:"var(--muted)"}}>
                      {creatorProfile._lastUpdated
                        ? `Last updated ${new Date(creatorProfile._lastUpdated).toLocaleDateString()}`
                        : "Not saved yet — changes save automatically"}
                    </div>
                    <button style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid rgba(255,100,100,.3)",background:"transparent",color:"rgba(255,100,100,.7)",cursor:"pointer"}}
                      onClick={()=>{ if(window.confirm("Reset Creator Brain? This clears all stored editing preferences.")) setCreatorProfile(defaultCreatorProfile); }}>
                      Reset brain
                    </button>
                  </div>
                </div>
              )}
            </div>
            </>}

            {/* ── REPURPOSE MODE ── */}
            {appMode === "repurpose" && (
              <div>
                <div style={{fontSize:22,fontWeight:600,letterSpacing:"-.5px",marginBottom:4}}>Repurpose a long video</div>
                <div style={{fontSize:13,color:"var(--muted)",marginBottom:22,lineHeight:1.6}}>Upload a podcast, tutorial, or long-form video. We'll find the best moments and generate short-form scripts + hooks for each one.</div>

                {/* Niche + platform for context */}
                <div className="grid2" style={{marginBottom:0}}>
                  <div className="card">
                    <div className="section-label">Niche</div>
                    <select value={form.niche} onChange={e=>setForm(f=>({...f,niche:e.target.value}))}>{NICHES.map(n=><option key={n}>{n}</option>)}</select>
                  </div>
                  <div className="card">
                    <div className="section-label">Tone</div>
                    <select value={form.tone} onChange={e=>setForm(f=>({...f,tone:e.target.value}))}>{TONES.map(t=><option key={t}>{t}</option>)}</select>
                  </div>
                </div>

                {/* Long video upload */}
                <div style={{marginTop:12}}>
                  <div className="section-label" style={{marginBottom:6}}>Your long video</div>
                  <div className={`repurpose-dropzone${repurposeDragOver?" over":""}`}
                    onDrop={e=>{e.preventDefault();setRepurposeDragOver(false);const f=e.dataTransfer.files[0];if(f)handleRepourposeFile(f)}}
                    onDragOver={e=>{e.preventDefault();setRepurposeDragOver(true)}}
                    onDragLeave={()=>setRepurposeDragOver(false)}
                    onClick={()=>repurposeInput.current.click()}>
                    {!repourposeFile && <>
                      <div style={{fontSize:30,marginBottom:10,color:"var(--scene)"}}>⟳</div>
                      <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>Drop your long video here</div>
                      <div style={{fontSize:12,color:"var(--muted)"}}>MP4 · MOV · Works on podcasts, tutorials, vlogs, interviews</div>
                      <div style={{fontSize:11,color:"var(--muted)",marginTop:6}}>We'll find the top 5 viral moments automatically</div>
                    </>}
                    {repourposeFile && !repurposeLoading && !repurposeResult && (
                      <div style={{fontSize:13,color:"var(--scene)"}}>Uploaded: {repourposeFile.name}</div>
                    )}
                    {repurposeLoading && (
                      <div style={{fontSize:13,color:"var(--scene)"}}>
                        <div style={{marginBottom:8}}>Analysing {repourposeFile?.name}...</div>
                        <div style={{fontSize:11,color:"var(--muted)"}}>Scanning audio energy peaks to find viral moments</div>
                      </div>
                    )}
                    <input ref={repurposeInput} type="file" accept="video/*" style={{display:"none"}}
                      onChange={e=>{const f=e.target.files[0];if(f)handleRepourposeFile(f)}} />
                  </div>
                </div>

                {/* Moments list */}
                {repurposeResult?.clips && (
                  <div style={{marginTop:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div className="section-label" style={{marginBottom:0}}>Top moments found — {Math.round(repurposeResult.totalDuration/60)} min video</div>
                      <div style={{fontSize:11,color:"var(--muted)"}}>{selectedMoments.size} selected</div>
                    </div>
                    {repurposeResult.clips.map((clip,i)=>(
                      <div key={i} className={`clip-moment${selectedMoments.has(i)?" selected":""}`}
                        onClick={()=>setSelectedMoments(prev=>{const n=new Set(prev);n.has(i)?n.delete(i):n.add(i);return n})}>
                        <div className="clip-check">{selectedMoments.has(i)?"✓":""}</div>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                            <div style={{fontSize:13,fontWeight:500}}>Moment {clip.index} <span style={{color:"var(--muted)",fontWeight:400,fontFamily:"'DM Mono',monospace",fontSize:11}}>@ {clip.label}</span></div>
                            <div style={{fontSize:11,color:"var(--muted)"}}>{clip.duration}s</div>
                          </div>
                          <div className="clip-energy-bar"><div className="clip-energy-fill" style={{width:`${clip.energyScore}%`}} /></div>
                          <div style={{fontSize:10,color:"var(--muted)",marginTop:3,fontFamily:"'DM Mono',monospace"}}>energy {clip.energyScore} · silence {clip.silenceRat}%</div>
                        </div>
                        {clip.filename && (
                          <a href={`${SERVER}/outputs/${clip.filename}`} download onClick={e=>e.stopPropagation()}
                            style={{fontSize:10,color:"var(--accent2)",textDecoration:"none",padding:"4px 8px",border:"1px solid rgba(125,249,255,.2)",borderRadius:5}}>↓</a>
                        )}
                      </div>
                    ))}

                    {/* Scripts already generated */}
                    {repurposeResult.scripts && (
                      <div style={{marginTop:16}}>
                        <div className="section-label" style={{color:"var(--scene)"}}>Generated scripts</div>
                        {repurposeResult.scripts.map((s,i)=>(
                          <div key={i} className="scene-card" style={{marginBottom:10}}>
                            <div className="scene-label">Clip {s.index} @ {s.label}</div>
                            <div style={{fontSize:13,fontWeight:500,marginBottom:4,color:"var(--accent)"}}>"{s.hook}"</div>
                            <div style={{fontSize:12,color:"var(--muted)",marginBottom:6}}>{s.caption}</div>
                            <div style={{fontSize:11,color:"var(--scene)",fontStyle:"italic",lineHeight:1.6,marginBottom:8}}>{s.elevenlabs}</div>
                            <div>{(s.hashtags||[]).map((h,j)=><span key={j} className="blocklist-pill" style={{color:"var(--accent2)"}}>{h}</span>)}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!repurposeResult.scripts && (
                      <button className="repurpose-gen-btn" style={{marginTop:12}}
                        disabled={selectedMoments.size===0||loading}
                        onClick={generateRepurposeScripts}>
                        {loading ? "Generating..." : `✦ Generate scripts for ${selectedMoments.size} selected moment${selectedMoments.size!==1?"s":""}`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Media + Music ── */}
        {step === 2 && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div><div style={{fontSize:18,fontWeight:600,letterSpacing:"-.3px"}}>Upload footage + music</div><div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>Videos, photos, and your background track</div></div>
              <button className="btn-sec" onClick={()=>setStep(1)}>← Back</button>
            </div>

            {/* Video / image drop */}
            <div className="section-label" style={{marginBottom:6}}>Your clips & photos</div>
            <div className={`dropzone ${dragOver?"over":""}`} onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles(e.dataTransfer.files)}} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onClick={()=>fileInput.current.click()}>
              <div style={{fontSize:24,marginBottom:8}}>+</div>
              <div style={{fontSize:13,fontWeight:500,marginBottom:3}}>Drop videos & photos</div>
              <div style={{fontSize:11,color:"var(--muted)"}}>MP4 · MOV · JPG · PNG</div>
              <input ref={fileInput} type="file" multiple accept="video/*,image/*" style={{display:"none"}} onChange={e=>handleFiles(e.target.files)} />
            </div>

            {mediaFiles.length > 0 && (
              <div className="media-grid">
                {mediaFiles.map(m=>(
                  <div className="media-thumb" key={m.id}>
                    {m.isVideo ? <video src={m.localUrl} muted playsInline style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <img src={m.localUrl} alt="" />}
                    <div className="thumb-badge">{m.isVideo?"VID":"IMG"}</div>
                    <div className="thumb-label">{m.file?.name||"file"}</div>
                    <button className="thumb-remove" onClick={()=>setMediaFiles(p=>p.filter(x=>x.id!==m.id))}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Music drop */}
            <div className="section-label" style={{marginTop:18,marginBottom:6}}>Background music track <span style={{color:"var(--beat)",fontFamily:"'DM Mono',monospace",fontSize:9}}>FOR BEAT SYNC</span></div>
            <div className={`dropzone beat-zone ${beatDragOver?"over":""}`}
              onDrop={e=>{e.preventDefault();setBeatDragOver(false);const f=e.dataTransfer.files[0];if(f)handleMusic(f);}}
              onDragOver={e=>{e.preventDefault();setBeatDragOver(true)}} onDragLeave={()=>setBeatDragOver(false)}
              onClick={()=>musicInput.current.click()}
              style={{borderColor:musicFile?"rgba(255,107,53,.5)":"var(--border)",padding:"16px 20px"}}>
              {musicFile
                ? <div style={{fontSize:12,color:"var(--beat)",fontFamily:"'DM Mono',monospace"}}>{musicFile.file?.name} {musicFile.filename?"✓":""}</div>
                : <><div style={{fontSize:13,fontWeight:500,marginBottom:2}}>Drop your music track here</div><div style={{fontSize:11,color:"var(--muted)"}}>MP3 · WAV · AAC — beats detected automatically</div></>
              }
              <input ref={musicInput} type="file" accept="audio/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)handleMusic(f);}} />
            </div>
            {musicFile && <div style={{fontSize:11,color:"var(--muted)",marginTop:4,fontFamily:"'DM Mono',monospace"}}>Enable "Beat sync" in the Assemble tab to cut on the beat.</div>}

            <div className="card" style={{marginTop:14,background:"rgba(125,249,255,.04)",borderColor:"rgba(125,249,255,.12)"}}>
              <div className="section-label" style={{color:"var(--accent2)"}}>ElevenLabs (optional)</div>
              <div className="grid2" style={{gap:8}}>
                <div><div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>API key</div><input type="password" placeholder="sk_..." value={form.elevenlabsKey} onChange={e=>setForm(f=>({...f,elevenlabsKey:e.target.value}))} /></div>
                <div><div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Voice ID</div><input type="text" placeholder="From ElevenLabs dashboard" value={form.voiceId} onChange={e=>setForm(f=>({...f,voiceId:e.target.value}))} /></div>
              </div>
            </div>

            <button className="btn-primary" onClick={generateScript} disabled={!form.topic.trim()}>Generate script →</button>
          </div>
        )}

        {/* ── STEP 3: Pipeline ── */}
        {step === 3 && (
          <div className="stage-indicator">
            <div className="stage-ring"/>
            <div className="stage-label">{loadMsg || "Starting pipeline…"}</div>
            <div className="stage-steps">
              {[
                {id:"draft",    label:"Drafter — writing in your voice"},
                {id:"strategy", label:"Director — adding visual layer"},
                {id:"roughen",  label:"Editor — removing AI fingerprint"},
                {id:"evaluate", label:"Critic — would you actually post this?"},
              ].map(s => (
                <div key={s.id} className={`stage-step ${generationStage===s.id?"active":generationStage&&["draft","strategy","roughen","evaluate"].indexOf(generationStage)>["draft","strategy","roughen","evaluate"].indexOf(s.id)?"done":""}`}>
                  <div className="stage-step-dot"/>
                  <span>{s.label}</span>
                  {generationStage && ["draft","strategy","roughen","evaluate"].indexOf(generationStage) > ["draft","strategy","roughen","evaluate"].indexOf(s.id) && <span style={{marginLeft:"auto",fontSize:10}}>✓</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 4: Results ── */}
        {step === 4 && result && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:11,color:"var(--muted)",fontFamily:"'DM Mono',monospace",marginBottom:3}}>content package ready</div>
                <div style={{fontSize:16,fontWeight:600,letterSpacing:"-.3px"}}>{form.topic.slice(0,55)}{form.topic.length>55?"...":""}</div>
              </div>
              <button className="btn-sec" onClick={()=>{setStep(1);setResult(null);}}>← New</button>
            </div>

            <div className="hook-display">
              <div className="hook-eyebrow">Opening hook</div>
              <div className="hook-main">"{result.hook}"</div>
              {result.hook_visual && <div style={{fontSize:11,color:"var(--muted)",marginTop:6,fontStyle:"italic"}}>On screen: {result.hook_visual}</div>}
            </div>

            <div className="tab-bar">
              {[{id:"script",l:"Script"},{id:"shots",l:"Shots"},{id:"elevenlabs",l:"ElevenLabs"},{id:"youtube",l:"YouTube"},{id:"platform",l:"Platform"},{id:"assemble",l:"Assemble"}].map(t=>(
                <button key={t.id} className={`tab ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>{t.l}</button>
              ))}
            </div>

            {/* Script */}
            {tab==="script" && (
              <div>
                {/* Stage 4 Evaluator result card */}
                {result._eval && result._eval.humanness_score !== null && (
                  <div style={{
                    marginBottom:14,padding:14,borderRadius:10,
                    background: result._eval.humanness_score >= 75
                      ? "rgba(181,255,71,.05)"
                      : result._eval.humanness_score >= 65
                      ? "rgba(255,165,0,.05)"
                      : "rgba(255,71,87,.05)",
                    border: `1px solid ${result._eval.humanness_score >= 75 ? "rgba(181,255,71,.2)" : result._eval.humanness_score >= 65 ? "rgba(255,165,0,.2)" : "rgba(255,71,87,.2)"}`,
                  }}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                      <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:".06em",
                        color: result._eval.humanness_score >= 75 ? "var(--accent)" : result._eval.humanness_score >= 65 ? "#FFA500" : "var(--danger)"}}>
                        Stage 4 — Creator quality check
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        {result._eval._patched && (
                          <span style={{fontSize:9,fontFamily:"'DM Mono',monospace",color:"var(--accent2)",background:"rgba(125,249,255,.1)",padding:"2px 7px",borderRadius:4}}>
                            patched {result._eval._patchedFields?.length} field{result._eval._patchedFields?.length!==1?"s":""}
                          </span>
                        )}
                        <div style={{fontSize:22,fontWeight:700,fontFamily:"'DM Mono',monospace",
                          color: result._eval.humanness_score >= 75 ? "var(--accent)" : result._eval.humanness_score >= 65 ? "#FFA500" : "var(--danger)"}}>
                          {result._eval.humanness_score}<span style={{fontSize:12,fontWeight:400,color:"var(--muted)"}}>/100</span>
                        </div>
                      </div>
                    </div>
                    {result._eval.evaluation_notes && (
                      <div style={{fontSize:12,color:"#bbb",lineHeight:1.6,fontStyle:"italic",marginBottom:result._eval.flags?.length?10:0}}>
                        "{result._eval.evaluation_notes}"
                      </div>
                    )}
                    {result._eval.flags?.length > 0 && (
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {result._eval.flags.map((f,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:11,color:"var(--muted)"}}>
                            <span style={{
                              fontSize:8,fontFamily:"'DM Mono',monospace",padding:"2px 5px",borderRadius:3,flexShrink:0,marginTop:1,
                              background: f.severity==="high" ? "rgba(255,71,87,.15)" : f.severity==="medium" ? "rgba(255,165,0,.12)" : "rgba(102,102,102,.12)",
                              color: f.severity==="high" ? "var(--danger)" : f.severity==="medium" ? "#FFA500" : "var(--muted)",
                            }}>{f.severity}</span>
                            <span><span style={{fontFamily:"'DM Mono',monospace",color:"#888",fontSize:10}}>{f.field}</span> — {f.issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Pipeline provenance — show what the roughener changed */}
                {result._draft && (
                  <details style={{marginBottom:14}}>
                    <summary style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--muted)",cursor:"pointer",padding:"8px 0",userSelect:"none",listStyle:"none",display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:9,color:"var(--accent)"}}>▶</span> See stage 1 rough draft — what the AI wrote before sanitation
                    </summary>
                    <div style={{marginTop:8,padding:14,background:"rgba(255,107,53,.04)",border:"1px solid rgba(255,107,53,.15)",borderRadius:10}}>
                      <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:"var(--beat)",marginBottom:8,textTransform:"uppercase",letterSpacing:".06em"}}>Stage 1 raw draft — unedited</div>
                      {result._draft.rough_hook && <div style={{marginBottom:8}}><span style={{fontSize:10,color:"var(--muted)"}}>Opening: </span><span style={{fontSize:13,color:"#ddd",fontStyle:"italic"}}>"{result._draft.rough_hook}"</span></div>}
                      {(result._draft.script_draft||[]).map((b,i)=>(
                        <div key={i} style={{padding:"6px 0",borderBottom:"1px solid var(--border)",fontSize:12,color:"#bbb",lineHeight:1.6}}>
                          <span style={{fontSize:9,fontFamily:"'DM Mono',monospace",color:"var(--muted)",marginRight:8}}>{b.beat}</span>{b.text}
                          {b.feel && <span style={{marginLeft:8,fontSize:10,color:"var(--muted)",fontStyle:"italic"}}>[{b.feel}]</span>}
                        </div>
                      ))}
                      <div style={{marginTop:8,fontSize:10,color:"var(--muted)"}}>Stage 3 roughener rewrote fields with AI tells. Stage 4 evaluator scored and patched any that still felt manufactured.</div>
                    </div>
                  </details>
                )}
                {/* Hook psychology + A/B hook */}
                {(result.hook_psychology || result.ab_hook) && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                    {result.hook_psychology && (
                      <div className="card" style={{background:"rgba(181,255,71,.04)",borderColor:"rgba(181,255,71,.15)",padding:14}}>
                        <div className="section-label" style={{marginBottom:5}}>Why this hook works</div>
                        <div style={{fontSize:12,color:"#ccc",lineHeight:1.6,fontStyle:"italic"}}>{result.hook_psychology}</div>
                      </div>
                    )}
                    {result.ab_hook && (
                      <div className="card" style={{background:"rgba(125,249,255,.04)",borderColor:"rgba(125,249,255,.15)",padding:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                          <div className="section-label" style={{marginBottom:5,color:"var(--accent2)"}}>A/B alternate hook</div>
                          <button className={`copy-btn ${copied==="abhook"?"done":""}`} onClick={()=>copy(result.ab_hook,"abhook")}>{copied==="abhook"?"copied!":"copy"}</button>
                        </div>
                        <div style={{fontSize:13,fontWeight:500,color:"#ddd",lineHeight:1.5}}>"{result.ab_hook}"</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Open loop + CTA */}
                {(result.open_loop || result.cta_engineering) && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                    {result.open_loop && (
                      <div className="card" style={{padding:14}}>
                        <div className="section-label" style={{marginBottom:5}}>Open loop planted</div>
                        <div style={{fontSize:12,color:"#ccc",lineHeight:1.6}}>{result.open_loop}</div>
                      </div>
                    )}
                    {result.cta_engineering && (
                      <div className="card" style={{padding:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",gap:6}}>
                          <div className="section-label" style={{marginBottom:5}}>Engineered CTA</div>
                          <button className={`copy-btn ${copied==="cta"?"done":""}`} onClick={()=>copy(result.cta_engineering,"cta")}>{copied==="cta"?"copied!":"copy"}</button>
                        </div>
                        <div style={{fontSize:12,color:"#ccc",lineHeight:1.6}}>{result.cta_engineering}</div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
                  <button className={`copy-btn ${copied==="script"?"done":""}`} onClick={()=>copy((result.script||[]).map(s=>`[${s.ts}] ${s.text}\nVISUAL: ${s.visual}`).join("\n\n"),"script")}>{copied==="script"?"copied!":"copy all"}</button>
                </div>
                {(result.script||[]).map((s,i)=>(
                  <div className="script-block" key={i}>
                    <div className="script-ts">
                      <span>{s.ts}</span>
                      <span style={{color:"var(--muted)"}}>{s.cut||"hard cut"}</span>
                    </div>
                    <div className="script-body">
                      <div>
                        <div className="script-col-label">Speak</div>
                        <div style={{fontSize:13,lineHeight:1.6,color:"#ddd"}}>{s.text}</div>
                        {s.caption && <div className="caption-pill">{s.caption}</div>}
                        {s.retention_note && <div style={{fontSize:10,color:"var(--muted)",marginTop:5,fontStyle:"italic"}}>↳ {s.retention_note}</div>}
                      </div>
                      <div>
                        <div className="script-col-label">B-roll</div>
                        <div style={{fontSize:12,lineHeight:1.5,color:"var(--muted)",fontStyle:"italic"}}>{s.visual}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Shots */}
            {tab==="shots" && (
              <div>
                <div className="card" style={{padding:0,overflow:"hidden"}}>
                  {(result.shots||[]).map((s,i)=>(
                    <div className="shot-row" key={i}>
                      <div className="shot-num">{s.n||i+1}</div>
                      <div style={{flex:1}}>
                        <div className="shot-type">{s.type}</div>
                        <div style={{fontSize:13,fontWeight:500,marginBottom:2}}>{s.subject}</div>
                        <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.5}}>{s.tip}</div>
                      </div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--muted)",flexShrink:0}}>{s.dur}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ElevenLabs */}
            {tab==="elevenlabs" && (
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:12,color:"var(--muted)"}}>Paste into ElevenLabs or auto-generate below</div>
                  <button className={`copy-btn ${copied==="elev"?"done":""}`} onClick={()=>copy(result.elevenlabs||"","elev")}>{copied==="elev"?"copied!":"copy"}</button>
                </div>
                <div className="elev-block">{result.elevenlabs}</div>
                <div className="card" style={{marginTop:12}}>
                  <div className="section-label">Auto-generate narration</div>
                  <div className="grid2" style={{gap:8,marginBottom:10}}>
                    <div><div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>API key</div><input type="password" placeholder="sk_..." value={form.elevenlabsKey} onChange={e=>setForm(f=>({...f,elevenlabsKey:e.target.value}))} /></div>
                    <div><div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Voice ID</div><input type="text" placeholder="Your voice ID" value={form.voiceId} onChange={e=>setForm(f=>({...f,voiceId:e.target.value}))} /></div>
                  </div>
                  <button className="btn-sec" onClick={generateNarration} disabled={!form.elevenlabsKey||!form.voiceId}>Generate MP3</button>
                  {narrateStatus && <div style={{marginTop:8,fontSize:12,fontFamily:"'DM Mono',monospace",color:narrationFilename?"var(--accent)":"var(--muted)"}}>{narrateStatus}</div>}
                </div>
              </div>
            )}

            {/* YouTube */}
            {tab==="youtube" && (
              <div>
                {[{label:"Title",val:result.yt_title,key:"yttitle"},{label:"Description",val:result.yt_desc,key:"ytdesc"},{label:"Thumbnail concept",val:result.thumbnail,key:"thumb"}].map(item=>(
                  <div className="card" key={item.key}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                      <div><div className="section-label">{item.label}</div><div style={{fontSize:13,lineHeight:1.6,color:"#ccc"}}>{item.val}</div></div>
                      <button className={`copy-btn ${copied===item.key?"done":""}`} onClick={()=>copy(item.val||"",item.key)}>{copied===item.key?"copied!":"copy"}</button>
                    </div>
                  </div>
                ))}
                <div className="card"><div className="section-label">Tags</div><div className="tag-group">{(result.hashtags?.youtube||[]).map((t,i)=><div className="tag" key={i}>{t}</div>)}</div></div>
              </div>
            )}

            {/* Platform */}
            {tab==="platform" && (
              <div>
                {/* Core: hashtags and times — lazy loaded */}
                {!result._postingAssetsReady && (
                  <div className="card" style={{textAlign:"center",padding:24}}>
                    <div style={{fontSize:13,color:"var(--muted)",marginBottom:12}}>Posting assets generated on demand — keeps each video's metadata feeling hand-picked, not auto-packaged.</div>
                    <button className="btn-sec" style={{margin:"0 auto"}}
                      onClick={generatePostingAssets}
                      disabled={expandPostingAssets==="loading"}>
                      {expandPostingAssets==="loading" ? "Generating…" : "Generate hashtags, SEO & post times"}
                    </button>
                  </div>
                )}

                {result._postingAssetsReady && (
                  <>
                    <div className="card">
                      <div className="section-label" style={{marginBottom:10}}>Hashtags</div>
                      {[{label:"TikTok",color:"#FF2D55",tags:result.hashtags?.tiktok},{label:"Instagram",color:"#E040FB",tags:result.hashtags?.instagram}].map(p=>(
                        <div key={p.label} style={{marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                            <div style={{width:8,height:8,borderRadius:"50%",background:p.color}}/><div style={{fontSize:12,fontWeight:500}}>{p.label}</div>
                            <button className={`copy-btn ${copied===p.label?"done":""}`} onClick={()=>copy((p.tags||[]).join(" "),p.label)}>{copied===p.label?"copied!":"copy"}</button>
                          </div>
                          <div className="tag-group">{(p.tags||[]).map((t,i)=><div className="tag" key={i} style={{color:p.color,borderColor:p.color+"33",background:p.color+"11"}}>{t}</div>)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="card">
                      <div className="section-label" style={{marginBottom:8}}>Best posting times</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8}}>
                        {Object.entries(result.post_times||{}).map(([plat,time])=>(
                          <div key={plat} style={{background:"var(--card2)",borderRadius:8,padding:"10px 12px",border:"1px solid var(--border)"}}>
                            <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:"var(--muted)",textTransform:"uppercase",marginBottom:3}}>{plat}</div>
                            <div style={{fontSize:13,fontWeight:500}}>{time}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {result.tips?.length > 0 && (
                      <div className="card">
                        <div className="section-label">Tips</div>
                        {result.tips.map((t,i)=><div key={i} style={{fontSize:13,color:"#ccc",padding:"6px 0",borderBottom:"1px solid var(--border)"}}>{t}</div>)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Assemble */}
            {tab==="assemble" && (
              <div>
                {/* Scene detection panel */}
                <div className="scene-card">
                  <div className="scene-label">Smart scene detection</div>
                  <div className="toggle-row" style={{borderBottom: sceneData || analyzingScene ? "1px solid var(--border)" : "none", paddingBottom: sceneData || analyzingScene ? 10 : 0}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:500}}>Auto-select best moments</div>
                      <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>Analyses sharpness, motion & exposure — trims each clip to its best window</div>
                    </div>
                    <label className="toggle" style={{"--toggle-on":"var(--scene)"}}>
                      <input type="checkbox" checked={useSceneTrim} onChange={e=>setUseSceneTrim(e.target.checked)} style={{accentColor:"var(--scene)"}}/>
                      <span className="toggle-slider" style={useSceneTrim?{background:"var(--scene)"}:{}}/>
                    </label>
                  </div>

                  {useSceneTrim && (
                    <div style={{paddingTop:12}}>
                      <button className="btn-sec" style={{borderColor:"rgba(167,139,250,.3)",color:"var(--scene)"}}
                        onClick={analyzeScene} disabled={analyzingScene || !mediaFiles.filter(m=>m.isVideo&&m.filename).length}>
                        {analyzingScene ? "Analysing…" : sceneData ? "Re-analyse clips" : "Analyse clips"}
                      </button>
                      {!mediaFiles.filter(m=>m.isVideo&&m.filename).length && (
                        <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--muted)",marginLeft:10}}>Upload video clips first</span>
                      )}
                    </div>
                  )}

                  {analyzingScene && (
                    <div style={{marginTop:12,display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:14,height:14,border:"2px solid var(--border)",borderTopColor:"var(--scene)",borderRadius:"50%",animation:"spin 1s linear infinite",flexShrink:0}}/>
                      <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--scene)"}}>Extracting frames &amp; scoring…</div>
                    </div>
                  )}

                  {sceneData && (
                    <div style={{marginTop:12}}>
                      {/* Summary row */}
                      <div className="scene-summary-bar">
                        {[
                          {num: sceneData.summary.great,  label:"Great",  col:"var(--accent)"},
                          {num: sceneData.summary.good,   label:"Good",   col:"var(--accent2)"},
                          {num: sceneData.summary.usable, label:"Usable", col:"#FFA500"},
                          {num: sceneData.summary.skip,   label:"Skip",   col:"var(--danger)"},
                          {num: sceneData.summary.avgQuality+"%", label:"Avg quality", col:"var(--scene)"},
                        ].map(s => (
                          <div className="scene-stat" key={s.label}>
                            <div className="scene-stat-num" style={{color:s.col}}>{s.num}</div>
                            <div className="scene-stat-label">{s.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Threshold + bulk controls */}
                      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",padding:"8px 0 12px",borderBottom:"1px solid var(--border)",marginBottom:8}}>
                        <div style={{fontSize:11,color:"var(--muted)",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>Auto-skip below</div>
                        <input type="range" min={0} max={80} step={5} value={qualityThreshold}
                          onChange={e => {
                            const t = parseInt(e.target.value);
                            setQualityThreshold(t);
                            if (sceneData) {
                              setSkippedClips(new Set(
                                sceneData.results.filter(r => r.qualityScore < t).map(r => r.filename)
                              ));
                            }
                          }}
                          style={{flex:1,minWidth:80,accentColor:"var(--scene)"}}
                        />
                        <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--scene)",minWidth:28}}>{qualityThreshold}</div>
                        <div style={{display:"flex",gap:6}}>
                          <button className="btn-sec" style={{fontSize:10,padding:"4px 10px",borderColor:"rgba(167,139,250,.3)",color:"var(--scene)"}}
                            onClick={()=>setSkippedClips(new Set())}>include all</button>
                          <button className="btn-sec" style={{fontSize:10,padding:"4px 10px",borderColor:"rgba(255,71,87,.2)",color:"var(--danger)"}}
                            onClick={()=>setSkippedClips(new Set(sceneData.results.map(r=>r.filename)))}>skip all</button>
                        </div>
                      </div>

                      {/* Per-clip results */}
                      <div>
                        {(sceneData.results || []).map((r, i) => {
                          const isSkipped = skippedClips.has(r.filename);
                          const qClass = `quality-${r.recommendation}`;
                          const barColor = r.qualityScore >= 75 ? "var(--accent)" : r.qualityScore >= 55 ? "var(--accent2)" : r.qualityScore >= 35 ? "#FFA500" : "var(--danger)";
                          const maxScore = Math.max(...(r.frameScores||[]).map(f=>f.score), 0.01);

                          return (
                            <div className="clip-analysis-row" key={i}
                              style={{opacity: isSkipped ? 0.38 : 1, transition:"opacity .2s"}}>
                              {/* Skip/include toggle */}
                              <button onClick={() => setSkippedClips(prev => {
                                const next = new Set(prev);
                                isSkipped ? next.delete(r.filename) : next.add(r.filename);
                                return next;
                              })} style={{
                                width:34, height:34, borderRadius:8, border:"1px solid",
                                borderColor: isSkipped ? "var(--danger)" : "var(--border)",
                                background: isSkipped ? "rgba(255,71,87,.12)" : "var(--card2)",
                                color: isSkipped ? "var(--danger)" : "var(--scene)",
                                fontSize:14, cursor:"pointer", flexShrink:0,
                                display:"flex", alignItems:"center", justifyContent:"center",
                              }} title={isSkipped ? "Click to include" : "Click to skip"}>
                                {isSkipped ? "✕" : r.qualityScore}
                              </button>

                              <div style={{flex:1,minWidth:0}}>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <div style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{r.filename}</div>
                                  {isSkipped && <div style={{fontSize:9,fontFamily:"'DM Mono',monospace",background:"rgba(255,71,87,.12)",color:"var(--danger)",padding:"1px 6px",borderRadius:4,flexShrink:0}}>SKIPPED</div>}
                                </div>
                                <div style={{fontSize:10,color:"var(--muted)",marginTop:1}}>
                                  {r.duration?.toFixed(1)}s · best: {r.trim?.startTrim?.toFixed(1)}s–{((r.trim?.startTrim||0)+(r.trim?.duration||0)).toFixed(1)}s
                                  {r.recommendation === "skip" && !isSkipped && <span style={{color:"var(--danger)",marginLeft:6}}>⚠ low quality — consider skipping</span>}
                                </div>

                                {/* Score sparkline */}
                                {!isSkipped && r.frameScores?.length > 0 && (
                                  <div className="sparkline">
                                    {r.frameScores.slice(0, 48).map((f, fi) => {
                                      const isPeak = fi === r.frameScores.indexOf(r.frameScores.reduce((a,b)=>b.score>a.score?b:a));
                                      return <div key={fi} className="spark-bar"
                                        style={{height:`${Math.max(2, (f.score/maxScore)*24)}px`, background: isPeak ? "var(--scene)" : barColor, opacity: 0.7}}
                                      />;
                                    })}
                                  </div>
                                )}

                                {!isSkipped && (
                                  <div className="metric-row">
                                    {r.avgMetrics && <>
                                      <div className="metric-pill">📸 {r.avgMetrics.sharpness}</div>
                                      <div className="metric-pill">🎬 {r.avgMetrics.motion}</div>
                                      <div className="metric-pill">☀️ {r.avgMetrics.brightness}</div>
                                    </>}
                                    <div className="trim-pill">✂ {r.trim?.startTrim?.toFixed(2)}s → +{r.trim?.duration?.toFixed(2)}s</div>
                                  </div>
                                )}
                                {!isSkipped && r.notes?.length > 0 && (
                                  <div style={{fontSize:10,color:"var(--muted)",marginTop:4,fontStyle:"italic",fontFamily:"'DM Mono',monospace"}}>
                                    {r.notes.join(" · ")}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Included count footer */}
                      <div style={{marginTop:10,fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--muted)",textAlign:"center"}}>
                        {sceneData.results.length - skippedClips.size} of {sceneData.results.length} clips included in assembly
                        {skippedClips.size > 0 && <span style={{color:"var(--danger)"}}> · {skippedClips.size} skipped</span>}
                      </div>
                    </div>
                  )}
                </div>
                <div className="beat-assembly-card">
                  <div className="beat-assembly-label">Beat sync</div>
                  <div className="toggle-row">
                    <div>
                      <div style={{fontSize:13,fontWeight:500}}>Sync cuts to music beat</div>
                      <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>Clips cut exactly on the beat of your music track</div>
                    </div>
                    <label className="toggle beat-toggle">
                      <input type="checkbox" checked={assemblyOpts.beatSync} onChange={e=>setAssemblyOpts(o=>({...o,beatSync:e.target.checked}))} />
                      <span className="toggle-slider"/>
                    </label>
                  </div>

                  {assemblyOpts.beatSync && (
                    <>
                      <div className="toggle-row">
                        <span style={{fontSize:13}}>Cut every N beats</span>
                        <select value={assemblyOpts.beatsPerClip} onChange={e=>setAssemblyOpts(o=>({...o,beatsPerClip:parseInt(e.target.value)}))} style={{width:"auto",padding:"4px 10px",fontSize:12,borderColor:"rgba(255,107,53,.3)"}}>
                          <option value={1}>Every beat (very fast)</option>
                          <option value={2}>Every 2 beats (energetic)</option>
                          <option value={4}>Every 4 beats (standard)</option>
                          <option value={8}>Every 8 beats (relaxed)</option>
                        </select>
                      </div>

                      <div style={{marginTop:12,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                        <button className="btn-sec" style={{borderColor:"rgba(255,107,53,.3)",color:"var(--beat)"}} onClick={analyzeBeats} disabled={analyzingBeats}>
                          {analyzingBeats ? "Analysing…" : "Analyse beats"}
                        </button>
                        {!musicFile && !narrationFilename && <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--muted)"}}>Upload music or generate narration first</div>}
                      </div>

                      {beatData && (
                        <div style={{marginTop:12}}>
                          <div className="beat-info-pill">
                            <div className="beat-dot"/>
                            <span>{beatData.bpm} BPM</span>
                            <span style={{opacity:.5}}>·</span>
                            <span>{beatData.beats.length} cut points</span>
                            <span style={{opacity:.5}}>·</span>
                            <span>{beatData.duration.toFixed(1)}s</span>
                          </div>
                          {/* Mini beat visualiser */}
                          <div className="beat-viz">
                            {beatData.beats.slice(0, 60).map((b, i) => {
                              const gap = i > 0 ? beatData.beats[i] - beatData.beats[i-1] : 0.5;
                              const h   = Math.min(40, Math.max(8, 40 * (0.5 / gap)));
                              return <div key={i} className="beat-bar" style={{height:`${h}px`}} />;
                            })}
                          </div>
                          <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--muted)"}}>
                            {mediaFiles.filter(m=>m.isVideo&&m.filename).length} clips × {assemblyOpts.beatsPerClip} beats each = {mediaFiles.filter(m=>m.isVideo&&m.filename).length * assemblyOpts.beatsPerClip} beat slots
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* General options */}
                <div className="assembly-card">
                  <div className="assembly-label">Assembly options</div>
                  {[{key:"addCaptions",label:"Burn captions into video"},{key:"addBgMusic",label:"Mix background music bed"}].map(opt=>(
                    <div className="toggle-row" key={opt.key}>
                      <span>{opt.label}</span>
                      <label className="toggle"><input type="checkbox" checked={assemblyOpts[opt.key]} onChange={e=>setAssemblyOpts(o=>({...o,[opt.key]:e.target.checked}))}/><span className="toggle-slider"/></label>
                    </div>
                  ))}
                </div>

                <div className="card" style={{marginBottom:14}}>
                  <div className="section-label">Ready to assemble</div>
                  <div style={{fontSize:13,color:"var(--muted)"}}>
                    {mediaFiles.filter(m=>m.isVideo&&m.filename&&!skippedClips.has(m.filename)).length} video clips included
                    {skippedClips.size > 0 && <span style={{color:"var(--danger)"}}> · {skippedClips.size} skipped</span>}
                    {" · "}{narrationFilename?"narration ready":"no narration"}
                    {" · "}{musicFile?.filename?"music loaded":"no music"}
                    {assemblyOpts.beatSync && beatData ? ` · ${beatData.bpm} BPM` : ""}
                    {useSceneTrim && sceneData ? ` · smart-trimmed` : ""}
                  </div>
                </div>

                <button className="btn-primary" onClick={startAssembly} disabled={mediaFiles.filter(m=>m.filename).length===0}>
                  {assemblyOpts.beatSync ? "Assemble beat-synced video →" : "Assemble video →"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 5: Assembling ── */}
        {step === 5 && (
          <div className="loading-wrap">
            <div className={`loading-ring ${jobStatus?.beatSync?"beat":""}`}/>
            <div className="loading-text">{jobStatus?.message || "Assembling your video..."}</div>
            {jobStatus?.beatInfo && (
              <div className="beat-info-pill" style={{marginTop:4}}>
                <div className="beat-dot"/><span>{jobStatus.beatInfo.bpm} BPM · {jobStatus.beatInfo.beats} cut points</span>
              </div>
            )}
            {jobStatus && (
              <div style={{width:"100%",maxWidth:280}}>
                <div className="progress-wrap">
                  <div className={`progress-bar ${jobStatus?.beatSync?"beat":"normal"}`} style={{width:`${jobStatus.progress||0}%`}}/>
                </div>
                <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"var(--muted)",textAlign:"center",marginTop:8}}>{jobStatus.progress||0}%</div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 6: Done ── */}
        {step === 6 && (
          <div>
            <div className={`download-card ${jobStatus?.beatSync?"beat":""}`}>
              <div style={{fontSize:28,marginBottom:8}}>✓</div>
              <div style={{fontSize:18,fontWeight:600,marginBottom:6,letterSpacing:"-.3px"}}>
                {jobStatus?.beatSync ? `Beat-synced video ready · ${jobStatus.beatInfo?.bpm} BPM` : "Your video is ready"}
              </div>
              <div style={{fontSize:13,color:"var(--muted)",marginBottom:20}}>Post-ready MP4 · {form.platforms[0]==="youtube"?"16:9":"9:16"} · Captions burned · Loudness normalised{jobStatus?.useSceneTrim?" · Smart-trimmed":""}</div>
              <a className={`download-btn ${jobStatus?.beatSync?"beat":""}`} href={downloadUrl} download>Download MP4</a>
            </div>

            <div className="card">
              <div className="section-label" style={{marginBottom:10}}>Post checklist</div>
              {["Upload to TikTok, Reels, and YouTube Shorts","Paste hashtags from the Platform tab","Post at optimal times","Pin a comment with your CTA or link","Reply to every comment in the first hour"].map((s,i)=>(
                <div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)",fontSize:13}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--accent)",flexShrink:0,paddingTop:1}}>{i+1}</span>
                  <span style={{color:"#ccc"}}>{s}</span>
                </div>
              ))}
            </div>

            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button className="btn-sec" onClick={()=>{setStep(1);setResult(null);setDownloadUrl(null);setJobStatus(null);setNarrationFilename(null);setMediaFiles([]);setMusicFile(null);setBeatData(null);setSceneData(null);setGenerationStage("");setExpandPostingAssets(false);}}>Make another</button>
              <button className="btn-sec" onClick={()=>setStep(4)}>View script package</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
