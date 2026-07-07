import { ShieldCheck, Lock, Server, UserCog } from "lucide-react";

const CARDS = [
  {
    icon: ShieldCheck,
    title: "Never Sold",
    body: "Your data and your clients' data is never sold to advertisers or third parties. Ever.",
  },
  {
    icon: Lock,
    title: "Bank-Grade Encryption",
    body: "AES-256 encryption protects your data and your clients' data at rest and in transit.",
  },
  {
    icon: Server,
    title: "SOC 2 Infrastructure",
    body: "Built on Supabase and Anthropic — both SOC 2 Type II certified platforms.",
  },
  {
    icon: UserCog,
    title: "You Control Your Data",
    body: "Download, correct, or permanently delete your data at any time from your account settings.",
  },
];

export function TrustSecuritySection() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30 border-y border-border/40">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-4">
            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-medium text-accent tracking-wide uppercase">
              Trust &amp; Security
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
            Built on Trust. Engineered for Coaches.
          </h2>
          <p className="text-base text-muted-foreground mt-3 max-w-2xl mx-auto">
            Serious entrepreneurs deserve infrastructure that protects what
            they're building. PaigeAgent was architected for security from
            the foundation up.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CARDS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-border/60 bg-card p-6 hover:border-accent/40 hover:shadow-md transition-all"
            >
              <div className="w-11 h-11 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-accent" />
              </div>
              <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
          {["256-bit Encrypted", "SOC 2 Infrastructure", "Privacy by Design"].map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-border text-xs font-medium text-foreground/80"
            >
              <ShieldCheck className="w-3 h-3 text-accent" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
