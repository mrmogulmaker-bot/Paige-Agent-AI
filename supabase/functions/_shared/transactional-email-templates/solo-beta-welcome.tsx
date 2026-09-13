import * as React from "npm:react@18.3.1";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Text,
} from "npm:@react-email/components@0.0.22";
import type { TemplateEntry } from "./registry.ts";
import { EmailFooter } from "./email-footer.tsx";

const LOGO_URL =
  "https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png";

interface SoloBetaWelcomeProps {
  name?: string;
  destination: string;
  referenceId: string;
  subscriptionStatus: "trialing" | "active";
  trialEndsAt?: string | null;
}

const billingStatusCopy = (
  subscriptionStatus: "trialing" | "active",
  trialEndsAt?: string | null,
) => {
  if (subscriptionStatus === "active") {
    return "Your subscription is active at $74.50 per month.";
  }
  const formattedEnd = trialEndsAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(trialEndsAt))
    : null;
  return (
    "Your 30-day trial is active" +
    (formattedEnd ? " through " + formattedEnd : "") +
    ". After the trial, the subscription renews at $74.50 per month unless you cancel before your first paid renewal."
  );
};

const SoloBetaWelcome = ({
  name,
  destination,
  referenceId,
  subscriptionStatus,
  trialEndsAt,
}: SoloBetaWelcomeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verified Paige Solo workspace is ready</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src={LOGO_URL}
          alt="Paige Agent AI"
          width="180"
          height="auto"
          style={logo}
        />
        <Text style={eyebrow}>PAIGE SOLO BETA</Text>
        <Hr style={hr} />
        <Heading as="h1" style={heading}>
          {name
            ? name + ", your Solo workspace is ready."
            : "Your Solo workspace is ready."}
        </Heading>
        <Text style={text}>
          Paige verified your subscription and finished provisioning your
          private Solo workspace.{" "}
          {billingStatusCopy(subscriptionStatus, trialEndsAt)}
        </Text>
        <Text style={text}>
          Start in Command Center, where Paige will guide you through the
          focused setup that is currently available for Solo Beta.
        </Text>
        <Button style={button} href={destination}>
          Open Solo Command Center
        </Button>
        <Text style={support}>
          Need help? Reply to this email and include reference{" "}
          <strong>{referenceId}</strong>.
        </Text>
        <Hr style={hr} />
        <Text style={finePrint}>
          This transactional message confirms verified workspace provisioning.
          It does not claim that a payment was charged during the trial.
        </Text>
        <EmailFooter />
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: SoloBetaWelcome,
  subject: "Your Paige Solo workspace is ready",
  displayName: "Solo Beta verified provisioning welcome",
  category: "transactional",
  previewData: {
    name: "Antonio",
    destination: "https://paigeagent.ai/solo/100001/command-center",
    referenceId: "00000000-0000-0000-0000-000000000000",
    subscriptionStatus: "trialing",
    trialEndsAt: "2026-10-13T00:00:00.000Z",
  },
} satisfies TemplateEntry;

const main = {
  backgroundColor: "#f6f4fb",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};
const container = {
  backgroundColor: "#ffffff",
  padding: "40px 32px",
  maxWidth: "600px",
  margin: "24px auto",
  borderRadius: "12px",
};
const logo = { display: "block" as const, margin: "0 auto 10px" };
const eyebrow = {
  color: "#8a6500",
  fontSize: "12px",
  fontWeight: "700" as const,
  letterSpacing: "1.4px",
  textAlign: "center" as const,
};
const heading = {
  color: "#151034",
  fontSize: "28px",
  lineHeight: "1.25",
  margin: "24px 0 16px",
};
const text = {
  color: "#393354",
  fontSize: "16px",
  lineHeight: "1.65",
  margin: "0 0 16px",
};
const button = {
  backgroundColor: "#efc45d",
  color: "#151034",
  padding: "14px 24px",
  borderRadius: "8px",
  fontSize: "16px",
  fontWeight: "700" as const,
  textDecoration: "none",
  display: "block" as const,
  textAlign: "center" as const,
  margin: "26px auto",
};
const support = {
  color: "#554e70",
  fontSize: "14px",
  lineHeight: "1.55",
  margin: "0 0 20px",
};
const finePrint = {
  color: "#77708e",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "0",
};
const hr = { borderColor: "#ded9eb", margin: "24px 0" };
