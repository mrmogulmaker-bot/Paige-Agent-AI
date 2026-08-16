// @ts-nocheck
import React from "react";

export const AN={
pacing:[
 {k:'Revenue this month',now:23230,goal:26500,unit:'$',verdict:'behind',note:'$3,270 short with 18 days left. Two proposals out cover it.',act:'Push Verity & Grantham'},
 {k:'New clients',now:3,goal:4,unit:'',verdict:'ontrack',note:'Northwind closes this week, which lands you on plan.',act:'Send Northwind kickoff'},
 {k:'Billable utilization',now:68,goal:75,unit:'%',verdict:'behind',note:'Nine hours a week go to admin Paige could take. Two accounts could absorb them.',act:'Hand it to Paige'},
 {k:'Collections',now:94,goal:98,unit:'%',verdict:'risk',note:'$4,180 in failed charges is the whole gap.',act:'Run dunning'}
],
changes:[
 {t:'Reply rate on outbound fell from 9.2% to 5.1%',cause:'Your sending domain hit a Google Postmaster reputation dip on Aug 8 — the same day the Teardown blast went out to 2,840 addresses at once.',fix:'Throttle the next send to 400/day and warm the second domain. Sequence rewritten.',impact:'−$2,100 est. pipeline',tone:'bad'},
 {t:'Referral revenue is up 41% quarter over quarter',cause:'Six of your last nine deals came from three clients: Harper & Vale, Bellweather, Cairn. None of them are in a referral program.',fix:'Formalize it — 10% first-year credit. Ask drafted for all three, in your voice.',impact:'+$8,400 modeled',tone:'ok'},
 {t:'Discovery-to-proposal conversion dropped to 44%',cause:'Calls booked from the Meta ad convert at 21%. Referrals convert at 78%. The ad is filling the calendar with the wrong people.',fix:'Add two qualifying questions to the booking form and cap the ad at $40/day.',impact:'6 hrs/wk back',tone:'warn'}
],
profit:[
 {n:'Northwind Partners',rev:6200,hrs:38,margin:61,verdict:'Best account'},
 {n:'Harper & Vale',rev:4800,hrs:34,margin:56,verdict:'Healthy'},
 {n:'Bellweather Co.',rev:3400,hrs:26,margin:52,verdict:'Healthy'},
 {n:'Cairn Advisory',rev:2750,hrs:24,margin:44,verdict:'Watch scope'},
 {n:'Ridgeline Co.',rev:2400,hrs:41,margin:9,verdict:'Underwater'},
 {n:'Selby Group',rev:1900,hrs:33,margin:-4,verdict:'Losing money'},
 {n:'Mercer Studio',rev:1180,hrs:12,margin:48,verdict:'Healthy'},
 {n:'Okonkwo Group',rev:600,hrs:9,margin:31,verdict:'Small but clean'}
],
channels:[
 {n:'Client referrals',clients:9,cac:120,ltv:41000,pay:0.2},
 {n:'Teardown content',clients:5,cac:640,ltv:28400,pay:1.4},
 {n:'Webinar',clients:3,cac:1180,ltv:19200,pay:3.1},
 {n:'Meta ads',clients:2,cac:2940,ltv:11600,pay:9.4},
 {n:'Cold outbound',clients:1,cac:3820,ltv:8800,pay:14.2}
],
cohorts:{months:['M0','M1','M3','M6','M9','M12'],rows:[
 {c:'Sep 25',v:[100,100,100,88,88,75]},{c:'Nov 25',v:[100,100,86,86,71,null]},
 {c:'Jan 26',v:[100,92,84,76,null,null]},{c:'Mar 26',v:[100,100,90,null,null,null]},
 {c:'May 26',v:[100,94,82,null,null,null]},{c:'Jul 26',v:[100,100,null,null,null,null]}]},
cash:{in:[18.4,19.1,20.2,21.6,22.4,23.2],out:[12.1,12.6,13.4,13.9,14.2,14.8],mo:['Mar','Apr','May','Jun','Jul','Aug'],
 fc:[23.2,24.6,26.1,27.4],fcLo:[23.2,23.4,24.2,24.6],fcHi:[23.2,25.8,28.4,31.2],fcMo:['Aug','Sep','Oct','Nov']},
aging:[{b:'Current',v:19050},{b:'1–30 days',v:4180},{b:'31–60',v:1200},{b:'60+',v:0}],
bench:[{k:'Net revenue retention',you:112,peer:98},{k:'Gross margin',you:47,peer:54},{k:'Avg retainer',you:2904,peer:2350},{k:'Proposal win rate',you:44,peer:38}],
scenarios:[
 {q:'Raise retainers 15% for new clients only',res:'+$1,740/mo by month 4',range:'+$980 to +$2,300',conf:'Medium',open:'Assumes win rate holds at 44%. Two of five channels have too little data to model.'},
 {q:'Drop Ridgeline and backfill with one referral',res:'+$1,900/mo margin, 41 hrs freed',range:'+$1,400 to +$2,200',conf:'High',open:'Referral pipeline has supplied 1.4 clients/month for six months.'},
 {q:'Hire your first contractor at $2,800/mo',res:'Breakeven in month 4',range:'month 3 to month 7',conf:'Low',open:'Depends on you holding 78% utilization. You have never held above 71% on your own.'}]
};
