import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { StickyBar } from "@/components/StickyBar";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Showcase } from "@/components/sections/Showcase";
import { Templates } from "@/components/sections/Templates";
import { Pipeline } from "@/components/sections/Pipeline";
import { Roadmap } from "@/components/sections/Roadmap";
import { StackSection } from "@/components/sections/Stack";
import { Community } from "@/components/sections/Community";
import { StarCta } from "@/components/sections/StarCta";
import { getDisplayStars } from "@/lib/data";

export default async function Page() {
  const stars = await getDisplayStars();
  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} />
      <main>
        <Hero />
        <Showcase />
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
