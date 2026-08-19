import { ArrowLeft, HardDrive } from "lucide-react";
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
      <section className="marketplace-local-models">
        <header className="marketplace-local-models-header">
          <button type="button" onClick={onCloseLocalModels}>
            <ArrowLeft size={14} aria-hidden="true" />
            Back to Marketplace
          </button>
        </header>
        <LocalModelsScreen />
      </section>
    );
  }
  return (
    <main className="marketplace-region">
      <section className="marketplace-notice">
        <p>WORK IN PROGRESS</p>
        <h1>Marketplace</h1>
        <button className="marketplace-local-models-action" type="button" onClick={onOpenLocalModels}>
          <HardDrive size={16} aria-hidden="true" />
          Local Models
        </button>
      </section>
    </main>
  );
}
