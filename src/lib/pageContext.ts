/**
 * Maps the current app route to a human-readable page name used to
 * give Paige page-aware context.
 */
export function getCurrentPageName(pathname: string): string {
  // Normalize trailing slashes
  const path = pathname.replace(/\/+$/, "") || "/";

  // /app exactly → Dashboard
  if (path === "/app") return "Dashboard";

  // /app/<section>...
  if (path.startsWith("/app/")) {
    const section = path.split("/")[2] || "";
    switch (section) {
      case "credit":
      case "personal":
      case "credit-intelligence":
        return "Credit Intelligence";
      case "disputes":
        return "Disputes";
      case "business":
      case "business-credit":
      case "build-steps":
        return "Business Profile";
      case "funding":
      case "funding-marketplace":
        return "Funding Intelligence";
      case "learn":
      case "learning-vault":
        return "Learning Vault";
      case "paige-ai":
        return "Paige AI Chat";
      case "personal-bank-accounts":
      case "bank-accounts":
        return "Bank Accounts";
      case "payments":
      case "affiliate":
        return "Payments and Billing";
      case "settings":
        return "Settings";
      case "dashboard":
        return "Dashboard";
      default:
        return "Dashboard";
    }
  }

  return "Dashboard";
}

/**
 * Generate the contextual opening prompt Paige uses to greet a client
 * based on the current page they are viewing.
 */
export function getPageOpeningInstruction(pageName: string, firstName?: string): string {
  const name = firstName || "there";
  const base = `The client just opened the chat panel while viewing the "${pageName}" page. Generate a short, page-specific opening greeting (1-3 sentences) that uses the client's actual data from CLIENT CONTEXT — bureau scores, next best action, dispute counts, BUILD score, funding matches, etc. Address the client by their first name (${name}) if known.`;

  switch (pageName) {
    case "Dashboard":
      return `${base} Acknowledge their full credit picture: name their strongest bureau and score, then surface their top priority/next best action. End with: "What would you like to work on?"`;
    case "Credit Intelligence":
      return `${base} Acknowledge they are reviewing their credit intelligence. Name their leading bureau and score. Offer to walk through what is driving their scores or explain any factor they are looking at.`;
    case "Disputes":
      return `${base} Reference how many disputes are ready on their file. Recommend which bureau to start with based on which lender categories pull that bureau and their funding goal. Offer to walk them through prioritization.`;
    case "Business Profile":
      return `${base} Frame this as working on the business credit foundation. Reference their BUILD score and the next BUILD action. Ask where they want to focus.`;
    case "Funding Intelligence":
      return `${base} Lead with their strongest funding path based on actual scores. Name the bureau, score, and the funding products that threshold unlocks. Ask if they want to talk strategy.`;
    case "Learning Vault":
      return `${base} Recommend a specific course/lesson based on their credit profile gaps (e.g., utilization management if utilization is high, credit-mix course if no installment loan). Connect it directly to a gap in their file.`;
    case "Bank Accounts":
      return `${base} Acknowledge they are reviewing their connected bank accounts. Reference cashflow signals or funding readiness if available, and ask what they want to dig into.`;
    case "Payments and Billing":
      return `${base} Acknowledge they are in Payments and Billing. Keep it warm and offer to help with subscription, billing, or affiliate questions.`;
    case "Settings":
      return `${base} Acknowledge they are in Settings. Offer to help with profile, notifications, or account preferences.`;
    case "Paige AI Chat":
    default:
      return `${base} Give a warm, personalized greeting that acknowledges their situation from the context and ends with: "What would you like to work on?"`;
  }
}
