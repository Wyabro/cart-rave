import { spawn } from "child_process";
import WebSocket from "ws";

const port = 9335;
const chrome = spawn(
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${process.env.TEMP}\\crboot2-${Date.now()}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
await new Promise((r) => setTimeout(r, 1500));
const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    const t = setTimeout(() => reject(new Error("timeout " + method)), 20000);
    pending.set(i, {
      resolve: (v) => {
        clearTimeout(t);
        resolve(v);
      },
    });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
ws.on("message", (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.id && pending.has(msg.id)) pending.get(msg.id).resolve(msg);
  if (msg.method === "Runtime.exceptionThrown") {
    console.log(
      "EX",
      msg.params.exceptionDetails?.exception?.description ||
        msg.params.exceptionDetails?.text,
    );
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    console.log(
      "ERR",
      (msg.params.args || []).map((a) => a.value || a.description).join(" "),
    );
  }
});
await new Promise((r, j) => {
  ws.on("open", r);
  ws.on("error", j);
});
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", {
  url: "http://127.0.0.1:5173/?nocache=" + Date.now(),
});
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const v = (
    await send("Runtime.evaluate", {
      expression:
        "({ready:!!window.__cartRaveMainReady,boot:!!window.__cartRaveBootstrapped,errVis:!!document.querySelector('#cr-boot-error.cr-boot-error--visible')})",
      returnByValue: true,
    })
  ).result.result.value;
  console.log("poll", i, v);
  if (v.ready || v.errVis) break;
}
chrome.kill();
