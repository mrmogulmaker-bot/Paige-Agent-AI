// @ts-nocheck
import React from "react";
import { Ic } from "./_shared";

const band=d=>d<0?{k:'past',c:'var(--ink-3)',t:'var(--surface-sunk)',l:'Past due'}:d<7?{k:'crit',c:'var(--bad)',t:'var(--bad-tint)',l:'Critical'}:
 d<30?{k:'urg',c:'#C2600C',t:'#FBEBDD',l:'Urgent'}:d<60?{k:'soon',c:'var(--warn)',t:'var(--warn-tint)',l:'Approaching'}:{k:'ok',c:'var(--ok)',t:'var(--ok-tint)',l:'Healthy'};

const VLT=[
 {id:'gl',n:'General liability policy',cat:'ins',org:'Hartwell Mutual',d:7,cost:'$2,340 / yr',status:'active',dept:'legal',doc:'hartwell-gl-2026.pdf',
  terms:[['Coverage limit','$1,000,000 per occurrence','high'],['Aggregate','$2,000,000','high'],['Renewal date','Aug 20, 2026','high'],['Annual premium','$2,340','high'],['Cancellation notice','30 days written','medium'],['Deductible','$1,000','low']],
  drafted:{t:'Renewal confirmation to Hartwell Mutual',b:'Hi Renee — confirming we intend to renew the general liability policy at the current limits ahead of the August 20 date. Could you send the renewal declaration and confirm the premium holds at $2,340? If anything changed on the aggregate, flag it before we sign.',tier:'amber'},
  trail:[['Reminder fired · 60 days out','Jun 21'],['Reminder fired · 30 days out','Jul 21'],['Renewal action drafted','Aug 13 · 7:04am'],['Reminder fired · 7 days out','Aug 13 · 6:02am']],rel:['pl','wc'],partner:'insurance'},
 {id:'llc',n:'Delaware LLC annual report',cat:'form',org:'Delaware Division of Corporations',d:24,cost:'$300',status:'active',dept:'legal',doc:'de-annual-2025.pdf',
  terms:[['Filing fee','$300','high'],['Due date','Sep 6, 2026','high'],['Franchise tax','Included in filing','medium'],['Late penalty','$200 + 1.5%/mo','high']],
  drafted:{t:'Filing reminder to you, with the form pre-filled',b:'Your Delaware annual report is due September 6. I pre-filled the form from last year — registered agent, officers, and address are unchanged. Review and file, or tell me to route it to your agent.',tier:'amber'},
  trail:[['Obligation created from uploaded filing','Feb 2 · 9:14am'],['Reminder fired · 60 days out','Jul 8'],['Form pre-filled from prior year','Aug 11']],rel:['agent']},
 {id:'tax3',n:'Q3 estimated tax',cat:'tax',org:'IRS Form 1040-ES',d:31,cost:'$18,400 est.',status:'active',dept:'fin',doc:'1040es-q2-2026.pdf',
  terms:[['Payment period','Jun 1 – Aug 31','high'],['Due date','Sep 15, 2026','high'],['Estimated amount','$18,400','medium'],['Safe harbor basis','110% of prior year','medium']],
  drafted:{t:'Payment worksheet and reminder',b:'Q3 estimated tax is due September 15. Based on revenue through August the estimate is $18,400, which keeps you inside safe harbor. Worksheet attached. Consult your accountant before you send if the number looks off.',tier:'amber'},
  trail:[['Estimate recalculated from revenue','Aug 1'],['Reminder fired · 60 days out','Jul 17']],rel:['tax4']},
 {id:'pl',n:'Professional liability (E&O)',cat:'ins',org:'Beacon Specialty',d:44,cost:'$1,880 / yr',status:'active',dept:'legal',doc:'beacon-eo-2026.pdf',
  terms:[['Coverage limit','$1,000,000 claims-made','high'],['Retroactive date','Mar 4, 2023','high'],['Renewal date','Sep 26, 2026','high'],['Annual premium','$1,880','high'],['Cancellation notice','45 days','medium']],
  drafted:null,trail:[['Obligation created from uploaded policy','Mar 4 · 11:02am'],['Reminder fired · 60 days out','Jul 28']],rel:['gl'],partner:'insurance'},
 {id:'dom',n:'paigeagent.ai domain',cat:'dom',org:'Cloudflare Registrar',d:58,cost:'$42 / yr',status:'active',dept:'ops',doc:null,
  terms:[['Registrar','Cloudflare','high'],['Expiry','Oct 10, 2026','high'],['Auto-renew','On','high'],['Transfer lock','Enabled','high']],
  drafted:null,trail:[['Auto-renew confirmed','Aug 1'],['WHOIS privacy verified','Aug 1']],rel:['ssl']},
 {id:'ssl',n:'Wildcard SSL certificate',cat:'dom',org:'Cloudflare',d:71,cost:'Included',status:'active',dept:'ops',doc:null,
  terms:[['Certificate','*.paigeagent.ai','high'],['Expiry','Oct 23, 2026','high'],['Renewal','Automatic','high']],
  drafted:null,trail:[['Renewal confirmed for Oct 23','Aug 8']],rel:['dom']},
 {id:'tm',n:'Trademark maintenance · §8 declaration',cat:'tm',org:'USPTO',d:112,cost:'$525',status:'active',dept:'legal',doc:'uspto-reg-2023.pdf',
  terms:[['Registration','No. 7,214,880','high'],['Filing window','Dec 3, 2026 – Jun 3, 2027','high'],['Fee','$525 per class','high'],['Classes','2','high'],['Grace period','6 months, +$250','medium']],
  drafted:null,trail:[['Obligation created from registration certificate','Dec 3 · 2:41pm'],['Window opens in 112 days','Aug 1']],rel:[],note:true},
 {id:'agent',n:'Registered agent renewal',cat:'agent',org:'Northpoint Agents',d:96,cost:'$149 / yr',status:'active',dept:'legal',doc:null,
  terms:[['Provider','Northpoint Agents','high'],['Renewal','Nov 17, 2026','high'],['Annual fee','$149','high']],
  drafted:null,trail:[['Renewed for 2026','Nov 17']],rel:['llc'],partner:'agent'},
 {id:'lic',n:'City business license',cat:'lic',org:'City of Atlanta',d:19,cost:'$225',status:'active',dept:'legal',doc:'atl-license-2025.pdf',
  terms:[['License no.','BL-2024-88431','high'],['Renewal','Sep 1, 2026','high'],['Fee','$225 + gross receipts tier','medium'],['Late penalty','10% after 30 days','high']],
  drafted:{t:'Renewal reminder with the receipts figure ready',b:'Your city business license renews September 1. The gross-receipts tier moved you up a bracket this year, so the fee is $225 plus the tier adjustment. I have the figure ready to enter.',tier:'amber'},
  trail:[['Reminder fired · 30 days out','Aug 2'],['Renewal action drafted','Aug 12']],rel:[]},
 {id:'wc',n:"Workers' compensation",cat:'ins',org:'Statewide Mutual',d:-4,cost:'$1,120 / yr',status:'lapsed',dept:'legal',doc:'statewide-wc-2025.pdf',
  terms:[['Coverage','Statutory','high'],['Expired','Aug 9, 2026','high'],['Annual premium','$1,120','high'],['Reinstatement window','30 days','medium']],
  drafted:{t:'Reinstatement request to Statewide Mutual',b:'Our workers\' compensation coverage lapsed on August 9. We would like to reinstate at the same statutory coverage inside the 30-day window. Confirm the reinstatement premium and whether a new application is required.',tier:'amber'},
  trail:[['Reminder fired · 30 days out','Jul 10'],['Reminder fired · 7 days out','Aug 2'],['Lapsed — no response recorded','Aug 9'],['Reinstatement drafted','Aug 13 · 6:40am']],rel:['gl'],partner:'insurance'},
 {id:'qb',n:'Accounting subscription',cat:'saas',org:'Ledgerly Pro',d:12,cost:'$85 / mo',status:'active',dept:'fin',doc:null,
  terms:[['Plan','Pro, 3 seats','high'],['Renews','Aug 25, 2026','high'],['Monthly cost','$85','high'],['Cancellation','Anytime, no notice','high']],
  drafted:null,trail:[['Detected from payment data','Jan 14'],['Reminder fired · 30 days out','Jul 26']],rel:['t1099']},
 {id:'t1099',n:'Contractor 1099 filings',cat:'acct',org:'IRS · 4 contractors',d:141,cost:'Filing only',status:'active',dept:'fin',doc:null,
  terms:[['Recipients','4 contractors','high'],['Deadline','Jan 31, 2027','high'],['W-9 on file','3 of 4','medium']],
  drafted:{t:'W-9 request to Okonkwo Group',b:'Quick housekeeping — we do not have a current W-9 on file for you and will need it before January filing. Two minutes, form attached.',tier:'amber'},
  trail:[['Missing W-9 detected','Aug 5'],['Request drafted','Aug 5']],rel:['qb']},
 {id:'crm',n:'CRM subscription',cat:'saas',org:'Northlight CRM',d:33,cost:'$249 / mo',status:'active',dept:'ops',doc:null,
  terms:[['Plan','Growth, 5 seats','high'],['Renews','Sep 17, 2026','high'],['Monthly cost','$249','high'],['Contract','Annual, auto-renew','high'],['Cancellation window','30 days before term','high']],
  drafted:null,trail:[['Detected from payment data','Sep 17'],['Seat usage: 2 of 5 active','Aug 1']],rel:[],flag:'Two of five seats have not been used in 60 days.'},
 {id:'tax4',n:'Q4 estimated tax',cat:'tax',org:'IRS Form 1040-ES',d:123,cost:'$18,400 est.',status:'active',dept:'fin',doc:null,
  terms:[['Due date','Jan 15, 2027','high'],['Estimated amount','$18,400','low']],drafted:null,trail:[['Scheduled from tax calendar','Jan 2']],rel:['tax3']},
 {id:'cert',n:'Board certification renewal',cat:'cert',org:'ICF · Professional Certified',d:203,cost:'$275',status:'active',dept:'ops',doc:'icf-pcc-2023.pdf',
  terms:[['Credential','PCC','high'],['Renews','Mar 4, 2027','high'],['CCE hours required','40','high'],['Hours logged','22','medium']],
  drafted:null,trail:[['Obligation created from certificate','Mar 4'],['Hours logged: 22 of 40','Aug 1']],rel:[]}];

export const VaultTile=()=>{const items=[...VLT].sort((a,b)=>a.d-b.d).slice(0,3);const due30=VLT.filter(o=>o.d<30).length;const act=VLT.filter(o=>o.drafted).length;
return <div className="card"><div className="hd"><div><h3>Business Vault</h3><div className="sub">{VLT.length} obligations tracked</div></div><Ic.vault size={17} style={{color:'var(--ink-3)'}}/></div>
<div className="row" style={{padding:'12px 20px',gap:18,borderBottom:'1px solid var(--line-soft)'}}>
<div><div className="eyebrow" style={{fontSize:9.5}}>Due in 30 days</div><div style={{fontSize:19,fontWeight:600,marginTop:2}}>{due30}</div></div>
<div><div className="eyebrow" style={{fontSize:9.5}}>Need your action</div><div style={{fontSize:19,fontWeight:600,marginTop:2,color:'var(--warn)'}}>{act}</div></div></div>
{items.map((o,i)=>{const b=band(o.d);
return <div key={o.id} className="row" style={{padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0',gap:11}}>
<span className="mono" style={{width:46,flex:'none',fontSize:12.5,fontWeight:600,color:b.c}}>{o.d<0?'past':o.d+'d'}</span>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:13,fontWeight:500,display:'block'}}>{o.n}</span>
<span className="sub trunc" style={{display:'block'}}>{o.org} · {o.cost}</span></span>
{o.drafted?<span className="pill pill-v"><Ic.spark size={11}/>Draft ready</span>:<span className="pill pill-n">Monitoring</span>}</div>})}
<div style={{padding:'12px 20px',borderTop:'1px solid var(--line-soft)'}}>
<button className="btn btn-s" style={{width:'100%',justifyContent:'center'}}>Open Business Vault <Ic.arrow size={14}/></button></div></div>};

// Screen alias: the ported pack supplies the dashboard tile; the Solo shell mounts it as the Business Vault screen (no new markup — real symbol exposed under the shell's expected name).
export const VaultView=VaultTile;
