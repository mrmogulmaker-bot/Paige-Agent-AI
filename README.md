# Paige Agent AI

The Paige Agent AI platform — an AI-native operating system for coaching and advisory businesses.

## Tech stack

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase (Postgres, Auth, Edge Functions, Storage)

AI runs on Anthropic (Claude) for reasoning and classification and Voyage AI for embeddings.

## Local development

Requires Node.js & npm ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
# 1. Clone the repository.
git clone <YOUR_GIT_URL>

# 2. Navigate to the project directory.
cd Paige-Agent-AI

# 3. Install dependencies.
npm i

# 4. Start the dev server with auto-reloading and an instant preview.
npm run dev
```

### Environment

Copy the required `VITE_SUPABASE_*` variables into a local `.env` (Supabase URL, project id, publishable/anon key). Edge-function secrets are configured on the Supabase project, not in the frontend.

## Deployment

The frontend deploys to Vercel; edge functions deploy to Supabase via `supabase functions deploy`. A custom domain is configured through Vercel's Domains settings.
