import { useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DocumentSummary {
  fileName: string;
  summary: string;
}

/**
 * Hook that manages within-session document context and cross-session memory.
 * - Stores document analysis summaries for follow-up questions
 * - Triggers session summary generation on session end
 */
export function usePaigeMemory() {
  const sessionDocuments = useRef<DocumentSummary[]>([]);
  const sessionStartTime = useRef<number>(Date.now());
  const lastActivityTime = useRef<number>(Date.now());
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract a compressed summary from Paige's analysis response
  const extractDocumentSummary = useCallback((analysisText: string, fileName: string) => {
    // Try to extract <document_summary> block if present
    const summaryMatch = analysisText.match(/<document_summary>([\s\S]*?)<\/document_summary>/);
    
    let summary: string;
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    } else {
      // Build a compressed summary from the analysis text (max ~500 tokens ≈ ~2000 chars)
      const lines = analysisText.split('\n').filter(l => l.trim());
      const importantLines: string[] = [];
      let charCount = 0;
      
      for (const line of lines) {
        // Prioritize lines with scores, numbers, account names
        if (
          /score|fico|equifax|experian|transunion|\d{3,}/i.test(line) ||
          /negative|collection|late|charge.off|inquiry|discrepanc/i.test(line) ||
          /positive|good standing|current|utilization/i.test(line) ||
          /action|priority|dispute/i.test(line)
        ) {
          if (charCount + line.length < 2000) {
            importantLines.push(line.replace(/\*\*/g, '').trim());
            charCount += line.length;
          }
        }
      }
      
      summary = importantLines.join('\n') || analysisText.substring(0, 2000);
    }

    const docSummary: DocumentSummary = { fileName, summary };
    sessionDocuments.current = [...sessionDocuments.current, docSummary];
    return docSummary;
  }, []);

  // Get current session document context for inclusion in API calls
  const getSessionDocumentContext = useCallback(() => {
    return sessionDocuments.current.length > 0 ? sessionDocuments.current : undefined;
  }, []);

  // Reset activity timer
  const trackActivity = useCallback(() => {
    lastActivityTime.current = Date.now();
  }, []);

  // Generate session summary and store in client_memory
  const generateSessionSummary = useCallback(async (
    messages: Array<{ role: string; content: string }>,
    sessionId?: string
  ) => {
    if (messages.length < 3) return; // Not enough conversation to summarize

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "summarize" }],
            generateSessionSummary: true,
            sessionMessages: messages.slice(-20).map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
            sessionId,
          }),
        }
      );
    } catch (err) {
      console.error("Session summary generation failed:", err);
    }
  }, []);

  // Clear session data
  const resetSession = useCallback(() => {
    sessionDocuments.current = [];
    sessionStartTime.current = Date.now();
    lastActivityTime.current = Date.now();
  }, []);

  return {
    extractDocumentSummary,
    getSessionDocumentContext,
    trackActivity,
    generateSessionSummary,
    resetSession,
  };
}
