// Compliance utilities for Paige AI
// PaigeAI_Compliance_v1_MMA

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ConsentEventData {
  userId: string;
  consentType: 'credit_report_access' | 'croa_rights' | 'data_sharing' | 'offer_display' | 'adverse_action';
  disclosureVersion: string;
  ipAddress?: string;
  sessionId?: string;
  userAgent?: string;
  granted: boolean;
  metadata?: Record<string, any>;
}

export interface ComplianceCheckpoint {
  userId: string;
  checkpointType: string;
  apiEndpoint?: string;
  consentEventId?: string;
  status: 'pending' | 'approved' | 'denied' | 'error';
  validationResult?: Record<string, any>;
  errorMessage?: string;
}

export interface FinancialAPILog {
  userId: string;
  sessionId?: string;
  apiProvider: 'experian' | 'lendflow' | 'plaid' | 'pinwheel' | 'other';
  apiEndpoint: string;
  requestType: string;
  consentEventId?: string;
  lendersDisplayed?: any[];
  responseStatus?: number;
  metadata?: Record<string, any>;
}

/**
 * Log consent event with full audit trail
 * Required before any financial API call
 */
export async function logConsentEvent(
  supabase: SupabaseClient,
  data: ConsentEventData
): Promise<{ success: boolean; consentId?: string; error?: string }> {
  try {
    const { data: consent, error } = await supabase
      .from('consent_events')
      .insert({
        user_id: data.userId,
        consent_type: data.consentType,
        disclosure_version: data.disclosureVersion,
        ip_address: data.ipAddress,
        session_id: data.sessionId,
        user_agent: data.userAgent,
        granted: data.granted,
        metadata: data.metadata || {}
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error logging consent:', error);
      return { success: false, error: error.message };
    }

    return { success: true, consentId: consent.id };
  } catch (error) {
    console.error('Exception logging consent:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Create compliance checkpoint before API call
 * Must verify consent exists and is valid
 */
export async function createComplianceCheckpoint(
  supabase: SupabaseClient,
  checkpoint: ComplianceCheckpoint
): Promise<{ success: boolean; checkpointId?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('compliance_checkpoints')
      .insert({
        user_id: checkpoint.userId,
        checkpoint_type: checkpoint.checkpointType,
        api_endpoint: checkpoint.apiEndpoint,
        consent_event_id: checkpoint.consentEventId,
        status: checkpoint.status,
        validation_result: checkpoint.validationResult || {},
        error_message: checkpoint.errorMessage
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating checkpoint:', error);
      return { success: false, error: error.message };
    }

    return { success: true, checkpointId: data.id };
  } catch (error) {
    console.error('Exception creating checkpoint:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Log financial API call with consent tracking
 * Required for FCRA, ECOA, and audit compliance
 */
export async function logFinancialAPICall(
  supabase: SupabaseClient,
  log: FinancialAPILog
): Promise<{ success: boolean; logId?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('financial_api_logs')
      .insert({
        user_id: log.userId,
        session_id: log.sessionId,
        api_provider: log.apiProvider,
        api_endpoint: log.apiEndpoint,
        request_type: log.requestType,
        consent_event_id: log.consentEventId,
        lenders_displayed: log.lendersDisplayed || [],
        response_status: log.responseStatus,
        metadata: log.metadata || {}
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error logging API call:', error);
      return { success: false, error: error.message };
    }

    return { success: true, logId: data.id };
  } catch (error) {
    console.error('Exception logging API call:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Verify user has granted required consent
 * Returns most recent consent event
 */
export async function verifyConsent(
  supabase: SupabaseClient,
  userId: string,
  consentType: string,
  sessionId?: string
): Promise<{ hasConsent: boolean; consentId?: string; error?: string }> {
  try {
    let query = supabase
      .from('consent_events')
      .select('id, granted, created_at')
      .eq('user_id', userId)
      .eq('consent_type', consentType)
      .eq('granted', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('Error verifying consent:', error);
      return { hasConsent: false, error: error.message };
    }

    if (!data) {
      return { hasConsent: false };
    }

    return { hasConsent: true, consentId: data.id };
  } catch (error) {
    console.error('Exception verifying consent:', error);
    return { hasConsent: false, error: String(error) };
  }
}

/**
 * Get active disclosure template
 */
export async function getDisclosure(
  supabase: SupabaseClient,
  disclosureType: string
): Promise<{ disclosure?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('disclosure_templates')
      .select('*')
      .eq('disclosure_type', disclosureType)
      .eq('is_active', true)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching disclosure:', error);
      return { error: error.message };
    }

    return { disclosure: data };
  } catch (error) {
    console.error('Exception fetching disclosure:', error);
    return { error: String(error) };
  }
}

/**
 * Append educational disclaimer to response
 * Required by compliance framework
 */
export function appendEducationalDisclaimer(content: string): string {
  const disclaimer = "\n\n---\n**Educational Purposes Only**: This information is provided for educational purposes only and should not be considered financial, legal, or credit repair advice. Consult with qualified professionals before making financial decisions.";
  return content + disclaimer;
}

/**
 * Validate API call is compliant
 * Checks consent, data protection, and regulatory requirements
 */
export async function validateAPICall(
  supabase: SupabaseClient,
  userId: string,
  apiProvider: string,
  requiredConsents: string[],
  sessionId?: string
): Promise<{ isValid: boolean; errors: string[]; consentIds: string[] }> {
  const errors: string[] = [];
  const consentIds: string[] = [];

  // Verify all required consents
  for (const consentType of requiredConsents) {
    const { hasConsent, consentId, error } = await verifyConsent(
      supabase,
      userId,
      consentType,
      sessionId
    );

    if (!hasConsent) {
      errors.push(`Missing required consent: ${consentType}`);
    } else if (consentId) {
      consentIds.push(consentId);
    }

    if (error) {
      errors.push(`Consent verification error: ${error}`);
    }
  }

  // Create checkpoint
  await createComplianceCheckpoint(supabase, {
    userId,
    checkpointType: `${apiProvider}_api_call`,
    apiEndpoint: apiProvider,
    status: errors.length === 0 ? 'approved' : 'denied',
    validationResult: {
      requiredConsents,
      consentIds,
      timestamp: new Date().toISOString()
    },
    errorMessage: errors.length > 0 ? errors.join('; ') : undefined
  });

  return {
    isValid: errors.length === 0,
    errors,
    consentIds
  };
}

/**
 * Process data deletion request (GLBA/CCPA compliance)
 */
export async function requestDataDeletion(
  supabase: SupabaseClient,
  userId: string
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  try {
    // Generate verification code
    const verificationCode = crypto.randomUUID().substring(0, 8).toUpperCase();

    const { data, error } = await supabase
      .from('data_deletion_requests')
      .insert({
        user_id: userId,
        status: 'pending',
        verification_code: verificationCode,
        metadata: {
          requested_via: 'paige_ai_chat',
          timestamp: new Date().toISOString()
        }
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating deletion request:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      requestId: data.id
    };
  } catch (error) {
    console.error('Exception creating deletion request:', error);
    return { success: false, error: String(error) };
  }
}
