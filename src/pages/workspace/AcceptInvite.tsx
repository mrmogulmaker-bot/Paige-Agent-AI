import { Helmet } from "react-helmet-async";
import "./workspace-theme.css";

/**
 * BTF Workspace · Accept Invite landing.
 * Day 3 build: signed-token flow + password set + auto sign-in.
 * Placeholder shell for now so the route is reserved.
 */
export default function WorkspaceAcceptInvite() {
  return (
    <div className="workspace-theme min-h-screen flex items-center justify-center px-6">
      <Helmet>
        <title>Activate Your Workspace · Mogul Maker Academy</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="workspace-card p-8 max-w-md w-full text-center">
        <div className="workspace-gold text-3xl font-bold mb-2" style={{ fontFamily: '"Bookman Old Style", Georgia, serif' }}>
          MMA
        </div>
        <h1 className="text-2xl mb-2">Welcome</h1>
        <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
          Your Build to Fund workspace activation is being prepared. Check your
          email for a fresh link in the next 24 hours.
        </p>
      </div>
    </div>
  );
}
