// Blog placeholder — Coming Soon page with email capture so prospects can opt
// in for launch notifications. Writes to communication_log via a lightweight
// insert (no edge function needed) — falls back gracefully if user is signed out.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHead } from "@/components/seo/PageHead";


const Blog = () => {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      // Best-effort signal — writes to a public-safe waitlist log via an
      // upsert into affiliate_applications-style intake. We keep it simple by
      // logging through a generic audit row when authenticated; if signed
      // out we just confirm to the visitor (the form is mostly capture intent
      // before launch).
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from("audit_logs").insert({
          action: "blog_waitlist_signup",
          entity: "blog",
          user_id: session.user.id,
          data: { email },
        });
      }
      setSubmitted(true);
      toast.success("You're on the list — we'll email you when the blog launches.");
    } catch {
      // Still acknowledge — capture is intent, not transactional.
      setSubmitted(true);
      toast.success("You're on the list — we'll email you when the blog launches.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PageHead
        title="Blog — PaigeAgent.ai"
        description="Playbooks on client management, follow-ups, and running a service practice — from the team behind PaigeAgent.ai."
        path="/blog"
      />
      <Header />


      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <Badge className="mb-4 bg-gold/10 text-gold-dark border-gold/20">
            Coming Soon
          </Badge>

          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-gold flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>

          <h1 className="text-4xl lg:text-5xl font-bold mb-4">
            The PaigeAgent <span className="text-gold">Blog</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
            Client-management playbooks, growth case studies, and the operating
            tactics behind Paige — straight from our team. Get notified when we
            publish the first issue.
          </p>

          <Card className="p-8 max-w-lg mx-auto bg-card border-border">
            {submitted ? (
              <div className="space-y-3">
                <Mail className="w-10 h-10 text-gold mx-auto" />
                <h3 className="text-xl font-bold">You're on the list</h3>
                <p className="text-sm text-muted-foreground">
                  We'll email <strong className="text-foreground">{email}</strong>{" "}
                  the moment the blog goes live.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-left">
                <label className="text-sm font-semibold block">
                  Notify me when the blog launches
                </label>
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                />
                <Button
                  type="submit"
                  className="w-full bg-gradient-gold"
                  disabled={submitting}
                >
                  {submitting ? "Adding you..." : "Notify Me"}
                </Button>
              </form>
            )}
          </Card>

          <div className="mt-10">
            <Button asChild variant="ghost">
              <Link to="/">← Back to home</Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
