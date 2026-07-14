import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/security")({
  component: SecurityPage,
  head: () => ({
    meta: [
      { title: "Security · CA Aspire BD" },
      {
        name: "description",
        content: "How CA Aspire BD protects your data, accounts, and platform integrity.",
      },
    ],
  }),
});

function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      updated="June 5, 2026"
      intro="Security is core to how we build CA Aspire BD. This page summarizes the practices we use to protect your account, data, and learning progress."
      sections={[
        {
          heading: "Data Protection",
          body: (
            <p>
              All traffic between your device and our servers is encrypted using TLS 1.2+. Stored
              data is protected with encryption at rest on managed cloud infrastructure.
            </p>
          ),
        },
        {
          heading: "Account Security",
          body: (
            <>
              <p>
                Passwords are hashed with industry-standard algorithms and never stored in plain
                text.
              </p>
              <p>
                We recommend using a strong, unique password and enabling any additional sign-in
                protections offered in your account settings.
              </p>
            </>
          ),
        },
        {
          heading: "Access Controls",
          body: (
            <p>
              Production access is restricted to a small number of authorized engineers, audited,
              and protected by multi-factor authentication.
            </p>
          ),
        },
        {
          heading: "Backups & Reliability",
          body: (
            <p>
              Databases are continuously backed up and we monitor uptime around the clock so your
              study sessions are always available.
            </p>
          ),
        },
        {
          heading: "Responsible Disclosure",
          body: (
            <p>
              If you believe you've found a security vulnerability, please email{" "}
              <a className="underline hover:text-foreground" href="mailto:security@caaspirebd.xyz">
                security@caaspirebd.xyz
              </a>
              . We'll acknowledge your report and work with you to resolve it quickly.
            </p>
          ),
        },
      ]}
    />
  );
}
