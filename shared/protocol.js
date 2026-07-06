/**
 * Shared MSG protocol constants for Cart Rave.
 * Single source of truth for message types used by both client (src/) and server (party/).
 *
 * Keep in sync when adding new message types — update here only.
 */

export const MSG = {
  // Client -> server
  join: "join",
  hostTransform: "host_transform",
  clientInput: "client_input",
  hostEventCollision: "host_event_collision",
  hostEventFall: "host_event_fall",
  hostRound: "host_round",
  keepalive: "keepalive",
  colorPick: "color_pick",
  cartLook: "cart_look",
  readyToggle: "ready_toggle",
  playAgain: "play_again",

  // Server -> client
  hello: "hello",
  hostAssigned: "host_assigned",
  hostMigrated: "host_migrated",
  slots: "slots",
  state: "state",
  round: "round",
  joinRejected: "join_rejected",
  gameStart: "game_start",
  countdownCancel: "countdown_cancel",
  spill: "spill",

  // WebRTC Signaling (Client <-> Server)
  requestTurnCredentials: "request_turn_credentials",
  turnCredentials: "turn_credentials",
  sdpOffer: "sdp_offer",
  sdpAnswer: "sdp_answer",
  iceCandidate: "ice_candidate",
};
