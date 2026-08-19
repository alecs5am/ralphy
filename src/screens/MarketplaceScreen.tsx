import { HardDrive } from "lucide-react";
import { LocalModelsScreen } from "./LocalModelsScreen";

export function MarketplaceScreen({
  localModelsOpen,
  onOpenLocalModels,
  onCloseLocalModels,
}: {
  localModelsOpen: boolean;
  onOpenLocalModels(): void;
  onCloseLocalModels(): void;
}) {
  if (localModelsOpen) {
    return (
      <>
        <button type="button" onClick={onCloseLocalModels}>Back to Marketplace</button>
        <LocalModelsScreen />
      </>
    );
  }
  return (
    <main className="marketplace-region">
      <p>WORK IN PROGRESS</p>
      <h1>Marketplace</h1>
      <button type="button" onClick={onOpenLocalModels}>
        <HardDrive size={16} aria-hidden="true" />
        Local Models
      </button>
    </main>
  );
}
