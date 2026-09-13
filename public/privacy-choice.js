// This page has no analytics. The saved choice is read before the game loads.
(() => {
  const button = document.getElementById("analytics-toggle");
  const status = document.getElementById("analytics-status");
  const play = document.getElementById("return-to-game");
  if (!button || !status || !play) return;
  let off = false;
  function render() {
    button.textContent = off ? "Turn analytics on" : "Turn analytics off";
    button.setAttribute("aria-pressed", String(!off));
    play.setAttribute("href", off ? "/?analytics=off" : "/");
  }
  try {
    off = localStorage.getItem("cartRaveAnalytics") === "off";
    status.textContent = off ? "Analytics is off in this browser." : "Analytics is on by default in this browser.";
  } catch {
    status.textContent = "Browser storage is blocked. You can still return to the game with analytics off for that visit.";
  }
  render();
  button.disabled = false;
  button.addEventListener("click", () => {
    off = !off;
    try {
      localStorage.setItem("cartRaveAnalytics", off ? "off" : "on");
      status.textContent = `Saved. Analytics will be ${off ? "off" : "on"} when you return to the game.`;
    } catch {
      off = true;
      status.textContent = "Your browser could not save this choice. Use the return link below to play with analytics off for this visit.";
    }
    render();
  });
})();
