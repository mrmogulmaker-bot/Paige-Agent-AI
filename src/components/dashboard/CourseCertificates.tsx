import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award, Download, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Certificate {
  id: string;
  course_id: string;
  issued_at: string;
  verification_code: string;
  certificate_url: string | null;
  courses: {
    title: string;
    framework: string;
  };
}

export const CourseCertificates = () => {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('course_certificates')
        .select(`
          *,
          courses (
            title,
            framework
          )
        `)
        .eq('user_id', user.id)
        .order('issued_at', { ascending: false });

      if (error) throw error;
      setCertificates(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading certificates",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const shareCertificate = (verificationCode: string) => {
    const url = `${window.location.origin}/verify-certificate/${verificationCode}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "Certificate verification link copied to clipboard",
    });
  };

  if (loading) {
    return <div>Loading certificates...</div>;
  }

  if (certificates.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <Award className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No certificates yet. Complete a course to earn your first certificate!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {certificates.map((cert) => (
        <Card key={cert.id} className="border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                {cert.courses.title}
              </CardTitle>
              <Badge>{cert.courses.framework}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Issued: {format(new Date(cert.issued_at), 'PPP')}
              </div>
              <div className="text-xs font-mono bg-muted p-2 rounded">
                Verification: {cert.verification_code}
              </div>
              <div className="flex gap-2">
                {cert.certificate_url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={cert.certificate_url} download>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => shareCertificate(cert.verification_code)}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
