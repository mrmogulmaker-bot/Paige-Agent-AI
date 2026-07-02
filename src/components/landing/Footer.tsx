import { Link } from "react-router-dom";
import { SecurityBadge } from "@/components/security/SecurityBadge";

const footerLinks = {
  product: [
    { name: "How It Works", href: "#how-paige-works" },
    { name: "What Paige Knows", href: "#what-paige-knows" },
    { name: "For Business Owners", href: "/for-owners" },
    { name: "Pricing", href: "#pricing" },
    { name: "Dashboard", href: "/app" },
  ],
  company: [
    { name: "About", href: "/about" },
    { name: "Blog", href: "/blog" },
    { name: "Contact", href: "mailto:support@paigeagent.ai" },
    { name: "Affiliates", href: "/affiliates" },
    { name: "Broker Program", href: "/broker" },
  ],
  legal: [
    { name: "Terms of Service", href: "/terms" },
    { name: "Privacy Policy", href: "/privacy" },
    { name: "E-Sign Consent", href: "/legal/esign" },
    { name: "AI Disclaimer", href: "/legal/ai-disclaimer" },
  ],
};

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-1">
            <h3 className="text-xl font-extrabold text-gold">PaigeAgent.ai</h3>
            <p className="text-sm font-semibold opacity-90 mt-2">
              A personal AI advisor for business owners.
            </p>
            <p className="text-xs opacity-70 leading-relaxed mt-3">
              Operated by <strong>PaigeAgent AI LLC</strong>
              <br />
              Wyoming, USA
            </p>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-semibold mb-4 capitalize text-gold">
                {category}
              </h4>
              <ul className="space-y-2">
                {links.map((link) => {
                  const isInternal = link.href.startsWith("/") && !link.href.startsWith("//");
                  const className = "text-sm opacity-80 hover:opacity-100 hover:text-gold transition-colors";
                  return (
                    <li key={link.name}>
                      {isInternal ? (
                        <Link to={link.href} className={className}>
                          {link.name}
                        </Link>
                      ) : (
                        <a href={link.href} className={className}>
                          {link.name}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-primary-foreground/10 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <SecurityBadge />
            <span className="text-[11px] text-primary-foreground/60">
              AES-256 encryption · SOC 2 infrastructure · TLS 1.3 transport
            </span>
          </div>
          <p className="text-[11px] text-primary-foreground/60 leading-relaxed max-w-4xl">
            Paige provides financial education, credit monitoring, and business funding
            intelligence. It is not a licensed financial advisor, credit repair organization, or
            lender. Credit score projections are estimates based on general FICO scoring factors;
            actual results may vary. Rate information is sourced from public Federal Reserve data
            and is subject to change.
          </p>
          <p className="text-[11px] text-primary-foreground/50 leading-relaxed max-w-4xl">
            PaigeAgent AI LLC is a Wyoming limited liability company operating under license from
            Aedis Brands LLC, a wholly-owned subsidiary of Givalli Heritage Holdings Inc.
            (Delaware).
          </p>
          <p className="text-sm text-center opacity-60">
            © {year} PaigeAgent AI LLC. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
