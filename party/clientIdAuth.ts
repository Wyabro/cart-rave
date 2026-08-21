/**
 * CLIENT-ID-AUTH-1: proof-of-ownership for MSG.join clientId claims.
 *
 * `clientId` is client-supplied and (pre-fix) never verified, so any join naming a
 * victim's clientId triggered ghost exorcism — closing the victim's live socket,
 * converting their human slot to NPC, and in the sole-human case promoting the
 * *joiner* to host ahead of oldest-connection order. Griefing vector only
 * (clientId is not broadcast), but free to exploit.
 *
 * Fix: the first join claiming a clientId mints a random session token and returns
 * it via MSG.sessionToken. Later joins claiming that clientId must present the
 * token; mismatch or absence means "unverified" — no exorcism, no binding. The
 * registry is per-room DO memory (ephemeral like all room state) and bounded.
 */

/** Upper bound on tracked clientIds per room; evicts oldest-inserted on overflow. */
export const MAX_TRACKED_CLIENT_IDS = 128;

export type ClientIdClaimVerdict =
  /** First-ever claim of this clientId: bind it and hand this token back to the client. */
  | { action: "mint"; token: string }
  /** Token matches the stored one: full owner rights (exorcism allowed). */
  | { action: "verified" }
  /** Wrong or missing token: treat as an unrelated identity — no exorcism, no binding. */
  | { action: "unverified" };

export class ClientIdTokenRegistry {
  readonly #tokens = new Map<string, string>();

  /**
   * Judge a join's clientId claim. `mint` supplies the secret (injected so tests
   * are deterministic); production passes crypto.randomUUID.
   */
  claim(clientId: string, presentedToken: unknown, mint: () => string): ClientIdClaimVerdict {
    const stored = this.#tokens.get(clientId);
    if (stored === undefined) {
      const token = mint();
      if (this.#tokens.size >= MAX_TRACKED_CLIENT_IDS) {
        const oldest = this.#tokens.keys().next();
        if (!oldest.done) this.#tokens.delete(oldest.value);
      }
      this.#tokens.set(clientId, token);
      return { action: "mint", token };
    }
    if (typeof presentedToken === "string" && presentedToken === stored) {
      return { action: "verified" };
    }
    return { action: "unverified" };
  }

  /** Test/observability hook: whether a clientId has ever been claimed here. */
  has(clientId: string): boolean {
    return this.#tokens.has(clientId);
  }

  get size(): number {
    return this.#tokens.size;
  }
}
