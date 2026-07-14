import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/cookies")({
  component: CookiesPage,
  head: () => ({
    meta: [
      { title: "Cookie Policy · CA Aspire BD" },
      {
        name: "description",
        content:
          "How CA Aspire BD uses cookies and similar technologies, and how you can manage them.",
      },
    ],
  }),
});

function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="June 5, 2026"
      intro="This page explains how CA Aspire BD uses cookies and similar tracking technologies on our website and learning app."
      sections={[
        {
          heading: "What Are Cookies",
          body: (
            <p>
              Cookies are small text files stored on your device by your browser. They help websites
              remember information about your visit, like your sign-in state and preferences.
            </p>
          ),
        },
        {
          heading: "Types of Cookies We Use",
          body: (
            <>
              <p>
                <strong>Essential cookies</strong> keep you signed in and the platform working. They
                cannot be disabled.
              </p>
              <p>
                <strong>Preference cookies</strong> remember settings like theme (light/dark) and
                language.
              </p>
              <p>
                <strong>Analytics cookies</strong> help us understand which features are used so we
                can improve them. Data is aggregated.
              </p>
            </>
          ),
        },
        {
          heading: "Third-Party Cookies",
          body: (
            <p>
              Some features may set cookies from trusted third parties (for example, authentication
              providers). These are governed by their own privacy policies.
            </p>
          ),
        },
        {
          heading: "Managing Cookies",
          body: (
            <p>
              You can clear or block cookies through your browser settings. Note that disabling
              essential cookies will prevent you from signing in or using key features.
            </p>
          ),
        },
        {
          heading: "Updates",
          body: (
            <p>
              If we materially change our use of cookies, we'll update this page and, where
              required, ask for your renewed consent.
            </p>
          ),
        },
      ]}
    />
  );
}
