/**
 * Path-shaped HTML snapshots were replaced by Composition revisions.
 * The command adapter prints the migration hint and delegates to
 * `reviseCompositionCheckout`; this guard prevents old library callers from
 * recreating `compositions/vN.html` behind the domain store.
 */
export async function saveCompositionVersion(_projectDir: string): Promise<never> {
  throw new Error("Deprecated: use composition revise");
}
