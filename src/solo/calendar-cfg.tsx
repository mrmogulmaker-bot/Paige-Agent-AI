// @ts-nocheck
import React from "react";
import { Ic, Avatar, Meter, SlideOut } from "./_shared";
import { TIER, TierDot } from "./automations";

export const Sw=({on,c})=>(<span style={{width:32,height:17,borderRadius:99,flex:'none',background:on?(c||'var(--ok)'):'var(--surface-sunk)',
border:'1px solid '+(on?(c||'var(--ok)'):'var(--line)'),position:'relative',display:'block'}}>
<span style={{position:'absolute',top:2,left:on?16:2,width:11,height:11,borderRadius:'50%',background:'#fff',transition:'.2s',boxShadow:'var(--sh-1)'}}/></span>);
export const CfgRow=({k,v,on,sw,note,c})=>(<div style={{padding:'10px 13px',borderTop:'1px solid var(--line-soft)'}}>
<div className="row" style={{gap:10}}>
<span className="eyebrow" style={{fontSize:9.4,width:136,flex:'none'}}>{k}</span>
<span className="grow trunc" style={{fontSize:12.4,color:'var(--ink-2)'}}>{v}</span>
{sw&&<Sw on={on} c={c}/>}</div>
{note&&<div style={{fontSize:11.4,color:'var(--ink-3)',lineHeight:1.45,marginTop:5,paddingLeft:146}}>{note}</div>}</div>);
export const CfgCard=({t,d,children,tone})=>(<div style={{border:'1px solid '+(tone||'var(--line)'),borderRadius:'var(--r-m)',overflow:'hidden',marginTop:10}}>
<div style={{padding:'10px 13px',background:'var(--surface-2)'}}>
<div style={{fontSize:12.4,fontWeight:600}}>{t}</div>
{d&&<div style={{fontSize:11.4,color:'var(--ink-3)',lineHeight:1.45,marginTop:3}}>{d}</div>}</div>{children}</div>);

export const CFG={
pool:[{n:'Jordan Avery',r:'Owner',load:82,cap:'4 a day',tone:'var(--violet)'},
 {n:'Maya Rios',r:'Account lead · invite unopened',load:0,cap:'3 a day',tone:'#2E7D8F'}],
wf:[['24 hours before','Reminder with the intake answers attached',true],
 ['1 hour before','Short reminder with the join link',true],
 ['15 min after start','No-show check — sends the reschedule link on its own',true],
 ['1 hour after','Thank-you with what you agreed and who owes what',true],
 ['3 days after','Review request',false]],
brand:{logo:'Paige mark · gold',accent:'var(--violet)',banner:'None',domain:'book.paige.ai',badge:false},
embed:[['Inline embed','Drops the whole page into a site section','<div id="paige-book">'],
 ['Popup widget','A button anywhere that opens the page over the site','data-paige-popup'],
 ['Email signature','One line with your next three open slots baked in','Signature snippet'],
 ['QR code','For print, cards and the window','PNG · SVG']],
forms:[
 {n:'New enquiry router',st:'Live',sent:38,d:'Everything that lands on the pricing page or a cold referral goes through here before it sees a slot.',
  q:'Are you already a client?',
  br:[{a:'No — just looking',to:'Free consult',n:24,note:'Fifteen minutes, no calendar burned on a maybe.'},
   {a:'Yes, and I need a filing looked at',to:'Quarterly compliance review',n:9,note:'Skips the consult entirely. They already pay you.'},
   {a:'Yes, and I want to restructure',to:'Trust setup deep-dive',n:5,note:'Paid hold. The card is the qualifier.'}],
  read:'Thirty-eight people went through it, thirty-eight got a slot. Before this, twenty-two of them would have booked a free consult you did not need to take.'},
 {n:'Existing client router',st:'Draft',sent:0,d:'For the portal. Sorts a client who clicks Book a time into the right one of your five links.',
  q:'What do you need?',
  br:[{a:'Sign something',to:'Document signing session',n:0,note:'Thirty minutes, packet prepared before they arrive.'},
   {a:'Review my filings',to:'Quarterly compliance review',n:0,note:'Sixty minutes, summary attached beforehand.'},
   {a:'Something else',to:'Ad-hoc · request a time',n:0,note:'Which is the link you currently have switched off.'}],
  read:'This one is drafted but not live, and the fallback branch points at the ad-hoc link that is off. Turn that on and this can ship.'}],
conn:[['Google Calendar','jordan@meridianadvisory.com','Read and write',true],
 ['Outlook','jordan@meridianholdings.co','Read for conflicts only',true],
 ['iCloud','Personal','Read for conflicts only',false]]};

export const cfgFor=t=>{const n=t.n.toLowerCase();
const pooled=n.includes('consult')||n.includes('signing');
const joins=n.includes('deep-dive')?'Devon Park · second chair':n.includes('quarterly')?'Dolores Ruiz · when a filing is on the agenda':n.includes('onboarding')?'You, for the first three':'Nobody';
return{
pooled,joins,mode:pooled?'Pooled · round robin':'You only',
dist:pooled?'Equal, then whoever is free soonest':'—',
pay:n.includes('deep-dive')?{on:true,mode:'Authorise at booking',amt:'$450',dep:'Full amount held, settled after',fee:'$100 late-cancel fee',rev:'$900 last 30 days'}
 :{on:false,mode:'No payment',amt:t.price,dep:'—',fee:'None',rev:'—'},
multi:n.includes('deep-dive')?{on:true,d:'Two sessions — 90 minutes, then a 45-minute follow-up booked together'}
 :n.includes('quarterly')?{on:true,d:'Recurring — books the same slot every quarter until cancelled'}
 :{on:false,d:'Single session'},
auto:n.includes('consult')||n.includes('onboarding')?'auto':'confirm',
roll:n.includes('deep-dive')?'21 days out':'60 days out',
inc:n.includes('consult')?'15 minutes':'30 minutes',
solve:!n.includes('consult'),
loc:n.includes('signing')?'In person · 118 Marlowe St, or Zoom on request':n.includes('phone')?'Phone':t.loc}};

export const LinkDrawer=({t,onClose,onPreview})=>{const[s,setS]=React.useState('page');
React.useEffect(()=>{if(t)setS('page')},[t&&t.n]);
if(!t)return null;const c=cfgFor(t);
const secs=[['page','Page'],['hosts','Hosts'],['timing','Timing'],['money','Money'],['follow','Follow-up'],['share','Share']];
return <SlideOut open={!!t} onClose={onClose} title={t.n} sub={t.dur+' · '+c.loc} icon={<Ic.clock size={15}/>} wide
foot={<><button className="btn btn-s btn-p"><Ic.check size={12}/>Save changes</button>
<button className="btn btn-s" onClick={()=>{onClose();onPreview(t)}}><Ic.search size={12}/>Preview the page</button>
<button className="btn btn-s">Copy link</button></>}>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<span className={'pill '+(t.active?'pill-ok':'pill-n')}>{t.active?'Live':'Off'}</span>
<span className="pill pill-v">{t.dur}</span>
<span className="row" style={{gap:5,fontSize:11.2,fontWeight:600,color:TIER[c.auto][0]}}><TierDot tier={c.auto}/>Bookings {TIER[c.auto][1].toLowerCase()}</span>
{c.pooled&&<span className="pill pill-n">Pooled</span>}{c.pay.on&&<span className="pill" style={{background:'var(--gold-tint)',color:'var(--gold)'}}>{c.pay.amt}</span>}</div>
<div className="row tabstrip" style={{gap:6,margin:'14px 0 4px'}}>{secs.map(([k,l])=>
<button key={k} onClick={()=>setS(k)} className="pill" style={{height:25,cursor:'pointer',fontSize:11.2,
background:s===k?'var(--ink)':'var(--surface-sunk)',color:s===k?'var(--ink-inv)':'var(--ink-3)'}}>{l}</button>)}</div>
<div key={s} className="fade-in">
{s==='page'&&<>
<div className="mono row" style={{gap:8,marginTop:10,padding:'9px 12px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)',fontSize:11.6}}>
<span className="trunc grow">book.paige.ai/{t.slug}</span><span className="pill pill-n" style={{fontSize:10}}>Copy</span></div>
<div className="eyebrow" style={{marginTop:16}}>Description on the page</div>
<div style={{marginTop:6,padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',fontSize:12.6,color:'var(--ink-2)',lineHeight:1.6}}>{t.d}</div>
<CfgCard t="Where you meet" d="Conferencing links are generated when the booking lands, not before.">
<CfgRow k="Location" v={c.loc}/>
<CfgRow k="Auto-generate link" v="Google Meet" sw on note="Zoom and Teams are connected too — this link uses Meet because that is what the client asked for."/>
<CfgRow k="Phone fallback" v="Called out to the number they give" sw on={t.loc==='Phone'}/></CfgCard>
<CfgCard t="What she asks them">
{t.q.map((q,i)=><CfgRow key={q} k={'Question '+(i+1)} v={q}/>)}
<CfgRow k="Required" v="All of them, before a slot is held" sw on/></CfgCard>
<div className="eyebrow" style={{marginTop:16}}>Confirmation she sends</div>
<div style={{marginTop:6,padding:'11px 13px',border:'1px solid var(--violet-line)',background:'var(--violet-tint)',borderRadius:'var(--r-m)',
fontSize:12.6,color:'var(--ink-2)',lineHeight:1.6}}>{t.cf}</div>
<CfgCard t="Branding" d="Shared across all six links. Changing it here changes every page.">
<CfgRow k="Logo" v={CFG.brand.logo}/><CfgRow k="Accent" v="Violet · from your brand"/>
<CfgRow k="Banner image" v={CFG.brand.banner}/><CfgRow k="Domain" v={CFG.brand.domain} note="A custom domain needs one DNS record. She will write it for you."/>
<CfgRow k="Paige badge" v="Shown at the foot of the page" sw on={!CFG.brand.badge}/></CfgCard></>}
{s==='hosts'&&<>
<CfgCard t={c.mode} d={c.pooled?'Two hosts can take this one. She hands it out and keeps the split honest.':'Only you can be booked on this link.'}
tone={c.pooled?'var(--violet-line)':'var(--line)'}>
{CFG.pool.map((p,i)=><div key={p.n} style={{padding:'11px 13px',borderTop:i?'1px solid var(--line-soft)':'0',opacity:c.pooled||i===0?1:.45}}>
<div className="row" style={{gap:10}}><Avatar name={p.n} size={28} tone={p.tone}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{display:'block',fontSize:12.6,fontWeight:600}}>{p.n}</span>
<span className="trunc" style={{display:'block',fontSize:11,color:'var(--ink-3)'}}>{p.r} · max {p.cap}</span></span>
<Sw on={c.pooled||i===0} c="var(--violet)"/></div>
<div className="row" style={{gap:9,marginTop:8}}><span className="grow"><Meter pct={p.load} tone={p.load>75?'var(--warn)':'var(--ok)'} h={4}/></span>
<span className="mono" style={{fontSize:10.6,color:'var(--ink-3)',flex:'none'}}>{p.load}% booked</span></div></div>)}</CfgCard>
<CfgCard t="How she hands it out">
<CfgRow k="Distribution" v={c.dist} note={c.pooled?'Equal keeps the count even. Availability-first fills the earliest slot and lets the count drift — faster for the client, less fair to whoever has the open calendar.':'Turn on pooling to set this.'}/>
<CfgRow k="Weighting" v={c.pooled?'You 70 · Dana 30':'—'}/>
<CfgRow k="Per-host daily cap" v={c.pooled?'Respected — hers is 2, yours is 4':'—'}/>
<CfgRow k="Collective" v="Require both hosts free" sw on={false} c="var(--violet)" note="For a call where you and Dana both need to be there. Slots become the overlap of two calendars, which is thin."/>
<CfgRow k="Group seats" v="One slot, many attendees" sw on={false} c="var(--violet)"/></CfgCard>
<CfgCard t="Who joins you" d="A joiner sits in without hosting — second chair, shadow, or a moderator on a webinar.">
<CfgRow k="Always joins" v={c.joins} sw on={c.joins!=='Nobody'} c="#2E7D8F"/>
<CfgRow k="What they see" v="The call and the record, and cannot change either" note="Shadow mode. For training a rep without handing over the account."/>
<CfgRow k="Setter" v={c.pooled?'Sasha Kim may book this on your behalf':'Nobody books this for you'} sw on={c.pooled} c="#2E7D8F"/></CfgCard>
<div style={{padding:'12px 13px',border:'1px dashed var(--violet-line)',borderRadius:'var(--r-m)',background:'var(--violet-tint)',marginTop:10}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.users size={12}/>One seat, for now</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>Your Team tab has five seats. Three of them can be assigned here today, and none of the three has a calendar connected yet — so the routing holds until they sign in.</div></div></>}
{s==='timing'&&<>
<CfgCard t="Availability" d={'This link reads '+t.sched+'. Four links share it, so widening it widens them all.'}>
<CfgRow k="Schedule" v={t.sched}/><CfgRow k="Buffer" v={t.buf}/>
<CfgRow k="Minimum notice" v={t.notice}/><CfgRow k="Daily cap" v={t.cap}/>
<CfgRow k="Rolling window" v={c.roll} note="How far ahead anyone can reach. Short windows protect a calendar you cannot see three weeks into."/>
<CfgRow k="Start increments" v={c.inc} note="Slots land on this grid. Fifteen fills a day tighter; thirty reads calmer on the page."/></CfgCard>
<CfgCard t="Deadline-aware slots" d="The part no scheduling tool does. She reads Trust Compass before she offers a time." tone="var(--gold-line)">
<CfgRow k="Filing guard" v={c.solve?'On — hides the day before a hard filing':'Off'} sw on={c.solve} c="var(--gold)"/>
<CfgRow k="Protected blocks" v="Never offered, even when nothing is booked" sw on c="var(--gold)"/>
<CfgRow k="Conflict tolerance" v="Warn me, do not block" note="Aug 18 is the live example — a ninety-minute session already sits under a federal filing. With the guard on, that slot would not have been offered."/></CfgCard>
<CfgCard t={c.multi.on?'Multi-session':'Single session'} d={c.multi.d}>
<CfgRow k="Sessions" v={c.multi.on?(t.n.includes('Quarterly')?'Recurring, quarterly':'2 — booked together'):'1'} sw on={c.multi.on} c="var(--violet)"/>
<CfgRow k="Gap between" v={c.multi.on?(t.n.includes('Quarterly')?'13 weeks':'2 weeks'):'—'}/>
<CfgRow k="If they cancel one" v={c.multi.on?'Keep the rest, tell me':'—'}/></CfgCard></>}
{s==='money'&&<>
<CfgCard t={c.pay.on?'Payment at booking':'No payment on this link'}
d={c.pay.on?'The card is the qualifier. Nobody holds ninety minutes of your time for free.':'Free or included in a retainer.'}
tone={c.pay.on?'var(--gold-line)':'var(--line)'}>
<CfgRow k="Collect" v={c.pay.mode} sw on={c.pay.on} c="var(--gold)"/>
<CfgRow k="Amount" v={c.pay.amt}/><CfgRow k="How it is held" v={c.pay.dep}/>
<CfgRow k="Late cancel" v={c.pay.fee} note={c.pay.on?'Inside twenty-four hours. She charges it and writes the note, you do not have the conversation.':null}/>
<CfgRow k="Refund on cancel" v={c.pay.on?'Full, outside 24 hours':'—'}/></CfgCard>
<CfgCard t="Processor">
<CfgRow k="Stripe" v="Connected · acct_1MogulEnt" sw on/>
<CfgRow k="Invoice after" v="Sent from the vault, not from Stripe" sw on={c.pay.on}/>
<CfgRow k="Tax" v="Handled by your filing rules"/></CfgCard>
{c.pay.on&&<CfgCard t="Last 30 days">
<CfgRow k="Collected" v={c.pay.rev}/><CfgRow k="Authorised, not settled" v="$450 · one hold on Aug 27"/>
<CfgRow k="Fees charged" v="None yet"/></CfgCard>}</>}
{s==='follow'&&<>
<CfgCard t="What she sends around it" d="Five touches. Four are on, and none of them need you.">
{CFG.wf.map(([w,d,on],i)=><div key={w} style={{padding:'11px 13px',borderTop:i?'1px solid var(--line-soft)':'0',opacity:on?1:.5}}>
<div className="row" style={{gap:10}}>
<span className="mono" style={{fontSize:11,color:'var(--ink-3)',width:104,flex:'none'}}>{w}</span>
<span className="grow" style={{fontSize:12.2,color:'var(--ink-2)',lineHeight:1.45}}>{d}</span>
<Sw on={on} c="var(--violet)"/></div></div>)}</CfgCard>
<div className="eyebrow" style={{marginTop:16}}>Autonomy on bookings</div>
<div className="row" style={{gap:6,marginTop:8}}>{['off','confirm','auto'].map(k=><button key={k} className="btn btn-s"
style={{height:28,fontSize:11.8,borderColor:k===c.auto?TIER[k][0]:'var(--line)',background:k===c.auto?TIER[k][0]+'14':'var(--surface)',color:k===c.auto?TIER[k][0]:'var(--ink-2)'}}>
<TierDot tier={k}/>{TIER[k][1]}</button>)}</div>
<div className="sub" style={{marginTop:7,fontSize:11.6,lineHeight:1.5}}>{c.auto==='auto'
?'Clean requests book themselves. Anything that collides with a filing or a protected block comes to you instead.'
:'Every request waits for your read, even the clean ones. Thirty days of clean approvals and she will ask about promoting it.'}</div>
<CfgCard t="Cancellation and reschedule">
<CfgRow k="They can reschedule" v="Up to 4 hours before" sw on/>
<CfgRow k="They can cancel" v="Any time — fee applies inside 24 hours" sw on/>
<CfgRow k="Reason required" v="One line, and she reads it" sw on/>
<CfgRow k="No-show" v="Reschedule link sent 15 minutes in" sw on note="One no-show in fourteen consults, and eleven of fourteen rebooked without you touching it."/></CfgCard></>}
{s==='share'&&<>
<div className="mono row" style={{gap:8,marginTop:10,padding:'9px 12px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)',fontSize:11.6}}>
<span className="trunc grow">book.paige.ai/{t.slug}</span><span className="pill pill-n" style={{fontSize:10}}>Copy</span></div>
<CfgCard t="Ways to put it out" d="Same page, four wrappers.">
{CFG.embed.map(([n,d,tag],i)=><div key={n} className="row" style={{gap:10,padding:'11px 13px',borderTop:i?'1px solid var(--line-soft)':'0',alignItems:'flex-start'}}>
<span className="grow" style={{minWidth:0}}><span style={{fontSize:12.4,fontWeight:600}}>{n}</span>
<span style={{display:'block',fontSize:11.4,color:'var(--ink-3)',lineHeight:1.45,marginTop:3}}>{d}</span></span>
<span className="mono pill pill-n" style={{fontSize:10,flex:'none'}}>{tag}</span></div>)}</CfgCard>
<CfgCard t="Where bookings came from" d="UTM passes straight through the page into the booking record.">
<CfgRow k="Pricing page" v="8 of 14"/><CfgRow k="Email signature" v="4 of 14"/>
<CfgRow k="Referral link" v="2 of 14"/><CfgRow k="Webhook on book" v="Fires into your action bus" sw on/></CfgCard>
<button className="btn btn-s btn-p" onClick={()=>{onClose();onPreview(t)}} style={{marginTop:12}}><Ic.search size={12}/>See the page a client sees</button></>}</div></SlideOut>};

export const CalendarRouting=()=>{const[f,setF]=React.useState(CFG.forms[0]);
return <div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div style={{minWidth:0}}><h3>{f.n}</h3>
<div className="sub trunc">{f.st==='Live'?f.sent+' people routed':'Not live yet'} · one question, {f.br.length} branches</div></div>
<span className={'pill '+(f.st==='Live'?'pill-ok':'pill-n')}>{f.st}</span></div>
<div className="pane" style={{flex:1,padding:'16px 18px'}}>
<div style={{fontSize:12.5,color:'var(--ink-2)',lineHeight:1.55}}>{f.d}</div>
<div style={{marginTop:16,padding:'13px 15px',border:'1px solid var(--violet-line)',background:'var(--violet-tint)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.4,color:'var(--violet)'}}>She asks</div>
<div style={{fontSize:14.5,fontWeight:600,letterSpacing:'-.02em',marginTop:4}}>{f.q}</div></div>
<div style={{marginTop:14,paddingLeft:22,position:'relative'}}>
<span style={{position:'absolute',left:9,top:0,bottom:26,width:1,background:'var(--line)'}}/>
{f.br.map((b,i)=><div key={b.a} style={{position:'relative',paddingBottom:12}}>
<span style={{position:'absolute',left:-13,top:16,width:12,height:1,background:'var(--line)'}}/>
<span style={{position:'absolute',left:-17,top:13,width:7,height:7,borderRadius:'50%',background:'var(--violet)',border:'2px solid var(--surface)'}}/>
<div className="card" style={{padding:'12px 14px'}}>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<span className="grow" style={{minWidth:0,fontSize:12.8,fontWeight:600}}>{b.a}</span>
{!!b.n&&<span className="mono pill pill-n" style={{fontSize:10}}>{b.n} took it</span>}</div>
<div className="row" style={{gap:8,marginTop:9,flexWrap:'wrap'}}>
<span style={{color:'var(--ink-3)',display:'flex',flex:'none'}}><Ic.arrow size={14}/></span>
<span className="pill pill-v" style={{fontSize:10.8}}><Ic.clock size={10}/>{b.to}</span></div>
<div style={{fontSize:11.8,color:'var(--ink-3)',lineHeight:1.5,marginTop:8}}>{b.note}</div></div></div>)}
<div className="row" style={{gap:8,position:'relative'}}>
<span style={{position:'absolute',left:-13,top:14,width:12,height:1,background:'var(--line)'}}/>
<button className="btn btn-s"><Ic.plus size={12}/>Add a branch</button>
<button className="btn btn-s"><Ic.spark size={12}/>Let Paige write one</button></div></div>
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)',marginTop:16}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's read</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>{f.read}</div></div></div></div>
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Routers</h3><div className="sub">A question before a calendar</div></div>
<button className="btn btn-s btn-g"><Ic.plus size={12}/>New</button></div>
<div className="pane" style={{flex:1,padding:'11px 13px',display:'grid',gap:9,alignContent:'start'}}>
{CFG.forms.map(x=><button key={x.n} onClick={()=>setF(x)} className="row" style={{gap:11,padding:'12px 13px',textAlign:'left',alignItems:'flex-start',
border:'1px solid '+(f.n===x.n?'var(--violet)':'var(--line)'),borderRadius:'var(--r-m)',background:f.n===x.n?'var(--violet-tint)':'transparent',transition:'.15s'}}>
<span className="grow" style={{minWidth:0}}>
<span className="row" style={{gap:7,flexWrap:'wrap'}}><span className="trunc" style={{fontSize:12.7,fontWeight:600}}>{x.n}</span>
<span className={'pill '+(x.st==='Live'?'pill-ok':'pill-n')} style={{fontSize:10}}>{x.st}</span></span>
<span className="trunc sub" style={{display:'block',fontSize:11.4,marginTop:2}}>{x.br.length} branches · {x.sent} routed</span></span>
<span style={{color:'var(--ink-3)',display:'flex',marginTop:2,flex:'none'}}><Ic.chev size={14}/></span></button>)}
<div style={{height:1,background:'var(--line-soft)',margin:'2px 0'}}/>
<div className="eyebrow" style={{fontSize:9.6}}>Why route at all</div>
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div style={{fontSize:12.2,color:'var(--ink-2)',lineHeight:1.55}}>A bare link treats a cold lead and a paying client the same way. One question in front of it sends the client past the consult and the lead into fifteen minutes instead of ninety.</div>
<div className="row" style={{gap:10,marginTop:10}}>
<span className="grow"><Meter pct={63} tone="var(--violet)" h={5}/></span>
<span className="mono" style={{fontSize:11,color:'var(--ink-3)',flex:'none'}}>63%</span></div>
<div style={{fontSize:11.4,color:'var(--ink-3)',marginTop:6}}>Of routed bookings skipped the free consult.</div></div>
<div style={{padding:'12px 13px',border:'1px dashed var(--gold-line)',borderRadius:'var(--r-m)',background:'var(--gold-tint)'}}>
<div className="eyebrow" style={{fontSize:9.6,color:'var(--gold)'}}>Blocking the second router</div>
<div style={{fontSize:12.2,color:'var(--ink-2)',lineHeight:1.5,marginTop:6}}>Its fallback branch points at the ad-hoc link, which is switched off. Turn that on and it can go live.</div>
<button className="btn btn-s btn-g" style={{height:26,fontSize:11.5,marginTop:9}}><Ic.check size={11}/>Turn the ad-hoc link on</button></div></div></div></div>};

export const ConnCard=()=>(<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{CFG.conn.map(([n,acct,mode,on],i)=><div key={n} style={{padding:'11px 13px',borderTop:i?'1px solid var(--line-soft)':'0',opacity:on?1:.5}}>
<div className="row" style={{gap:10}}>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{display:'block',fontSize:12.4,fontWeight:600}}>{n}</span>
<span className="trunc mono" style={{display:'block',fontSize:10.6,color:'var(--ink-3)'}}>{acct}</span></span>
<Sw on={on}/></div>
<div style={{fontSize:11.4,color:'var(--ink-3)',marginTop:5}}>{on?mode:'Not connected'}</div></div>)}</div>);
