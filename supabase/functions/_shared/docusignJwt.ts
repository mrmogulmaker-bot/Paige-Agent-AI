// DocuSign JWT auth helper.
// Caches access tokens in module scope for 50 minutes to avoid per-call minting.
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

type CachedToken = { token: string; baseUri: string; expiresAt: number };
let cached: CachedToken | null = null;

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function getDocuSignAccess(): Promise<
  { ok: true; accessToken: string; baseUri: string; accountId: string }
  | { ok: false; error: string }
> {
  const integrationKey = Deno.env.get("DOCUSIGN_INTEGRATION_KEY");
  const userId = Deno.env.get("DOCUSIGN_USER_ID");
  const accountId = Deno.env.get("DOCUSIGN_ACCOUNT_ID");
  const rsa = Deno.env.get("DOCUSIGN_RSA_PRIVATE_KEY");
  const baseUriEnv = Deno.env.get("DOCUSIGN_BASE_URI") || "https://account.docusign.com";
  if (!integrationKey || !userId || !accountId || !rsa) {
    return { ok: false, error: "docusign_not_configured" };
  }

  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return { ok: true, accessToken: cached.token, baseUri: cached.baseUri, accountId };
  }

  try {
    const key = await importPrivateKey(rsa);
    const now = getNumericDate(0);
    const exp = getNumericDate(60 * 55);
    const assertion = await create(
      { alg: "RS256", typ: "JWT" },
      {
        iss: integrationKey,
        sub: userId,
        aud: new URL(baseUriEnv).host,
        iat: now,
        exp,
        scope: "signature impersonation",
      },
      key,
    );

    const tokenRes = await fetch(`${baseUriEnv}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!tokenRes.ok) {
      return { ok: false, error: `token_${tokenRes.status}: ${(await tokenRes.text()).slice(0, 200)}` };
    }
    const tok = await tokenRes.json();

    // Resolve account base URI
    const userInfoRes = await fetch(`${baseUriEnv}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const userInfo = await userInfoRes.json();
    const account = userInfo?.accounts?.find((a: { account_id: string }) => a.account_id === accountId)
      ?? userInfo?.accounts?.[0];
    if (!account?.base_uri) return { ok: false, error: "no_base_uri" };

    cached = {
      token: tok.access_token,
      baseUri: account.base_uri,
      expiresAt: Date.now() + (tok.expires_in ?? 3300) * 1000,
    };
    return { ok: true, accessToken: tok.access_token, baseUri: account.base_uri, accountId };
  } catch (e) {
    return { ok: false, error: `jwt_exception: ${(e as Error).message}` };
  }
}
