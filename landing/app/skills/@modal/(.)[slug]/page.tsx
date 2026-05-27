// Intercepted route: renders the skill detail as a modal overlay when the user
// navigates from the /skills grid. Direct loads / refreshes fall through to the
// full page at app/skills/[slug]/page.tsx. Shared body in <SkillDetailView />.

import { notFound } from "next/navigation";
import { loadSkill } from "@/lib/skills-loader";
import { SkillDetailView } from "@/components/SkillDetailView";
import { SkillModal } from "@/components/SkillModal";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function SkillModalPage({ params }: PageProps) {
  const { slug } = await params;
  const s = loadSkill(slug);
  if (!s) notFound();

  return (
    <SkillModal>
      <SkillDetailView skill={s} variant="modal" />
    </SkillModal>
  );
}
