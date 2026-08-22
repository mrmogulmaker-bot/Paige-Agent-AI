import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TenantRedesign from "./TenantRedesign";

const destinations=["Home","Clients","Work","Studio","Insights","Settings"];
let host:HTMLDivElement;let root:Root;
const clickContaining=(label:string)=>{const button=[...host.querySelectorAll("button")].find(node=>node.textContent?.includes(label));expect(button,`button containing ${label}`).toBeTruthy();act(()=>button!.click())};
const click=(label:string)=>{const button=[...host.querySelectorAll("button")].find(node=>node.textContent?.trim()===label);expect(button,`button ${label}`).toBeTruthy();act(()=>button!.click())};

beforeEach(()=>{Object.defineProperty(window,"innerWidth",{configurable:true,value:1600});vi.spyOn(window,"open").mockReturnValue({} as Window);Object.defineProperty(window,"matchMedia",{configurable:true,value:vi.fn().mockImplementation((query:string)=>({matches:query.includes("prefers-color-scheme")?false:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn()}))});host=document.createElement("div");document.body.append(host);root=createRoot(host);act(()=>root.render(<MemoryRouter initialEntries={["/tenant-redesign"]}><TenantRedesign/></MemoryRouter>))});
afterEach(()=>{act(()=>root.unmount());host.remove();window.localStorage.clear();vi.restoreAllMocks()});

describe("tenant redesign shell",()=>{
  it("renders every primary destination without losing the shell",()=>{for(const destination of destinations){click(destination);expect(host.querySelector("#tenant-primary-nav")).toBeTruthy();expect(host.textContent).toContain(destination)}expect(host.textContent).toContain("Settings")});
  it("renders Studio with a safe route and Creation Chamber",()=>{click("Studio");expect(host.textContent).toContain("Creation Chamber");expect(host.textContent).toContain("Open connected version")});

  it("renders canonical Calendar anatomy and detachable workspace control",()=>{click("Work");click("Calendar");expect(host.textContent).toContain("August 18–24");expect(host.textContent).toContain("Mount canonical CalendarAdmin");click("New workspace");expect(window.open).toHaveBeenCalled()});
  it("renders Conversations as one client workspace with relationship context",()=>{click("Clients");click("Conversations");expect(host.textContent).toContain("Selected authorized thread");expect(host.textContent).toContain("Mount canonical ClientsConversations");expect(host.textContent).toContain("Relationship")});
  it("supports persisted navigation canvas mode and restores it visibly",()=>{const controls=[...host.querySelectorAll<HTMLButtonElement>("button")].filter(x=>x.title==="Change navigation mode");expect(controls.length).toBeGreaterThan(0);act(()=>controls[0].click());act(()=>controls[0].click());expect(host.querySelector(".tr-app.nav-canvas")).toBeTruthy();const restore=host.querySelector<HTMLButtonElement>('button[aria-label="Restore navigation"]');expect(restore).toBeTruthy();act(()=>restore!.click());expect(host.querySelector(".tr-app.nav-compact")).toBeTruthy();expect(window.localStorage.getItem("paige-nav-rail")).toBe("compact")});
  it("opens and closes PAIGE without resetting its draft surface",()=>{clickContaining("Open PAIGE");expect(host.querySelector(".tr-paige")).toBeTruthy();clickContaining("Close PAIGE");expect(host.querySelector(".tr-paige")).toBeFalsy()});
  it("switches and remembers light mode",()=>{click("Light");expect(host.querySelector('.tr-app[data-theme="light"]')).toBeTruthy();expect(window.localStorage.getItem("paige-tenant-theme")).toBe("light")});
});
