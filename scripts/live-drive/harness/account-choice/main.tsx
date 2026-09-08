import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import ChooseAccount from "@/pages/ChooseAccount";
import "@/index.css";

const theme = new URLSearchParams(window.location.search).get("theme") === "dark" ? "dark" : "light";
document.documentElement.classList.toggle("dark", theme === "dark");
document.documentElement.setAttribute("data-pg", theme === "dark" ? "obsidian" : "mineral");

createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><ChooseAccount /></BrowserRouter></StrictMode>,
);
