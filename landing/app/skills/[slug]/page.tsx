// landing/app/skills/[slug]/page.tsx
//
// Full-page skill detail (direct navigation / refresh). When navigated to from
// the /skills grid, the intercepted modal route at app/skills/@modal/(.)[slug]
// renders the same body in an overlay instead. Shared markup lives in
// <SkillDetailView />.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getDisplayStars } from "@/lib/data";
import { loadSkill, listSkillSlugs } from "@/lib/skills-loader";
import { SkillDetailView } from "@/components/SkillDetailView";
import { siteUrl } from "@/lib/site";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return listSkillSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const s = loadSkill(slug);
  if (!s) return { title: "Skills · Ralphy" };
  const description = s.blurb || `Ralphy skill · ${s.category}.`;
  const url = siteUrl(`skills/${slug}`);
  return {
    title: { absolute: `${s.name} · Ralphy skill` },
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${s.name} · Ralphy skill`,
      description,
      url,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${s.name} · Ralphy skill`,
      description,
    },
  };
}

export default async function SkillPage({ params }: PageProps) {
  const { slug } = await params;
  const s = loadSkill(slug);
  if (!s) notFound();

  const stars = await getDisplayStars();

  return (
    <>
      <div className="dot-bg" aria-hidden />
      <Nav stars={stars} variant="subpage" />

      <main>
        <section className="pt-10 pb-6">
          <div className="container">
            <p className="eyebrow">
              <Link href="/skills" className="text-mute no-underline transition-colors hover:text-vio">Skills</Link>
              {" · "}{s.category}
            </p>
            <SkillDetailView skill={s} />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
