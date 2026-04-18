import type * as Party from "partykit/server";

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log("connected to party");
    console.log(
      `party client id=${conn.id} room=${this.room.id} path=${new URL(ctx.request.url).pathname}`,
    );
  }
}

Server satisfies Party.Worker;
