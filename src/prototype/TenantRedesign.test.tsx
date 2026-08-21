import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TenantRedesign from "./TenantRedesign";

const destinations=["Home","Clients","Work","Studio","Insights","Settings"];
let host:HTMLDivElement;let root:Root;
const click=(label:string)=>{const button=[...host.querySelectorAll("button")].find(node=>node.textContent?.trim()===label);expect(button,`button ${label}`).toBeTruthy();act(()=>button!.click())};

beforeEach(()=>{Object.defineProperty(window,"matchMedia",{configurable:true,value:vi.fn().mockImplementation((query:string)=>({matches:query.includes("prefers-color-scheme")?false:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn()}))});host=document.createElement("div");document.body.append(host);root=createRoot(host);act(()=>root.render(<MemoryRouter initialEntries={["/tenant-redesign"]}><TenantRedesign/></MemoryRouter>))});
afterEach(()=>{act(()=>root.unmount());host.remove();window.localStorage.clear()});

describe("tenant redesign shell",()=>{
  it("renders every primary destination without losing the shell",()=>{for(const destination of destinations){click(destination);expect(host.querySelector("#tenant-primary-nav")).toBeTruthy();expect(host.textContent).toContain(destination)}expect(host.textContent).toContain("Settings")});
  it("renders Studio with a safe route and Creation Chamber",()=>{click("Studio");expect(host.textContent).toContain("Creation Chamber");expect(host.textContent).toContain("Open connected version")});
  it("switches and remembers light mode",()=>{click("Light");expect(host.querySelector('.tr-app[data-theme="light"]')).toBeTruthy();expect(window.localStorage.getItem("paige-tenant-theme")).toBe("light")});
});
