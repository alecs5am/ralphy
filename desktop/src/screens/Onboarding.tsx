import { bridge, type AuthState, type AuthMethod } from "../lib/ipc";

/**
 * First-run auth picker. Two honest paths:
 *  - Subscription: reuse the user's local `claude` login. Draws from the plan's
 *    included Agent SDK credit (Pro $20 / Max 5x $100 / Max 20x $200 per month).
 *    No API key, no pay-per-token. This is NOT the 5h/weekly interactive bucket —
 *    Anthropic routes all programmatic driving to the separate SDK credit by design.
 *  - API key: pay-per-token via the Anthropic console, for machines without a
 *    subscription login.
 */
export function Onboarding({ auth, onPicked }: { auth: AuthState; onPicked: () => void }) {
  const pick = async (method: AuthMethod) => {
    await bridge.setAuthMethod(method);
    onPicked();
  };

  return (
    <div className="onboarding">
      <div className="inner">
        <span className="eyebrow"><i className="dot" /> RALPHY DESKTOP</span>
        <h1 className="display">
          Chat your way to a <span className="acc">video.</span>
        </h1>
        <p className="lede">
          A Claude Code agent runs your Ralphy project — scenario, prompts, assets, render —
          and you watch it happen. First, how should it bill?
        </p>

        {auth.apiKeyInEnv && (
          <p className="lede" style={{ color: "var(--warn)" }}>
            Heads up: ANTHROPIC_API_KEY is set in your environment. It silently overrides
            your subscription and bills pay-per-token. Unset it to use your plan.
          </p>
        )}

        <div className="auth-grid">
          <button
            className="auth-card recommended"
            onClick={() => pick("subscription")}
            disabled={!auth.claudeBinaryReady}
          >
            <span className="tag">Recommended</span>
            <h3>My Claude subscription</h3>
            <p>
              Reuses the same <code style={{ display: "inline", padding: "1px 5px" }}>claude</code> login
              you already use in the terminal. Covered by your plan's monthly Agent SDK
              credit — no API key, no surprise charges.
            </p>
            {auth.claudeBinaryReady ? (
              <code>claude — detected, logged in</code>
            ) : (
              <code>run `claude setup-token` first</code>
            )}
          </button>

          <button className="auth-card" onClick={() => pick("api-key")}>
            <span className="tag" style={{ color: "var(--mute)" }}>Pay per token</span>
            <h3>Anthropic API key</h3>
            <p>
              For machines without a Claude subscription login. Billed per token against
              your Anthropic console account.
            </p>
            <code>ANTHROPIC_API_KEY=sk-ant-…</code>
          </button>
        </div>
      </div>
    </div>
  );
}
