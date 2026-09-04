import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
const repo=path.resolve(import.meta.dirname,'../../..');
export default defineConfig({root:import.meta.dirname,css:{postcss:repo},plugins:[react()],resolve:{alias:[{find:'@/hooks/useTenantContext',replacement:path.join(import.meta.dirname,'tenant.ts')},{find:'./useSoloCampaigns',replacement:path.join(import.meta.dirname,'adapter.ts')},{find:'@',replacement:path.join(repo,'src')}]},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://harness.invalid'),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('local-test-not-a-key')},server:{host:'127.0.0.1',port:5237,strictPort:true}});
