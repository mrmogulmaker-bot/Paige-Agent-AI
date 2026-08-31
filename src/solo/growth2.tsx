// @ts-nocheck
import React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, PageHead } from "./_shared";
import { useSoloCampaigns } from "./useSoloCampaigns";
import "./solo-campaigns.css";

// Vibe Studio still imports this project-only fixture. Campaigns never renders it;
// preserving the export avoids changing the separately owned Vibe implementation.
export const GR={projects:[
 {n:'Meridian Advisory website',type:'Site · 6 pages',edited:'2h ago',state:'Published'},
 {n:'Masterclass landing page',type:'Page + form',edited:'Yesterday',state:'Published'},
 {n:'Discovery-call intake',type:'Form',edited:'3d ago',state:'Published'},
 {n:'Client-scoring dashboard',type:'Internal tool',edited:'5d ago',state:'Draft'},
 {n:'New-client welcome sequence',type:'Email · 5 steps',edited:'1w ago',state:'Published'}
]};

const TRUTH = {
  overview: ["UNAVAILABLE", "A tenant-authorized all-state campaign rollup is not yet available."],
  catalog: ["PARTIAL", "Published pages, funnels, forms, and captured submissions come from tenant-scoped records."],
  sales: ["PROPOSED", "Captured activity can be traced, but a consolidated campaign-sales owner is not available."],
  pipeline: ["PROPOSED", "Only explicit form routing configuration and recorded outcomes are shown."],
  social: ["UNAVAILABLE", "A customer-facing social provider connection is not ready."],
  performance: ["PROPOSED", "Source coverage is visible; cross-source campaign analytics are not yet canonical."],
};

const LEGACY = {
  "brand-kit": { label: "Brand Kit", note: "Brand identity and reusable creative now belong in Vibe Studio." },
  pages: { label: "Pages", note: "Pages are created, edited, and published in Vibe Studio. Published pages appear in Catalog." },
  funnels: { label: "Funnels", note: "Funnels and their pages, forms, and video are managed in Vibe Studio. Published funnels appear in Catalog." },
  forms: { label: "Forms", note: "Forms are managed in Vibe Studio. Campaigns reports submissions and routing outcomes only when recorded." },
  builders: { label: "Builders", note: "Creative tools and builder connections are managed outside Campaigns. Vibe Studio is the creative owner." },
};

const openStudio=(event)=>window.dispatchEvent(new CustomEvent('paige-studio',{detail:{returnFocus:event.currentTarget}}));
let pendingCampaignTabFocus=null;

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function TruthTag({ state }) {
  const label = state || "UNAVAILABLE";
  return <span className={`campaigns-truth campaigns-truth--${label.toLowerCase()}`}>{label}</span>;
}

function StateFrame({ phase, retry, noun, children }) {
  if (phase === "resolving") return <div className="campaigns-state" role="status"><span className="campaigns-spinner"/>Resolving this account’s Campaigns workspace…</div>;
  if (phase === "loading") return <div className="campaigns-skeleton" role="status" aria-label={`Loading ${noun}`}><span/><span/><span/></div>;
  if (phase === "unavailable") return <div className="campaigns-state"><TruthTag state="UNAVAILABLE"/><h2>Campaigns needs a resolved workspace</h2><p>No tenant data is read until your account context is confirmed.</p></div>;
  if (phase === "error") return <div className="campaigns-state" role="alert"><TruthTag state="UNAVAILABLE"/><h2>Campaigns could not load</h2><p>Your records were not changed. Try the tenant-scoped read again.</p><button className="btn btn-s" onClick={retry}><Ic.arrow size={13}/>Retry</button></div>;
  return children;
}

function Empty({ title, detail }) {
  return <div className="campaigns-state"><h2>{title}</h2><p>{detail}</p></div>;
}

function SurfaceHead({ truthKey, title, description, action }) {
  const [state, note] = TRUTH[truthKey];
  return <div className="campaigns-surface-head"><div><div className="campaigns-heading-line"><h2>{title}</h2><TruthTag state={state}/></div><p>{description}</p><small>{note}</small></div>{action}</div>;
}

function DetailDrawer({ detail, onClose }) {
  const closeRef = React.useRef(null);
  const drawerRef = React.useRef(null);
  React.useEffect(() => {
    if (!detail) return;
    const previous = document.activeElement;
    const background = document.querySelectorAll(".solo-campaigns > .campaigns-nav, .solo-campaigns > .campaigns-scroll");
    background.forEach((node) => node.setAttribute("inert", ""));
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(drawerRef.current?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); background.forEach((node) => node.removeAttribute("inert")); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [detail, onClose]);
  if (!detail) return null;
  return <><button className="campaigns-drawer-scrim" tabIndex={-1} aria-label="Close details" onClick={onClose}/><aside ref={drawerRef} className="campaigns-drawer" role="dialog" aria-modal="true" aria-labelledby="campaigns-detail-title">
    <header><div><span className="eyebrow">Grounded detail</span><h2 id="campaigns-detail-title">{detail.title}</h2></div><button ref={closeRef} className="btn btn-s" onClick={onClose} aria-label="Close details"><Ic.x size={14}/></button></header>
    <div className="campaigns-drawer-body">{detail.rows.map(([label, value]) => <div className="campaigns-detail-row" key={label}><span>{label}</span><strong>{value || "Not recorded"}</strong></div>)}{detail.note&&<p className="campaigns-detail-note">{detail.note}</p>}</div>
  </aside></>;
}

function Overview({ data, setDetail }) {
  const [filter, setFilter] = React.useState("all");
  const statuses = [...new Set(data.campaigns.map((campaign) => campaign.status))];
  const shown = filter === "all" ? data.campaigns : data.campaigns.filter((campaign) => campaign.status === filter);
  return <section className="campaigns-surface"><SurfaceHead truthKey="overview" title="Campaign overview" description="All campaign states belong here once a tenant-authorized rollup is available." action={<label className="campaigns-filter"><span>State</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All available</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>}/>
    <StateFrame phase={data.phase} retry={data.retry} noun="campaigns">{shown.length===0?<div className="campaigns-state"><TruthTag state="UNAVAILABLE"/><h2>Campaign state rollup unavailable</h2><p>Active, paused, draft, completed, scheduled, failed, and inactive states are not inferred from a partial or globally scoped source.</p></div>:<div className="campaigns-list">{shown.map((campaign)=><button className="campaigns-list-row" key={campaign.id} onClick={()=>setDetail({title:campaign.name,rows:[["State",campaign.status],["Active",campaign.activeCount == null ? "Not recorded" : String(campaign.activeCount)],["Completed",campaign.completedCount == null ? "Not recorded" : String(campaign.completedCount)],["Last activity",formatDate(campaign.lastActivityAt)]],note:"Only fields returned by a tenant-authorized campaign owner are shown."})}><span><strong>{campaign.name}</strong><small>Last activity: {formatDate(campaign.lastActivityAt)}</small></span><span className="campaigns-row-end"><span className="campaigns-status">{campaign.status}</span><Ic.chev size={14}/></span></button>)}</div>}</StateFrame>
  </section>;
}

function Catalog({ data, setDetail, initialType }) {
  const [type, setType] = React.useState(initialType || "all");
  React.useEffect(()=>{ if(initialType) setType(initialType); },[initialType]);
  const shown = type === "all" ? data.artifacts : data.artifacts.filter((artifact)=>artifact.type===type);
  return <section className="campaigns-surface"><SurfaceHead truthKey="catalog" title="Published catalog" description="Read-only published outputs owned by Vibe Studio." action={<div className="campaigns-segmented" aria-label="Filter published outputs">{["all","page","funnel","form"].map((item)=><button key={item} aria-pressed={type===item} onClick={()=>setType(item)}>{item === "all" ? "All" : `${item[0].toUpperCase()}${item.slice(1)}s`}</button>)}</div>}/>
    <StateFrame phase={data.phase} retry={data.retry} noun="published outputs">{shown.length===0?<Empty title="No published outputs in this view" detail="Create and publish creative work in Vibe Studio. Campaigns will list only grounded published outputs here."/>:<div className="campaigns-catalog-grid">{shown.map((artifact)=><article className="campaigns-artifact" key={`${artifact.type}-${artifact.id}`}><div><span className="campaigns-type">{artifact.type}</span><h3>{artifact.name}</h3><p>Updated {formatDate(artifact.updatedAt)}</p></div><div className="campaigns-artifact-actions"><button className="btn btn-s" onClick={()=>setDetail({title:artifact.name,rows:[["Type",artifact.type],["Published state",artifact.status],["Recent captures",artifact.type==="form"?`${artifact.recentSubmissions} in the latest 200 workspace submissions`:"Not available"],["Routing contract",artifact.type==="form"?(artifact.routingConfigured?"Configured":"Not configured"):"Not applicable"]],note:"Creative changes remain in Vibe Studio. Recent capture counts are a bounded window, not lifetime totals."})}>Details</button>{artifact.publicHref&&<a className="btn btn-s" href={artifact.publicHref} target="_blank" rel="noreferrer">Open published <Ic.arrow size={12}/></a>}</div></article>)}</div>}</StateFrame>
  </section>;
}

function Sales({ data, setDetail }) {
  const routed = data.submissions.filter((row)=>row.contactId||row.dealId);
  return <section className="campaigns-surface"><SurfaceHead truthKey="sales" title="Routed capture activity" description="Recorded contact and deal references only—never estimated revenue or campaign attribution."/><StateFrame phase={data.phase} retry={data.retry} noun="routed capture activity">{routed.length===0?<Empty title="No routed capture activity" detail="A submission is not treated as a sale. Contact or deal references appear only when the recorded processing result supplies them."/>:<div className="campaigns-list">{routed.map((row)=><button className="campaigns-list-row" key={row.id} onClick={()=>setDetail({title:"Captured activity",rows:[["Source",row.source],["Recorded",formatDate(row.createdAt)],["Contact reference",row.contactId?"Recorded":"Not recorded"],["Deal reference",row.dealId?"Recorded":"Not recorded"]],note:"No monetary value or campaign attribution is inferred."})}><span><strong>{row.source}</strong><small>{formatDate(row.createdAt)}</small></span><span className="campaigns-row-end">Recorded <Ic.chev size={14}/></span></button>)}</div>}</StateFrame></section>;
}

function PipelineStageRow({ stage, index, stages, pipeline, canManage, save }) {
  const [draft,setDraft]=React.useState({label:stage.label,description:stage.description||""});
  return <article className={stage.archivedAt?"is-archived":""}><div className="pipeline-stage-fields"><label><span>Name</span><input disabled={!canManage||!!stage.archivedAt} value={draft.label} onChange={(event)=>setDraft({...draft,label:event.target.value})}/></label><label><span>Description</span><input disabled={!canManage||!!stage.archivedAt} value={draft.description} onChange={(event)=>setDraft({...draft,description:event.target.value})}/></label></div><div><button className="btn btn-s" disabled={!canManage||!!stage.archivedAt||!draft.label.trim()} onClick={()=>save({type:"update-stage",stageId:stage.id,...draft})}>Save</button><button className="btn btn-s" disabled={!canManage||index===0||!!stage.archivedAt} onClick={()=>save({type:"reorder-stages",pipelineId:pipeline.id,orderedIds:[...stages.map((item)=>item.id).filter((id)=>id!==stage.id).slice(0,index-1),stage.id,...stages.map((item)=>item.id).filter((id)=>id!==stage.id).slice(index-1)]})} aria-label={`Move ${stage.label} earlier`}>↑</button><button className="btn btn-s" disabled={!canManage} onClick={()=>save({type:stage.archivedAt?"restore-stage":"archive-stage",stageId:stage.id})}>{stage.archivedAt?"Restore":"Archive"}</button></div></article>;
}

function PipelineConfigPanel({ pipeline, stages, canManage, run, onClose }) {
  const [draft, setDraft] = React.useState({ name: pipeline.name, description: pipeline.description || "" });
  const [newStage, setNewStage] = React.useState({ label: "", description: "" });
  const [message, setMessage] = React.useState("");
  const save = async (action) => { const result = await run(action); setMessage(result.message); };
  return <section className="pipeline-config" aria-labelledby="pipeline-config-title">
    <header><div><span className="eyebrow">Supporting control</span><h3 id="pipeline-config-title">Configure pipeline</h3></div><button className="btn btn-s" onClick={onClose}>Done</button></header>
    {!canManage&&<p className="pipeline-readonly"><Ic.shield size={14}/>You can review this pipeline, but only a tenant administrator can change it.</p>}
    <div className="pipeline-config-fields"><label><span>Name</span><input disabled={!canManage} value={draft.name} onChange={(event)=>setDraft({...draft,name:event.target.value})}/></label><label><span>Description</span><input disabled={!canManage} value={draft.description} onChange={(event)=>setDraft({...draft,description:event.target.value})}/></label><button className="btn btn-s" disabled={!canManage||!draft.name.trim()} onClick={()=>save({type:"update-pipeline",pipelineId:pipeline.id,...draft})}>Save details</button></div>
    <div className="pipeline-stage-list"><h4>Stages</h4>{stages.map((stage,index)=><PipelineStageRow key={stage.id} stage={stage} index={index} stages={stages} pipeline={pipeline} canManage={canManage} save={save}/>)}</div>
    <div className="pipeline-new-stage"><h4>Add a stage</h4><label><span>Name</span><input disabled={!canManage} value={newStage.label} onChange={(event)=>setNewStage({...newStage,label:event.target.value})}/></label><label><span>Description</span><input disabled={!canManage} value={newStage.description} onChange={(event)=>setNewStage({...newStage,description:event.target.value})}/></label><button className="btn btn-s" disabled={!canManage||!newStage.label.trim()} onClick={()=>save({type:"create-stage",pipelineId:pipeline.id,...newStage})}>Add stage</button></div>
    {message&&<p className="pipeline-save-message" role="status">{message}</p>}
  </section>;
}

function PipelineSurface({ data, setDetail }) {
  const workspace=data.pipelineWorkspace;
  const [selectedId,setSelectedId]=React.useState("");
  const [focusedStageId,setFocusedStageId]=React.useState("");
  const [configuring,setConfiguring]=React.useState(false);
  const [creating,setCreating]=React.useState(false);
  const [newPipeline,setNewPipeline]=React.useState({name:"",description:"",starter:"blank"});
  const selected=workspace.pipelines.find((item)=>item.id===selectedId)??workspace.pipelines[0];
  const stages=selected?workspace.stages.filter((stage)=>stage.pipelineId===selected.id).sort((a,b)=>a.orderIndex-b.orderIndex):[];
  const activeStages=stages.filter((stage)=>!stage.archivedAt);
  const focusId=activeStages.some((stage)=>stage.id===focusedStageId)?focusedStageId:activeStages[0]?.id;
  React.useEffect(()=>{ if(selected&&selected.id!==selectedId){setSelectedId(selected.id);setFocusedStageId("");setConfiguring(false);} },[selected,selectedId]);
  const openDeal=(deal)=>setDetail({title:deal.title,rows:[["Client",deal.clientName],["Owner",deal.owner],["Status",deal.status],["Next action",deal.nextAction],["Source evidence",deal.source],["Client portal",deal.portalAvailable?"Available":"Not connected"],["Last changed",formatDate(deal.updatedAt)],["Stage history",deal.history.length?deal.history.map((item)=>`${item.summary} · ${formatDate(item.createdAt)}`).join("\n"):"No recorded stage history"]],note:"This contextual record shows only durable fields returned for this tenant. Financial and lifecycle facts are omitted when they are not attributed."});
  const create=async()=>{const result=await data.pipelineAction({type:"create-pipeline",...newPipeline});if(result.ok){setCreating(false);setNewPipeline({name:"",description:"",starter:"blank"});}};
  return <section className="campaigns-surface pipeline-surface"><SurfaceHead truthKey="pipeline" title="Deal workspace" description="Tenant-owned pipelines, custom stages, and contextual work records." action={<div className="pipeline-actions"><label><span className="sr-only">Pipeline</span><select value={selected?.id||""} onChange={(event)=>{setSelectedId(event.target.value);setFocusedStageId("");setConfiguring(false);}}>{workspace.pipelines.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="btn btn-s" disabled={!workspace.canManage} onClick={()=>setCreating(true)}>New pipeline</button>{selected&&<button className="btn btn-s" onClick={()=>setConfiguring(!configuring)}>Configure stages</button>}</div>}/><StateFrame phase={data.phase} retry={data.retry} noun="pipeline workspace">
    {creating&&<div className="pipeline-create" role="dialog" aria-modal="true" aria-labelledby="new-pipeline-title"><h3 id="new-pipeline-title">Create pipeline</h3><label><span>Name</span><input autoFocus value={newPipeline.name} onChange={(event)=>setNewPipeline({...newPipeline,name:event.target.value})}/></label><label><span>Description</span><input value={newPipeline.description} onChange={(event)=>setNewPipeline({...newPipeline,description:event.target.value})}/></label><label><span>Starting point</span><select value={newPipeline.starter} onChange={(event)=>setNewPipeline({...newPipeline,starter:event.target.value})}><option value="blank">Blank pipeline</option><option value="simple">Simple starter stages</option></select></label><div><button className="btn btn-s" onClick={()=>setCreating(false)}>Cancel</button><button className="btn btn-s btn-p" disabled={!newPipeline.name.trim()} onClick={create}>Create</button></div></div>}
    {workspace.pipelines.length===0?<div className="pipeline-empty"><h2>No pipeline yet</h2><p>Create a blank pipeline or choose the optional starter stages. A campaign is one possible use, not a requirement.</p><button className="btn btn-s btn-p" disabled={!workspace.canManage} onClick={()=>setCreating(true)}>Create pipeline</button>{!workspace.canManage&&<p>You have read-only access. A tenant administrator can create the first pipeline.</p>}</div>:<>
      {selected&&configuring&&<PipelineConfigPanel pipeline={selected} stages={stages} canManage={workspace.canManage} run={data.pipelineAction} onClose={()=>setConfiguring(false)}/>} 
      {selected&&activeStages.length===0?<div className="pipeline-empty"><h2>No active stages</h2><p>Add a tenant-owned stage to begin organizing work. Archived stages remain available in configuration.</p></div>:selected&&<div className="pipeline-board-wrap"><div className="pipeline-stage-focus"><label><span>Focused stage</span><select value={focusId||""} onChange={(event)=>setFocusedStageId(event.target.value)}>{activeStages.map((stage)=><option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label></div><div className="pipeline-board" style={{"--pipeline-stage-count":activeStages.length}}>{activeStages.map((stage)=><section key={stage.id} className={`pipeline-lane ${stage.id===focusId?"is-focused":""}`}><header><div><h3>{stage.label}</h3>{stage.description&&<p>{stage.description}</p>}</div></header><div className="pipeline-cards">{workspace.deals.filter((deal)=>deal.pipelineId===selected.id&&deal.stageId===stage.id).map((deal)=><button key={deal.id} className="pipeline-card" onClick={()=>openDeal(deal)}><strong>{deal.title}</strong><span>{deal.clientName}</span><small>{deal.owner}</small><small>{deal.nextAction}</small><span className="pipeline-evidence">{deal.source}</span></button>)}{!workspace.deals.some((deal)=>deal.pipelineId===selected.id&&deal.stageId===stage.id)&&<p className="pipeline-lane-empty">No work in this stage</p>}</div></section>)}</div></div>}
      <details className="pipeline-routing"><summary>Routing, approvals, and repair evidence</summary>{data.artifacts.filter((artifact)=>artifact.type==="form").length===0?<p>No published form evidence is available. Pipelines can still be created and managed independently.</p>:<div className="campaigns-list">{data.artifacts.filter((artifact)=>artifact.type==="form").map((form)=><button className="campaigns-list-row" key={form.id} onClick={()=>setDetail({title:form.name,rows:[["Routing posture",form.routingState],["Enabled targets",form.routingTargets.length?form.routingTargets.join(", "):"None recorded"],["Durable outcome statuses",Object.keys(form.dispatchStatuses).length?Object.entries(form.dispatchStatuses).map(([status,count])=>`${status}: ${count}`).join(" · "):"No dispatch outcomes recorded"],["Repair / dead-letter",form.recentDispatches.failed?`${form.recentDispatches.failed} failed outcome${form.recentDispatches.failed===1?"":"s"} recorded`:"No failed outcome recorded"]],note:"Every recorded dispatch status is listed without collapsing its durable meaning. Routing and repair remain supporting evidence; they do not replace the deal workspace."})}><span><strong>{form.name}</strong><small>{form.routingState}</small></span><span className={`campaigns-status ${form.routingState==="Active"?"is-ready":""}`}>{form.recentDispatches.failed?"Repair needed":form.routingState}</span></button>)}</div>}</details>
    </>}
  </StateFrame></section>;
}

function Social() {
  return <section className="campaigns-surface"><SurfaceHead truthKey="social" title="Social placements" description="Published Vibe Studio artifacts will appear here only after a supported provider records their placement."/><div className="campaigns-state"><TruthTag state="UNAVAILABLE"/><h2>Social provider not ready</h2><p>No accounts, followers, publishing queue, schedules, or placements are inferred. Manage creative work in Vibe Studio while this connection remains unavailable.</p></div></section>;
}

function Performance({ data }) {
  return <section className="campaigns-surface"><SurfaceHead truthKey="performance" title="Performance coverage" description="A source-by-source view of what can—and cannot—be reported truthfully."/><StateFrame phase={data.phase} retry={data.retry} noun="performance sources"><div className="campaigns-coverage"><article><TruthTag state="UNAVAILABLE"/><h3>Campaign runs</h3><p>A tenant-authorized campaign rollup is not available.</p></article><article><TruthTag state="PARTIAL"/><h3>Published outputs</h3><p>{data.artifacts.length?"Published Vibe Studio outputs are available.":"No published outputs were returned."}</p></article><article><TruthTag state="PROPOSED"/><h3>Attribution and outcomes</h3><p>Captured submissions may carry traceable source and routing references; no ROI or revenue is calculated.</p></article><article><TruthTag state="UNAVAILABLE"/><h3>Social performance</h3><p>No supported provider source is connected to this customer-facing surface.</p></article></div></StateFrame></section>;
}

function CompatibilityLanding({ legacy, setTab }) {
  const item = LEGACY[legacy];
  return <section className="campaigns-compat" aria-labelledby="campaigns-compat-title"><span className="campaigns-type">Compatibility address</span><h2 id="campaigns-compat-title">This address moved</h2><p><strong>{item.label}</strong> is no longer a Campaigns subtab. {item.note}</p><div className="campaigns-compat-note"><Ic.shield size={16}/><span>Your workspace and account stay selected. Vibe Studio opens through the existing supported handoff and returns focus here when you leave.</span></div><div className="campaigns-compat-actions"><button className="btn btn-s btn-p" data-solo-vibe-studio-launcher onClick={openStudio}><Ic.spark size={13}/>Vibe Studio</button><button className="btn btn-s" onClick={()=>setTab("catalog")}>Return to Catalog</button></div></section>;
}

function CampaignTabs({ tabs, current, setCurrent }) {
  React.useLayoutEffect(()=>{
    if(pendingCampaignTabFocus!==current)return;
    document.getElementById(`campaigns-tab-${current}`)?.focus({preventScroll:true});
    pendingCampaignTabFocus=null;
  },[current]);
  const onKeyDown = (event, index) => {
    if (!["ArrowRight","ArrowLeft","Home","End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length-1 : (index+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
    const nextKey=tabs[next][0];
    pendingCampaignTabFocus=nextKey;
    setCurrent(nextKey);
  };
  return <div className="campaigns-nav"><div className="campaigns-tabs" role="tablist" aria-label="Campaigns views">{tabs.map((tab,index)=><button id={`campaigns-tab-${tab[0]}`} aria-controls="campaigns-tabpanel" key={tab[0]} role="tab" aria-selected={current===tab[0]} tabIndex={current===tab[0]?0:-1} onClick={()=>setCurrent(tab[0])} onKeyDown={(event)=>onKeyDown(event,index)}>{tab[2]()}<span>{tab[1]}</span></button>)}</div><button className="btn btn-s btn-p campaigns-studio" data-solo-vibe-studio-launcher onClick={openStudio}><Ic.spark size={13}/>Vibe Studio</button></div>;
}

// Retained for the existing hidden Clients compatibility mount. It performs no
// data read and points back to the one canonical Campaigns Pipeline address.
export const Pipeline=()=>{
  const params=useParams();
  const navigate=useNavigate();
  const account=params.account;
  return <div className="solo-campaigns"><div className="campaigns-scroll"><PageHead eyebrow="Campaigns" title="Pipeline moved" sub="Campaign capture and routing now live under Campaigns."/><section className="campaigns-compat"><span className="campaigns-type">Compatibility address</span><h2>Open Campaigns Pipeline</h2><p>This address is preserved so older links do not silently lose their destination.</p><div className="campaigns-compat-actions"><button className="btn btn-s btn-p" disabled={!account} onClick={()=>account&&navigate(`/solo/${account}/growth/pipeline`)}>Go to Pipeline <Ic.arrow size={13}/></button></div></section></div></div>;
};

export const GrowthHub=()=>{
  const[tab,setTab]=useSubtabRoute("solo","growth","ov");
  const tabs=[['ov','Overview',()=><Ic.bolt size={14}/>],['catalog','Catalog',()=><Ic.grid size={14}/>],['sales','Sales',()=><Ic.chart size={14}/>],['pipeline','Pipeline',()=><Ic.trend size={14}/>],['social','Social',()=><Ic.users size={14}/>],['performance','Performance',()=><Ic.pulse size={14}/>]];
  const data=useSoloCampaigns();
  const params=useParams();
  const location=useLocation();
  const navigate=useNavigate();
  const segment=(params["*"]||"").split("/")[1]||"";
  const legacy=LEGACY[segment]?segment:null;
  const query=new URLSearchParams(location.search);
  const requestedType=["page","funnel","form"].includes(query.get("type"))?query.get("type"):null;
  const [detail,setDetail]=React.useState(null);
  const closeDetail=React.useCallback(()=>setDetail(null),[]);
  React.useEffect(()=>{setDetail(null);},[tab,segment]);
  React.useEffect(()=>{if(segment!=="active")return;const account=params.account;if(account)navigate(`/solo/${account}/growth/overview${location.search}`,{replace:true});},[segment,params.account,location.search,navigate]);
  const title=tabs.find((item)=>item[0]===tab)?.[1]||"Overview";
  let body=<Overview data={data} setDetail={setDetail}/>;
  if(legacy) body=<CompatibilityLanding legacy={legacy} setTab={setTab}/>;
  else if(tab==="catalog") body=<Catalog data={data} setDetail={setDetail} initialType={requestedType}/>;
  else if(tab==="sales") body=<Sales data={data} setDetail={setDetail}/>;
  else if(tab==="pipeline") body=<PipelineSurface data={data} setDetail={setDetail}/>;
  else if(tab==="social") body=<Social/>;
  else if(tab==="performance") body=<Performance data={data}/>;
  return <div className="solo-campaigns" data-campaigns-view={tab}><CampaignTabs tabs={tabs} current={tab} setCurrent={setTab}/><div id="campaigns-tabpanel" role="tabpanel" aria-labelledby={`campaigns-tab-${tab}`} className="campaigns-scroll"><PageHead eyebrow="Campaigns" title={legacy?LEGACY[legacy].label:title} sub="Grounded campaign work and published outputs, with creative ownership kept in Vibe Studio." right={<div className="campaigns-truth-key" aria-label="Capability truth labels"><TruthTag state="LIVE"/><TruthTag state="PARTIAL"/><TruthTag state="PROPOSED"/><TruthTag state="UNAVAILABLE"/></div>}/>{body}</div><DetailDrawer detail={detail} onClose={closeDetail}/></div>;
};

