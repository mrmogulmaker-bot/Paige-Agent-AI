// _shared/agreements/signing-page.ts — the external signer's page (INT-163).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THIS FILE IS PROVISIONAL AND IS THE UI/UX LANE'S TO REPLACE. IT IS NOT A DESIGN.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
//
// The signer's page has an OWNER-APPROVED design, frozen under §28, owned by the UI/UX lane: a deep
// indigo-to-violet plate, a gold corner ring, a violet-to-gold read-progress bar, a signing panel
// that stays dimmed until the document has actually been read, and a completion seal. NONE of that
// is implemented here, and it deliberately is not approximated — reproducing an approved design from
// a prose description is how a surface ends up subtly wrong and frozen that way.
//
// What is here instead is the plainest markup that lets a real person complete the flow, so the
// backend can ship and be exercised end to end before the approved template lands. It is marked
// provisional on the page itself so nobody mistakes it for the approved design.
//
// THE SPLIT, so the handover is a single file and not an archaeology exercise:
//   · BACKEND (agreement-sign/index.ts) owns the route, token validation, liveness and revocation,
//     consent and evidence capture, form handling, rate limits, CSP and every security header.
//   · THIS FILE owns only markup and styling, and receives an already-authorised, already-
//     allow-listed view — it makes no decisions and reads nothing it was not handed.
//
// TO HAND OVER: replace `renderSigningPage` with the approved template. Keep the four contracts
// below and nothing else needs to change:
//   1. POST JSON to `location.pathname` with {action:"sign", consent:true, typedName:string} or
//      {action:"decline", reason:string}. The cookie carries the credential; send no token.
//   2. A truthy `ok` in the response means it landed; render `error` otherwise. Never claim success
//      on a non-ok response.
//   3. Link to `?document=1` for the PDF. Never fetch or inline the document bytes any other way.
//   4. Every interpolated value passes through `esc`. The agreement body is TENANT-supplied and the
//      typed name is SIGNER-supplied, rendered to the other party's browser — a cross-party trust
//      boundary. The CSP the backend sends forbids external script and style, so keep script and
//      style inline and add no <script src> or <link rel=stylesheet>.

import type { signerFacingView } from "./signing-guard.ts";

export type SignerView = ReturnType<typeof signerFacingView>;

/** Escape for HTML text. Every interpolation goes through this — no exceptions. */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Shown when the link is dead, expired, or the agreement is no longer signable. */
export function renderRefusalPage(title: string, detail: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.25rem;color:#1a1a1f}
h1{font-size:1.35rem;margin:0 0 .5rem}p{color:#55555f}</style></head>
<body><h1>${esc(title)}</h1><p>${esc(detail)}</p></body></html>`;
}

/**
 * PROVISIONAL. Replace wholesale with the approved template — see the header.
 *
 * Deliberately unstyled beyond legibility. It does not attempt the approved plate, ring, progress
 * bar, dimmed panel or seal, because a half-remembered version of an approved design is worse than
 * an obviously plain one: the plain one gets replaced, the approximation gets shipped.
 */
export function renderSigningPage(v: SignerView): string {
  const d = v.disclosure;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(v.agreement.title)}</title>
<style>
 body{font:16px/1.65 system-ui,-apple-system,sans-serif;max-width:46rem;margin:0 auto;padding:2rem 1.25rem 5rem;color:#17171c}
 h1{font-size:1.5rem;margin:0 0 .25rem} .sub{color:#5a5a66;margin:0 0 1.5rem}
 .prov{border:1px dashed #c9c9d2;border-radius:8px;padding:.6rem .9rem;margin:0 0 1.5rem;color:#5a5a66;font-size:.8125rem}
 .doc{border:1px solid #e2e2e8;border-radius:10px;padding:1.25rem;margin:0 0 1.5rem}
 .notice{background:#f7f7fa;border:1px solid #e2e2e8;border-radius:10px;padding:1rem 1.25rem;white-space:pre-wrap;font-size:.875rem;color:#3d3d47;max-height:15rem;overflow:auto}
 label{display:block;margin:1.25rem 0 .35rem;font-weight:600}
 input[type=text]{width:100%;padding:.65rem .75rem;font:inherit;border:1px solid #c9c9d2;border-radius:8px}
 .row{display:flex;gap:.6rem;align-items:flex-start;margin:1.25rem 0}
 button{font:inherit;font-weight:600;padding:.7rem 1.4rem;border-radius:8px;border:0;cursor:pointer}
 .go{background:#1a1a22;color:#fff} .no{background:transparent;color:#777784;text-decoration:underline}
 .msg{margin-top:1rem;padding:.75rem 1rem;border-radius:8px;display:none}
 .ok{background:#eef7ef;color:#1d5c2a} .err{background:#fdeeee;color:#8a2020}
 .parties{font-size:.875rem;color:#5a5a66} .hash{font-family:ui-monospace,monospace;font-size:.72rem;color:#8a8a96;word-break:break-all}
</style></head><body>
<h1>${esc(v.agreement.title)}</h1>
<p class="sub">Sent by ${esc(v.sentBy)}</p>
<p class="prov">This page is a provisional layout while the final design is finished. Signing here is
fully functional and your signature is recorded in the same way it will be afterwards.</p>

<div class="doc">
  <p><a href="?document=1" target="_blank" rel="noopener noreferrer">Open the document (PDF)</a></p>
  ${v.otherParties.length ? `<p class="parties">Other parties: ${v.otherParties.map((p) => `${esc(p.fullName)} — ${esc(p.status)}`).join(" · ")}</p>` : ""}
  ${v.agreement.documentSha256 ? `<p class="hash">Document fingerprint (SHA-256): ${esc(v.agreement.documentSha256)}</p>` : ""}
</div>

${
    v.canSign && d
      ? `<form id="f">
  <div class="notice">${esc(d.body)}</div>
  <div class="row">
    <input type="checkbox" id="consent" required>
    <label for="consent" style="margin:0;font-weight:400">${esc(d.checkboxLabel)}</label>
  </div>
  <label for="name">Type your full legal name to sign</label>
  <input type="text" id="name" autocomplete="name" required minlength="2" value="${esc(v.you.fullName)}">
  <div class="row" style="margin-top:1.5rem">
    <button type="submit" class="go">Sign this agreement</button>
    <button type="button" class="no" id="decline">Decline</button>
  </div>
</form>
<div class="msg ok" id="ok"></div><div class="msg err" id="err"></div>
<script>
const f=document.getElementById('f'),ok=document.getElementById('ok'),err=document.getElementById('err');
const show=(el,t)=>{el.textContent=t;el.style.display='block'};
async function post(payload,btn){err.style.display='none';btn.disabled=true;
 try{const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const j=await r.json();
  if(j.ok){f.style.display='none';show(ok,payload.action==='sign'?'Thank you — your signature has been recorded. You will be emailed a copy when everyone has signed.':'Your decision has been recorded. The sender has been notified.');}
  else{show(err,j.error||'That did not work. Please try again.');btn.disabled=false;}
 }catch(e){show(err,'That did not reach us. Check your connection and try again.');btn.disabled=false;}}
f.addEventListener('submit',e=>{e.preventDefault();
 if(!document.getElementById('consent').checked){show(err,'Please agree to sign electronically before continuing.');return;}
 post({action:'sign',consent:true,typedName:document.getElementById('name').value},e.submitter||f.querySelector('.go'));});
document.getElementById('decline').addEventListener('click',e=>{
 if(!confirm('Decline this agreement? The sender will be told, and it cannot be signed afterwards.'))return;
 post({action:'decline',reason:''},e.target);});
</script>`
      : `<p class="sub">${esc(v.cannotSignReason ?? "This agreement cannot be signed right now.")}</p>`
  }
</body></html>`;
}
