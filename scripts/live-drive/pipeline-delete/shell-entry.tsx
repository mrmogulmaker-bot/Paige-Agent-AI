import React from 'react';
import {createRoot} from 'react-dom/client';
import {CanonicalShell} from './shell';
import '@/index.css';
import '@/solo/solo-tokens.css';
history.replaceState({},'', '/solo/local/growth/pipeline?shell');
createRoot(document.getElementById('root')!).render(<React.StrictMode><CanonicalShell/></React.StrictMode>);
