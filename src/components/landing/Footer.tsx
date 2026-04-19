import { Link } from "react-router-dom";

const footerLinks = {
  product: [
    { name: "Features", href: "#features" },
    { name: "Frameworks", href: "#frameworks" },
    { name: "Pricing", href: "#pricing" },
    { name: "Dashboard", href: "/app" },
  ],
  company: [
    { name: "About", href: "#" },
    { name: "Blog", href: "#" },
    { name: "Contact", href: "#" },
    { name: "Become an Affiliate", href: "/affiliates" },
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
            <h3 className="text-xl font-extrabold text-accent">PaigeAgent.ai</h3>
            <p className="text-sm opacity-80 leading-relaxed mt-2">
              The AI funding coach that shows you what lenders see — and teaches
              what school never did. Built by Mr. Mogul Maker.
            </p>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-semibold mb-4 capitalize">{category}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.name}>
                    {link.href.startsWith("/") ? (
                      <Link
                        to={link.href}
                        className="text-sm opacity-80 hover:opacity-100 transition-opacity"
                      >
                        {link.name}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-sm opacity-80 hover:opacity-100 transition-opacity"
                      >
                        {link.name}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-primary-foreground/10">
          <p className="text-sm text-center opacity-60">
            © {new Date().getFullYear()} PaigeAgent.ai — Project Mogul Enterprise Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
