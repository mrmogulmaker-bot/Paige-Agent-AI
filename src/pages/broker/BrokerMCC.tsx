import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

// Sprint C.3 — MCC ecosystem exit (Doctrine §199).
// MCC operations moved to the external ecosystem. This surface is deprecated;
// the underlying `mcc_service_requests` table has been dropped, and the
// `mcc-submit-request` edge function now returns HTTP 410 Gone.
//
// The route is preserved as a deprecation notice so any bookmarked links land
// on an explanation instead of a runtime error.

export default function BrokerMCC() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            MCC service requests are no longer handled here
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Per Doctrine §199 (ecosystem boundaries), Mogul Credit Company
            (MCC) service requests have moved out of the Paige platform. The
            in-app intake, storage, and submission pipeline have been retired.
          </p>
          <p>
            Please route new MCC service requests through the external MCC
            ecosystem. Historical records were internal-only and are no longer
            available in this surface.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
