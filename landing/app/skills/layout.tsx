// Parallel-route layout for /skills. The `modal` slot renders the intercepted
// skill detail as an overlay when navigating from the grid; it is null on the
// grid itself (app/skills/@modal/default.tsx).
export default function SkillsLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
