import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { JsonLd } from "@/components/JsonLd";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_REPO,
  SITE_URL,
} from "@/lib/site";
import { StickyBar } from "@/components/StickyBar";
import { Hero } from "@/components/Hero";
import { CaseStudies } from "@/components/sections/CaseStudies";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Showcase } from "@/components/sections/Showcase";
import { Templates } from "@/components/sections/Templates";
import { Pipeline } from "@/components/sections/Pipeline";
import { Roadmap } from "@/components/sections/Roadmap";
import { StackSection } from "@/components/sections/Stack";
import { Community } from "@/components/sections/Community";
import { StarCta } from "@/components/sections/StarCta";
import { getDisplayStars } from "@/lib/data";

export const metadata: Metadata = {
  // /ralphy is the home page (/ redirects here). Point its canonical at the
  // root so search engines consolidate rank on the apex rather than splitting
  // it between "/" and "/ralphy".
  alternates: { canonical: "/" },
  openGraph: { url: SITE_URL },
};

export default async function Page() {
  const stars = await getDisplayStars();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: SITE_NAME,
          applicationCategory: "MultimediaApplication",
          operatingSystem: "macOS, Linux, Windows",
          description: SITE_DESCRIPTION,
          url: SITE_URL,
          downloadUrl: SITE_REPO,
          softwareHelp: "https://ralphy.mintlify.app/",
          isAccessibleForFree: true,
          license: "https://opensource.org/licenses/MIT",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
        }}
      />
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} />
      <main>
        <Hero />
        <Showcase />
        <CaseStudies />
        <HowItWorks />
        <Templates />
        <Pipeline />
        <Roadmap />
        <StackSection />
        <Community />
        <StarCta stars={stars} />
      </main>
      <Footer />
      <StickyBar stars={stars} />
    </>
  );
}
