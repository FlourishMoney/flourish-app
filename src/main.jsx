import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { clearState } from './App.jsx'
import { initErrorReporting, captureError } from './lib/errorReporting.js'

// Sprint Z #10: env-gated error reporting. No-op until VITE_SENTRY_DSN is configured.
initErrorReporting()

// Tier 3: catch render-time crashes so a thrown component shows a recoverable
// fallback instead of a permanent white screen (unrecoverable on a native app).
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(){ return { hasError: true }; }
  componentDidCatch(error, info){ console.error("[ErrorBoundary]", error, info?.componentStack); captureError(error, { area: "render" }); }
  render(){
    if (this.state.hasError) {
      return (
        <div style={{minHeight:"100dvh",background:"#050D09",color:"#EDE9E2",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:"24px",fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif"}}>
          <div style={{fontSize:40,marginBottom:12}}>🌱</div>
          <div style={{fontSize:20,fontWeight:800,marginBottom:8}}>Something went wrong</div>
          <div style={{fontSize:14,color:"#6B7A6E",maxWidth:320,lineHeight:1.6,marginBottom:24}}>The app hit an unexpected error. A reload usually fixes it; if not, resetting clears local app data and starts fresh.</div>
          <button onClick={()=>window.location.reload()} style={{background:"linear-gradient(135deg,#00D68F,#00B37A)",color:"#021208",fontWeight:800,fontSize:15,padding:"14px 28px",borderRadius:14,border:"none",cursor:"pointer",marginBottom:12,minWidth:200}}>Reload</button>
          <button onClick={()=>{ try{ clearState(); }catch{} window.location.reload(); }} style={{background:"none",color:"#6B7A6E",fontSize:13,padding:"8px",border:"none",cursor:"pointer",textDecoration:"underline"}}>Reset app data</button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
