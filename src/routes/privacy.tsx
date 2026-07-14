import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy · CA Aspire BD" },
      {
        name: "description",
        content: "How CA Aspire BD collects, uses, and protects your personal information.",
      },
    ],
  }),
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="June 5, 2026"
      intro="This Privacy Policy explains what information CA Aspire BD collects, how we use it, and the choices you have. By using our platform you agree to the practices described below."
      sections={[
        {
          heading: "Information We Collect",
          body: (
            <>
              <p>
                We collect information you give us directly — such as your name, email, profile
                details, and study activity — when you create an account or use the platform.
              </p>
              <p>
                We also collect technical information automatically, including device type, browser,
                IP address, and usage logs, to keep the service secure and reliable.
              </p>
            </>
          ),
        },
        {
          heading: "How We Use Your Information",
          body: (
            <>
              <p>
                We use your information to provide and improve the learning experience, personalize
                study recommendations, communicate important updates, and prevent fraud or abuse.
              </p>
              <p>We do not sell your personal data to third parties.</p>
            </>
          ),
        },
        {
          heading: "Cookies & Analytics",
          body: (
            <p>
              We use cookies and similar technologies to keep you signed in, remember preferences,
              and measure how the product is used. You can control cookies through your browser
              settings.
            </p>
          ),
        },
        {
          heading: "Data Security",
          body: (
            <p>
              Your data is encrypted in transit using TLS and stored on infrastructure with
              industry-standard access controls. Only authorized personnel can access production
              systems.
            </p>
          ),
        },
        {
          heading: "Your Rights",
          body: (
            <p>
              You can access, update, export, or delete your account data at any time from your
              profile settings, or by emailing legal@caaspirebd.xyz.
            </p>
          ),
        },
        {
          heading: "Changes to This Policy",
          body: (
            <p>
              We may update this policy from time to time. Material changes will be announced in-app
              or by email before they take effect.
            </p>
          ),
        },
      ]}
    />
  );
}
