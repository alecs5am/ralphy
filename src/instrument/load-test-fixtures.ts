/// <reference types="vite/client" />

export async function loadInstrumentTestFixtures() {
  if (import.meta.env.VITE_RALPHY_ENABLE_MOCKS === "true") {
    return (await import("./test-fixtures")).instrumentTestFixtureProvider;
  }
  return null;
}
