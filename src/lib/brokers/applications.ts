// src/lib/brokers/applications.ts
// Submission helper for the Broker Workspace application flow.
// Auto-approval is performed server-side by the broker-auto-approve edge function.

import { supabase } from "@/integrations/supabase/client";

export type BrokerType =
  | "credit_coach"
  | "mortgage_broker"
  | "financial_advisor"
  | "real_estate_agent"
  | "insurance_agent"
  | "other";

export interface NewBrokerApplication {
  firstName: string;
  lastName: string;
  email: string;
  businessName: string;
  brokerType: BrokerType;
  licenseNumber?: string;
  website?: string;
  currentClientCount: string; // "1-10" | "11-25" | ...
  useCase: string;
  brokerReferralCode?: string;
  agreedToTerms: boolean;
}

export interface BrokerApprovalResult {
  brokerId: string;
  referralCode: string | null;
  brokerClientDiscountCode: string | null;
  signupClientLink: string | null;
  status?: string;
  autoApproved?: boolean;
  alreadyExisted?: boolean;
  emailSent: boolean;
}

export async function submitBrokerApplication(
  input: NewBrokerApplication,
): Promise<BrokerApprovalResult> {
  if (!input.agreedToTerms) {
    throw new Error("You must agree to the broker program terms to continue.");
  }

  const { data, error } = await supabase.functions.invoke("broker-auto-approve", {
    body: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(),
      businessName: input.businessName.trim(),
      brokerType: input.brokerType,
      licenseNumber: input.licenseNumber?.trim() || null,
      website: input.website?.trim() || null,
      currentClientCount: input.currentClientCount,
      useCase: input.useCase.trim(),
      brokerReferralCode: input.brokerReferralCode?.trim().toUpperCase() || null,
    },
  });

  if (error) throw error;
  if (!data?.brokerId) throw new Error("Broker application failed — no broker ID returned.");

  return data as BrokerApprovalResult;
}
