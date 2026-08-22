const FRAME_CHECK_INTERVAL_MS = 175;
const FRAME_CHECK_LIMIT = 5;
const SAMPLE_WIDTH = 16;
const SAMPLE_HEIGHT = 10;

/**
 * Downsample the full image before hashing it. Five 16x10 readbacks are enough to
 * distinguish the authored 83-100ms HOW TO PLAY frames without keeping a full-size
 * canvas or running a permanent animation observer.
 * @param {HTMLImageElement} img
 * @returns {() => string}
 */
function createFrameSampler(img) {
  const canvas = img.ownerDocument.createElement("canvas");
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2d canvas unavailable");

  return () => {
    context.clearRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    context.drawImage(img, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const pixels = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
    let hash = 2166136261;
    for (let i = 0; i < pixels.length; i += 1) {
      hash ^= pixels[i];
      hash = Math.imul(hash, 16777619);
    }
    return String(hash >>> 0);
  };
}

/**
 * Mount one HOW TO PLAY image while its slide is visible, then stop observing as
 * soon as the animated WebP proves that its rendered frame advances. The caller
 * owns slide visibility and must call the returned cleanup before hiding the slide.
 *
 * @param {{
 *   slot: HTMLElement,
 *   token: string,
 *   motionUrl: string | null,
 *   stillUrl: string | null,
 *   reducedMotion: boolean,
 *   onVerdict?: (verdict: {
 *     token: string,
 *     status: "playing" | "fallback",
 *     reason: string,
 *     samples: number,
 *     elapsedMs: number,
 *   }) => void,
 *   sampleFrame?: (img: HTMLImageElement) => string,
 *   isVisible?: () => boolean,
 *   schedule?: typeof setTimeout,
 *   cancelSchedule?: typeof clearTimeout,
 *   now?: () => number,
 * }} options
 * @returns {() => void}
 */
export function startHowToArtPlayback({
  slot,
  token,
  motionUrl,
  stillUrl,
  reducedMotion,
  onVerdict = () => {},
  sampleFrame,
  isVisible = () => true,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  now = () => performance.now(),
}) {
  slot.dataset.art = "1";
  for (const child of Array.from(slot.children)) {
    if (child instanceof HTMLImageElement) child.remove();
  }

  const img = slot.ownerDocument.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  slot.append(img);

  let stopped = false;
  let settled = false;
  let timerId = null;
  let samples = 0;
  let firstHash = null;
  let displayed = img;
  const startedAt = now();

  const finish = (status, reason) => {
    if (stopped || settled) return;
    settled = true;
    if (timerId != null) {
      cancelSchedule(timerId);
      timerId = null;
    }
    onVerdict({
      token,
      status,
      reason,
      samples,
      elapsedMs: Math.max(0, Math.round(now() - startedAt)),
    });
  };

  const useStill = (reason) => {
    if (!stillUrl) {
      if (reason === "motion-load-error") {
        img.remove();
        delete slot.dataset.art;
      }
      finish("fallback", `${reason}-no-still`);
      return;
    }
    img.removeEventListener("load", onLoad);
    img.removeEventListener("error", onError);
    img.addEventListener("error", () => {
      img.remove();
      delete slot.dataset.art;
    }, { once: true });
    img.src = stillUrl;
    finish("fallback", reason);
  };

  if (reducedMotion) {
    img.src = stillUrl ?? motionUrl ?? "";
    finish("fallback", stillUrl ? "reduced-motion" : "reduced-motion-no-still");
    return () => {
      stopped = true;
      displayed.remove();
    };
  }

  if (!motionUrl) {
    img.src = stillUrl ?? "";
    finish("fallback", "still-only");
    return () => {
      stopped = true;
      displayed.remove();
    };
  }

  let readFrame;
  const checkFrame = () => {
    if (stopped || settled) return;
    if (!isVisible()) {
      timerId = schedule(checkFrame, FRAME_CHECK_INTERVAL_MS);
      return;
    }
    try {
      readFrame ??= sampleFrame
        ? () => sampleFrame(img)
        : createFrameSampler(img);
      const hash = readFrame();
      samples += 1;
      if (firstHash == null) {
        firstHash = hash;
      } else if (hash !== firstHash) {
        // Chromium stops looping an infinite WebP after drawImage sampling
        // (ONBOARD-WEBP-PT-1 FAIL 08-21: one 2.8s play, then a static last
        // frame). Swap in a never-sampled copy so the file can loop.
        const fresh = img.ownerDocument.createElement("img");
        fresh.alt = "";
        fresh.decoding = "async";
        fresh.draggable = false;
        const freshUrl = new URL(motionUrl, img.ownerDocument.baseURI);
        freshUrl.searchParams.set("onboardLoop", String(Date.now()));
        fresh.src = freshUrl.href;
        displayed.replaceWith(fresh);
        displayed = fresh;
        finish("playing", "frame-change");
        return;
      }
    } catch {
      useStill("sample-error");
      return;
    }

    if (samples >= FRAME_CHECK_LIMIT) {
      useStill("no-frame-change");
      return;
    }
    timerId = schedule(checkFrame, FRAME_CHECK_INTERVAL_MS);
  };

  const onLoad = () => checkFrame();
  const onError = () => useStill("motion-load-error");
  img.addEventListener("load", onLoad, { once: true });
  img.addEventListener("error", onError, { once: true });
  img.src = motionUrl;

  return () => {
    stopped = true;
    if (timerId != null) cancelSchedule(timerId);
    img.removeEventListener("load", onLoad);
    img.removeEventListener("error", onError);
    displayed.remove();
  };
}
