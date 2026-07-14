import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { CAPremiumSections } from "@/components/landing/CAPremiumSections";

// Below-the-fold sections lazy-loaded to shrink landing page LCP / TBT.
const WhyChooseUs = lazy(() =>
  import("@/components/landing/LandingSections").then((m) => ({ default: m.WhyChooseUs })),
);
const LiveStats = lazy(() =>
  import("@/components/landing/LandingSections").then((m) => ({ default: m.LiveStats })),
);
const Testimonials = lazy(() =>
  import("@/components/landing/LandingSections").then((m) => ({ default: m.Testimonials })),
);
const TopRankers = lazy(() =>
  import("@/components/landing/LandingSections").then((m) => ({ default: m.TopRankers })),
);
const AppPromo = lazy(() =>
  import("@/components/landing/LandingSections").then((m) => ({ default: m.AppPromo })),
);
const FAQ = lazy(() =>
  import("@/components/landing/LandingSections").then((m) => ({ default: m.FAQ })),
);
const FinalCta = lazy(() =>
  import("@/components/landing/LandingSections").then((m) => ({ default: m.FinalCta })),
);
const Footer = lazy(() =>
  import("@/components/landing/LandingSections").then((m) => ({ default: m.Footer })),
);
const BackToTop = lazy(() =>
  import("@/components/landing/LandingSections").then((m) => ({ default: m.BackToTop })),
);
const WhatsAppPopup = lazy(() =>
  import("@/components/landing/WhatsAppPopup").then((m) => ({ default: m.WhatsAppPopup })),
);

const TITLE = "CA Aspire BD — Bangladesh's premium CA exam prep platform";
const DESC =
  "Adaptive MCQ practice, mock tests, video classes, flash cards and an AI-personalised study path for Bangladeshi Chartered Accountancy aspirants.";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "CA Aspire BD",
          url: "/",
          description: DESC,
        }),
      },
    ],
  }),
});

function SectionFallback() {
  return <div className="min-h-[200px]" aria-hidden />;
}

function Index() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <Navbar />
      <Hero />
      <CAPremiumSections />
      <Features />
      <Suspense fallback={<SectionFallback />}>
        <WhyChooseUs />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <LiveStats />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <Testimonials />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <TopRankers />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <AppPromo />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <FAQ />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <FinalCta />
      </Suspense>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
      <Suspense fallback={null}>
        <BackToTop />
      </Suspense>
      <Suspense fallback={null}>
        <WhatsAppPopup />
      </Suspense>
    </main>
  );
}
