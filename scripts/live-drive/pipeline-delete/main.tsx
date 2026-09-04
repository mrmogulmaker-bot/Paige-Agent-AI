import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {GrowthHub} from '@/solo/growth2';
import {harness} from './adapter';
import '@/index.css';
import '@/solo/solo-tokens.css';
function App(){const[theme,setTheme]=React.useState('light');const[rail,setRail]=React.useState(false);React.useEffect(()=>{document.documentElement.dataset.pg=theme;document.documentElement.classList.toggle('dark',theme==='dark');},[theme]);return <div style={{height:'100dvh',display:'grid',gridTemplateRows:'40px minmax(0,1fr)'}}><aside style={{display:'flex',gap:8,font:'12px system-ui',alignItems:'center',padding:8,background:'#eee',color:'#111'}}><b>LOCAL ADAPTER · NOT PRODUCTION</b><button onClick={()=>harness.setTenant('A')}>Context A</button><button onClick={()=>harness.setTenant('B')}>Context B</button><button onClick={()=>setTheme(theme==='light'?'dark':'light')}>Theme</button><button onClick={()=>setRail(!rail)}>Rail-width simulation</button></aside><div style={{display:'grid',gridTemplateColumns:rail?'minmax(0,1fr) 320px':'minmax(0,1fr)',minHeight:0}}><main className="paige-solo" data-theme={theme} style={{minWidth:0,minHeight:0,overflow:'hidden'}}><BrowserRouter><Routes><Route path="/solo/:account/*" element={<GrowthHub/>}/></Routes></BrowserRouter></main>{rail&&<aside style={{background:'#eee',padding:10}}>PAIGE width simulation only — no real workspace</aside>}</div></div>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
