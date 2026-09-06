import { useId } from "react";
import { PaigeCommandMark } from "./PaigeCommandMark";
import "./paige-symbol.css";

export type CommandState = "ready"|"listening"|"understanding"|"speaking"|"delegating"|"working"|"complete"|"interrupted"|"offline";
export type SovereignState = "autonomous"|"ask-first"|"draft-only"|"restricted"|"escalated"|"approved"|"declined";
export type ArtifactState = "requested"|"materializing"|"ready"|"reviewed"|"approved"|"delivered"|"failed";
type Common = { size?:"favicon"|"xs"|"sm"|"md"|"lg"|"xl"; treatment?:"spectral"|"monochrome"; theme?:"auto"|"light"|"dark"; animated?:boolean; label?:string; className?:string };
export type PaigeSymbolProps = Common & ({ territory:"command";state?:CommandState }|{ territory:"sovereign";state?:SovereignState }|{ territory:"artifact";state?:ArtifactState });

const defaults = { command:"ready", sovereign:"ask-first", artifact:"ready" } as const;

export function PaigeSymbol(props:PaigeSymbolProps) {
  const { territory,size="md",treatment="spectral",theme="auto",animated=false,label,className="" }=props;
  const state=props.state ?? defaults[territory]; const id=useId().replace(/:/g,"");
  const accessibility=label?{role:"img" as const,"aria-label":label}:{"aria-hidden":true as const};
  if(territory==="command") return <span className={`paige-symbol ${className}`} data-territory={territory} data-state={state} data-size={size} data-treatment={treatment} data-theme={theme} data-animated={animated} {...accessibility}><PaigeCommandMark className="paige-symbol-command" plated={false} animated={false} label={null}/></span>;
  return <svg viewBox="0 0 48 48" className={`paige-symbol ${className}`} data-territory={territory} data-state={state} data-size={size} data-treatment={treatment} data-theme={theme} data-animated={animated} fill="none" {...accessibility}>
    <defs><linearGradient id={`${id}-metal`} x1="8" y1="42" x2="41" y2="5"><stop stopColor="var(--ps-low)"/><stop offset=".5" stopColor="var(--ps-high)"/><stop offset="1" stopColor="var(--ps-cool)"/></linearGradient></defs>
    {territory==="sovereign" ? <g className="ps-sovereign" stroke={`url(#${id}-metal)`} strokeWidth="2" strokeLinecap="square"><path d="M24 5v9M24 34v9M5 24h9M34 24h9"/><path className="ps-boundary" d="M15 10h18l5 5v18l-5 5H15l-5-5V15z"/><path d="M24 17l7 7-7 7-7-7z"/><circle cx="24" cy="24" r="2.5" fill="var(--ps-high)" stroke="none"/></g> : <g className="ps-artifact" stroke={`url(#${id}-metal)`} strokeWidth="2" strokeLinejoin="round"><path className="ps-plane-back" d="M11 13h23l5 5v22H11z"/><path className="ps-plane-front" d="M7 8h23l6 6v22H7z" fill="var(--ps-fill)"/><path d="M30 8v7h6"/><path className="ps-material-core" d="M14 20h15M14 26h12M14 32h9"/></g>}
  </svg>;
}

export default PaigeSymbol;
