import { Link } from "react-router-dom";

const footerLinks = {
  product: [
    { name: "How It Works", href: "#how-paige-works" },
    { name: "What Paige Knows", href: "#what-paige-knows" },
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
    { name: "Privacy", href: "/privacy" },
    { name: "Terms", href: "/terms" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-1">
            <h3 className="text-xl font-extrabold text-gold">PaigeAgent.ai</h3>
            <p className="text-sm font-semibold opacity-90 mt-2">
              Your Personal Funding Advisor
            </p>
            <p className="text-xs opacity-70 leading-relaxed mt-3">
              Built by Project Mogul Enterprise Inc.
              <br />
              Atlanta, Georgia
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
          <p className="text-[11px] text-primary-foreground/60 leading-relaxed max-w-4xl">
            PaigeAgent AI provides financial education and credit intelligence
            tools. It is not a licensed financial advisor, credit repair
            organization, or lender. Credit score projections are estimates
            based on general FICO scoring factors. Actual results may vary.
            Rate information is sourced from public Federal Reserve data and
            is subject to change.
          </p>
          <p className="text-sm text-center opacity-60">
            © {new Date().getFullYear()} PaigeAgent.ai — Project Mogul
            Enterprise Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
