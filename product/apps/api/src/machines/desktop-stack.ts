/**
 * The desktop stack a `desktop` or `corvo-computer` machine needs before its noVNC page answers:
 * Xvfb, the xfce session, x11vnc and noVNC on port 6080. The E2B desktop SDK starts these from
 * the client; machines created through the API never run that code, so opening the desktop starts
 * them here. Every part is guarded by `pgrep`, so a stack that already runs (one started by the
 * SDK, or one that survived a suspend and restore) is left alone and the check is a single curl.
 */
export const DESKTOP_READY_URL = "http://127.0.0.1:6080/vnc.html";
/** How long the script waits for noVNC to answer, in seconds. */
export const DESKTOP_WAIT_S = 20;
/** The exec timeout: the wait, plus room for the starts and the first checks. */
export const DESKTOP_EXEC_TIMEOUT_MS = (DESKTOP_WAIT_S + 10) * 1_000;

export const DESKTOP_SCRIPT = `
export DISPLAY=:0
ready() { curl -s -o /dev/null --max-time 2 ${DESKTOP_READY_URL}; }
if ready; then exit 0; fi
bg() { setsid nohup "$@" >/dev/null 2>&1 </dev/null & }
if ! pgrep -x Xvfb >/dev/null; then
  rm -f /tmp/.X0-lock /tmp/.X11-unix/X0
  bg Xvfb :0 -ac -screen 0 1280x800x24 -retro -dpi 96 -nolisten tcp
  for _ in $(seq 1 50); do [ -S /tmp/.X11-unix/X0 ] && break; sleep 0.1; done
fi
if ! pgrep -f xfce4-session >/dev/null; then bg startxfce4; fi
if ! pgrep -x x11vnc >/dev/null; then
  bg x11vnc -display :0 -forever -wait 50 -shared -rfbport 5900 -nopw -localhost
fi
if ! pgrep -f novnc_proxy >/dev/null && ! pgrep -f websockify >/dev/null; then
  bg /opt/noVNC/utils/novnc_proxy --vnc localhost:5900 --listen 6080 --web /opt/noVNC
fi
for _ in $(seq 1 ${DESKTOP_WAIT_S * 2}); do ready && exit 0; sleep 0.5; done
echo "noVNC did not answer on port 6080" >&2
exit 1
`.trim();
