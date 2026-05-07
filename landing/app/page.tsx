import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Capabilities } from "@/components/Capabilities";
import { InstallCommand } from "@/components/InstallCommand";
import { Pipeline } from "@/components/Pipeline";
import { Gallery } from "@/components/Gallery";
import { Stack } from "@/components/Stack";
import { Community } from "@/components/Community";
import { StarCta } from "@/components/StarCta";
import { Footer } from "@/components/Footer";
import { StickyInstallBar } from "@/components/StickyInstallBar";

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Capabilities />
        <InstallCommand />
        <Pipeline />
        <Gallery />
        <Stack />
        <Community />
        <StarCta />
      </main>
      <Footer />
      <StickyInstallBar />
    </>
  );
}
