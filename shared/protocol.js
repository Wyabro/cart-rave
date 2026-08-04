/**
 * Shared MSG protocol constants for Cart Clash.
 * Single source of truth for message types used by both client (src/) and server (party/).
 *
 * Keep in sync when adding new message types — update here only.
 */

export const MSG = {
  // Client -> server (WebSocket control plane)
  join: "join",
  hostRound: "host_round",
  keepalive: "keepalive",
  colorPick: "color_pick",
  cartLook: "cart_look",
  readyToggle: "ready_toggle",
  playAgain: "play_again",
  /** Client → server: carts + play-shader warm done (COUNTDOWN-ARM-1). */
  clientPlayReady: "client_play_ready",
  /** Current host → server: hidden continuously long enough to hand off authority. */
  hostAway: "host_away",

  // Host <-> client (WebRTC DataChannel gameplay plane)
  // hostTransform: 40Hz binary host snapshot (transforms + collision/fall tails).
  // clientInput: non-host input sent to the host at physics rate.
  // spill: one-shot host->client grocery-spill VFX event.
  // directive: one-shot host->client Living Store directive start (id + window).
  // spillBonus: presentation-only Spill Bonus award (feed/float); score rides host_round.
  hostTransform: "host_transform",
  clientInput: "client_input",
  spill: "spill",
  directive: "directive",
  spillBonus: "spill_bonus",

  // Host -> server -> all (WebSocket control plane — reliable, ordered)
  // hostSpawn: one-shot spawn/rematch poses. Complements unreliable WebRTC snapshots so
  // a single lost DataChannel packet cannot leave clients at old positions all countdown.
  hostSpawn: "host_spawn",

  // Server -> client (WebSocket control plane)
  hello: "hello",
  hostMigrated: "host_migrated",
  slots: "slots",
  round: "round",
  joinRejected: "join_rejected",
  gameStart: "game_start",
  countdownCancel: "countdown_cancel",

  // WebRTC Signaling (Client <-> Server)
  requestTurnCredentials: "request_turn_credentials",
  turnCredentials: "turn_credentials",
  sdpOffer: "sdp_offer",
  sdpAnswer: "sdp_answer",
  iceCandidate: "ice_candidate",
};
