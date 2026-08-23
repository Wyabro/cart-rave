const MOTION_TYPE = "image/webp";
const MIN_FRAME_MS = 16;
const HIDDEN_POLL_MS = 200;

/**
 * Mount one HOW TO PLAY image while its slide is visible. Chromium's <img>
 * WebP decoder can play an infinite file once and then freeze, including
 * after a same-bytes remount, so motion is painted on a canvas from
 * ImageDecoder whenever that API can decode the file. Cleanup must run
 * before the slide hides.
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
 *   isVisible?: () => boolean,
 *   schedule?: typeof setTimeout,
 *   cancelSchedule?: typeof clearTimeout,
 *   now?: () => number,
 *   ImageDecoder?: typeof globalThis.ImageDecoder,
 *   fetchBuffer?: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>,
 *   paintFrame?: (canvas: HTMLCanvasElement, image: CanvasImageSource) => void,
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
  isVisible = () => true,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  now = () => performance.now(),
  ImageDecoder: ImageDecoderCtor = globalThis.ImageDecoder,
  fetchBuffer = (url, signal) => fetch(url, { signal }).then((res) => {
    if (!res.ok) throw new Error(`motion-http-${res.status}`);
    return res.arrayBuffer();
  }),
  paintFrame = (canvas, image) => {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2d canvas unavailable");
    context.drawImage(image, 0, 0);
  },
}) {
  slot.dataset.art = "1";
  clearMedia(slot);

  let stopped = false;
  let settled = false;
  let timerId = null;
  let displayed = null;
  let decoder = null;
  const abort = new AbortController();
  const startedAt = now();

  const finish = (status, reason, samples = 0) => {
    if (stopped || settled) return;
    settled = true;
    onVerdict({
      token,
      status,
      reason,
      samples,
      elapsedMs: Math.max(0, Math.round(now() - startedAt)),
    });
  };

  const stopTimer = () => {
    if (timerId == null) return;
    cancelSchedule(timerId);
    timerId = null;
  };

  const mountImg = (src = "") => {
    const img = slot.ownerDocument.createElement("img");
    img.alt = "";
    img.draggable = false;
    displayed?.remove();
    displayed = img;
    slot.append(img);
    if (src) img.src = src;
    return img;
  };

  const useStill = (reason) => {
    if (stopped) return;
    if (!stillUrl) {
      if (reason === "motion-load-error" || reason.startsWith("motion-http")) {
        displayed?.remove();
        displayed = null;
        delete slot.dataset.art;
      }
      finish("fallback", `${reason}-no-still`);
      return;
    }
    const img = displayed instanceof HTMLImageElement
      ? displayed
      : mountImg();
    img.addEventListener("error", () => {
      img.remove();
      if (displayed === img) displayed = null;
      delete slot.dataset.art;
    }, { once: true });
    img.src = stillUrl;
    finish("fallback", reason);
  };

  if (reducedMotion) {
    mountImg(stillUrl ?? motionUrl ?? "");
    finish("fallback", stillUrl ? "reduced-motion" : "reduced-motion-no-still");
    return () => {
      stopped = true;
      abort.abort();
      displayed?.remove();
    };
  }

  if (!motionUrl) {
    mountImg(stillUrl ?? "");
    finish("fallback", "still-only");
    return () => {
      stopped = true;
      abort.abort();
      displayed?.remove();
    };
  }

  const startImgFallback = (reasonIfError = "motion-load-error") => {
    const img = mountImg(motionUrl);
    img.addEventListener("load", () => finish("playing", "img-load"), { once: true });
    img.addEventListener("error", () => useStill(reasonIfError), { once: true });
  };

  const startDecoderLoop = async (buffer) => {
    decoder = new ImageDecoderCtor({ data: buffer, type: MOTION_TYPE });
    if (decoder.tracks?.ready) await decoder.tracks.ready;
    if (stopped) return;
    const track = decoder.tracks?.selectedTrack;
    const frameCount = track?.frameCount ?? 0;
    if (frameCount < 2) {
      decoder.close();
      decoder = null;
      useStill("decoder-still");
      return;
    }

    const canvas = slot.ownerDocument.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    displayed?.remove();
    displayed = canvas;
    slot.append(canvas);

    let frameIndex = 0;
    let sized = false;
    const tick = async () => {
      if (stopped) return;
      if (!isVisible()) {
        timerId = schedule(tick, HIDDEN_POLL_MS);
        return;
      }
      try {
        const { image } = await decoder.decode({ frameIndex });
        if (stopped) {
          image.close?.();
          return;
        }
        if (!sized) {
          canvas.width = image.displayWidth || image.codedWidth || 1;
          canvas.height = image.displayHeight || image.codedHeight || 1;
          sized = true;
        }
        paintFrame(canvas, image);
        const delay = Math.max(
          MIN_FRAME_MS,
          Math.round((image.duration ?? 100000) / 1000),
        );
        image.close?.();
        frameIndex = (frameIndex + 1) % frameCount;
        finish("playing", "decoder-loop", frameCount);
        timerId = schedule(tick, delay);
      } catch {
        if (!stopped) useStill("decoder-error");
      }
    };
    await tick();
  };

  const boot = async () => {
    const supported = await decoderSupported(ImageDecoderCtor);
    if (stopped) return;
    if (supported) {
      try {
        const buffer = await fetchBuffer(motionUrl, abort.signal);
        if (stopped) return;
        await startDecoderLoop(buffer);
        return;
      } catch (err) {
        if (stopped || err?.name === "AbortError") return;
        const reason = String(err?.message ?? "").startsWith("motion-http")
          ? "motion-load-error"
          : "decoder-error";
        useStill(reason);
        return;
      }
    }
    startImgFallback();
  };
  void boot();

  return () => {
    stopped = true;
    abort.abort();
    stopTimer();
    decoder?.close?.();
    decoder = null;
    displayed?.remove();
    displayed = null;
  };
}

/**
 * @param {typeof globalThis.ImageDecoder | undefined} Decoder
 */
async function decoderSupported(Decoder) {
  if (typeof Decoder !== "function") return false;
  if (typeof Decoder.isTypeSupported !== "function") return true;
  try {
    return await Decoder.isTypeSupported(MOTION_TYPE);
  } catch {
    return false;
  }
}

/** @param {HTMLElement} slot */
function clearMedia(slot) {
  for (const child of Array.from(slot.children)) {
    if (child instanceof HTMLImageElement || child instanceof HTMLCanvasElement) {
      child.remove();
    }
  }
}
