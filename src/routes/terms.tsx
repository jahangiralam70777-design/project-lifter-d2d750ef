import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service · CA Aspire BD" },
      {
        name: "description",
        content: "The terms that govern your use of the CA Aspire BD learning platform.",
      },
    ],
  }),
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="June 5, 2026"
      intro="These Terms govern your access to and use of CA Aspire BD. By creating an account or using the service, you agree to these Terms."
      sections={[
        {
          heading: "Your Account",
          body: (
            <p>
              You are responsible for the activity that happens under your account. Keep your
              credentials confidential and notify us right away if you suspect unauthorized access.
            </p>
          ),
        },
        {
          heading: "Acceptable Use",
          body: (
            <>
              <p>
                Don't misuse the service. In particular, don't attempt to disrupt the platform,
                reverse-engineer it, scrape content at scale, or use it to violate any law.
              </p>
              <p>
                Don't share copyrighted content, attempt to cheat in assessments, or impersonate
                another person.
              </p>
            </>
          ),
        },
        {
          heading: "Content & Intellectual Property",
          body: (
            <p>
              All study materials, questions, and platform content remain the property of CA Aspire
              BD or its licensors. You receive a limited, non-transferable license to use them for
              personal study.
            </p>
          ),
        },
        {
          heading: "Subscriptions & Payments",
          body: (
            <p>
              Paid plans renew automatically unless cancelled. You can cancel at any time from your
              account settings; access continues until the end of the paid period.
            </p>
          ),
        },
        {
          heading: "Termination",
          body: (
            <p>
              We may suspend or terminate accounts that violate these Terms. You can delete your
              account at any time from your profile settings.
            </p>
          ),
        },
        {
          heading: "Disclaimer & Liability",
          body: (
            <p>
              The service is provided "as is" without warranties of any kind. To the maximum extent
              permitted by law, CA Aspire BD is not liable for indirect or consequential damages.
            </p>
          ),
        },
      ]}
    />
  );
}
