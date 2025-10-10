import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <h1 className="text-xl font-bold bg-gradient-hero bg-clip-text text-transparent">
              Mogul Maker Academy
            </h1>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:space-x-8">
            <a href="#features" className="text-sm font-medium text-foreground hover:text-accent transition-colors">
              Features
            </a>
            <a href="#frameworks" className="text-sm font-medium text-foreground hover:text-accent transition-colors">
              Frameworks
            </a>
            <a href="#pricing" className="text-sm font-medium text-foreground hover:text-accent transition-colors">
              Pricing
            </a>
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex md:items-center md:space-x-4">
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>
              Sign In
            </Button>
            <Button 
              className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
              onClick={() => navigate("/dashboard")}
            >
              Get Started
            </Button>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-foreground hover:bg-muted"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border py-4 space-y-4">
            <a
              href="#features"
              className="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="#frameworks"
              className="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md"
              onClick={() => setMobileMenuOpen(false)}
            >
              Frameworks
            </a>
            <a
              href="#pricing"
              className="block px-3 py-2 text-base font-medium text-foreground hover:bg-muted rounded-md"
              onClick={() => setMobileMenuOpen(false)}
            >
              Pricing
            </a>
            <div className="px-3 pt-4 space-y-2">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => navigate("/dashboard")}
              >
                Sign In
              </Button>
              <Button 
                className="w-full bg-gradient-primary text-primary-foreground"
                onClick={() => navigate("/dashboard")}
              >
                Get Started
              </Button>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
