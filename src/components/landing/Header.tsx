import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import paigeLogo from "@/assets/paige-logo-transparent.png";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { NotificationBell } from "@/components/dashboard/NotificationBell";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={paigeLogo} alt="Paige Agent AI" className="h-10 w-auto" />
            <span className="text-xl font-extrabold text-accent">PaigeAgent.ai</span>
          </Link>

          <div className="hidden md:flex md:items-center md:space-x-8">
            {navLinks.map((l) => (
              <a key={l.label} href={l.href} className="text-sm font-medium text-foreground hover:text-accent transition-colors">
                {l.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex md:items-center md:space-x-4">
            {user ? (
              <>
                <NotificationBell />
                <Button onClick={() => navigate("/app")}>Go to Dashboard</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate("/auth?mode=login")}>Sign In</Button>
                <Button
                  className="bg-gradient-gold text-primary hover:shadow-glow-lg hover:scale-105 transition-all duration-300 font-bold"
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
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <div className="px-3 pt-4 space-y-2">
              {user ? (
                <Button className="w-full" onClick={() => navigate("/app")}>
                  Go to Dashboard
                </Button>
              ) : (
                <>
                  <Button variant="outline" className="w-full" onClick={() => navigate("/auth")}>
                    Sign In
                  </Button>
                  <Button
                    className="w-full bg-gradient-gold text-primary hover:shadow-glow-lg font-bold"
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
