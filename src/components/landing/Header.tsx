import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import paigeLogo from "@/assets/paige-logo-mark.png";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { resolveLandingRoute } from "@/lib/auth/resolveLandingRoute";

export function Header({ autoHide = false }: { autoHide?: boolean }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [routing, setRouting] = useState(false);
  // When autoHide is on, the bar lifts out of view over the hero and slides
  // down when the cursor nears the top; once scrolled into the content it
  // stays put. Starts revealed unless auto-hiding.
  const [revealed, setRevealed] = useState(!autoHide);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  // Hover-reveal behavior for the landing hero.
  useEffect(() => {
    if (!autoHide) return;
    // Touch / no-hover devices can't reveal by cursor — keep the bar visible.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      setRevealed(true);
      return;
    }
    let mouseY = 999;
    const update = () => {
      const scrolledIntoContent = window.scrollY > Math.min(window.innerHeight * 0.7, 620);
      setRevealed(scrolledIntoContent || mouseY < 90);
    };
    const onMove = (e: MouseEvent) => {
      mouseY = e.clientY;
      update();
    };
    const onScroll = () => update();
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, [autoHide]);

  // Never trap keyboard users behind a hidden bar, and keep it down while the
  // mobile menu is open.
  const shown = revealed || mobileMenuOpen;

  const goToDashboard = async () => {
    if (!user || routing) return;
    setRouting(true);
    // Don't let a slow/erroring RPC strand the user on the landing page.
    // Race the resolver against a 4s timeout and fall back to /app, which
    // itself re-resolves the correct destination via AppShell.
    const route = await Promise.race<string>([
      resolveLandingRoute(user.id).catch((e) => {
        console.error("[Header] resolveLandingRoute failed:", e);
        return "/app";
      }),
      new Promise<string>((resolve) => setTimeout(() => resolve("/app"), 4000)),
    ]);
    setRouting(false);
    navigate(route);
  };


  const navLinks = [
    { label: "How It Works", href: "#how-paige-works" },
    { label: "What Paige Knows", href: "#what-paige-knows" },
    { label: "Pricing", href: "#pricing" },
    { label: "Brokers", href: "/broker" },
    { label: "Partners", href: "/affiliates" },
  ];

  return (
    <header
      onFocusCapture={autoHide ? () => setRevealed(true) : undefined}
      className={`sticky top-0 z-50 w-full border-b border-white/10 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50 transition-transform duration-300 ease-out ${
        shown ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <Link to="/" className="flex items-center">
            <img
              src={paigeLogo}
              alt="Paige Agent AI"
              className="h-12 md:h-14 w-auto"
            />
          </Link>

          <div className="hidden md:flex md:items-center md:space-x-8">
            {navLinks.map((l) =>
              l.href.startsWith("/") ? (
                <Link key={l.label} to={l.href} className="text-sm font-medium text-foreground hover:text-accent transition-colors">
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} href={l.href} className="text-sm font-medium text-foreground hover:text-accent transition-colors">
                  {l.label}
                </a>
              )
            )}
          </div>

          <div className="hidden md:flex md:items-center md:space-x-4">
            {user ? (
              <>
                <NotificationBell />
                <Button onClick={goToDashboard} disabled={routing}>Go to Dashboard</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate("/auth?mode=login")}>Sign In</Button>
                <Button
                  className="bg-gradient-gold text-accent-foreground hover:shadow-glow-lg hover:scale-105 transition-all duration-300 font-bold border-0"
                  onClick={() => navigate("/auth?mode=signup")}
                >
                  Get Started Free
                </Button>
              </>
            )}
          </div>

          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-foreground hover:bg-muted"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border py-4 space-y-4">
            {navLinks.map((l) =>
              l.href.startsWith("/") ? (
                <Link
                  key={l.label}
                  to={l.href}
                  className="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {l.label}
                </Link>
              ) : (
                <a
                  key={l.label}
                  href={l.href}
                  className="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {l.label}
                </a>
              )
            )}
            <div className="px-3 pt-4 space-y-2">
              {user ? (
                <Button className="w-full" onClick={goToDashboard} disabled={routing}>
                  Go to Dashboard
                </Button>
              ) : (
                <>
                  <Button variant="outline" className="w-full" onClick={() => navigate("/auth?mode=login")}>
                    Sign In
                  </Button>
                  <Button
                    className="w-full bg-gradient-gold text-accent-foreground hover:shadow-glow-lg font-bold border-0"
                    onClick={() => navigate("/auth?mode=signup")}
                  >
                    Get Started Free
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
