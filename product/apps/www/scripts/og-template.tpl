<!doctype html>
<html lang="{{lang}}">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: "Instrument Sans";
        font-weight: 400 700;
        src: url("{{fontUrl}}") format("woff2");
      }
      :root {
        --bg: #ffffff;
        --ink: #0a0a0a;
        --mut: #4a4a4a;
        --line: #d9d9d9;
        --green: #0b7a5a;
        --green-lit: #3fd6a8;
        --panel: #0a0a0a;
        --panel-fg: #f5f5f5;
        --panel-mut: #a3a3a3;
        --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      * { box-sizing: border-box; margin: 0; }
      html, body { width: 1200px; height: 630px; overflow: hidden; background: var(--bg); }
      body {
        font-family: "Instrument Sans", sans-serif;
        color: var(--ink);
        position: relative;
      }
      /* Safe area: 80px left and right, 56px top and bottom. Nothing important sits outside it. */
      .logo { position: absolute; left: 80px; top: 56px; display: flex; align-items: center; gap: 14px; }
      .logo svg { width: 31px; height: 40px; display: block; }
      .logo span { font-size: 34px; font-weight: 700; letter-spacing: -0.055em; }
      h1 {
        position: absolute; left: 80px; top: 176px; width: 520px;
        font-size: 68px; line-height: 1.04; font-weight: 700; letter-spacing: -0.03em;
        text-wrap: balance;
      }
      .foot {
        position: absolute; left: 80px; bottom: 56px; display: flex; align-items: center; gap: 14px;
        font-size: 24px; font-weight: 500; color: var(--mut);
      }
      .foot i { width: 12px; height: 12px; border-radius: 50%; background: var(--green); display: block; }
      .foot b { color: var(--ink); font-weight: 600; }

      .term {
        position: absolute; left: 650px; top: 138px; width: 470px; height: 290px;
        background: var(--panel); border-radius: 14px; color: var(--panel-fg);
        padding: 0 28px; font-family: var(--mono); font-size: 19px; line-height: 1.7;
      }
      .term .bar { height: 54px; display: flex; align-items: center; gap: 9px; margin: 0 -28px 8px; padding: 0 28px; border-bottom: 1px solid #2a2a2a; }
      .term .bar i { width: 11px; height: 11px; border-radius: 50%; background: #3a3a3a; display: block; }
      .term .bar span { margin-left: 8px; font-family: "Instrument Sans", sans-serif; font-size: 16px; color: var(--panel-mut); }
      .term div.l { white-space: pre; }
      .m { color: var(--panel-mut); }
      .o { color: var(--green-lit); }

      .win {
        position: absolute; left: 740px; top: 390px; width: 380px; height: 166px;
        background: #fff; border: 2px solid var(--ink); border-radius: 12px; overflow: hidden;
      }
      .win .bar { height: 44px; border-bottom: 2px solid var(--ink); display: flex; align-items: center; gap: 12px; padding: 0 16px; background: #f2f2f2; }
      .win .bar i { width: 10px; height: 10px; border-radius: 50%; background: var(--ink); display: block; }
      .win .bar span { font-size: 17px; font-weight: 600; }
      .win .body { padding: 20px 20px 0; }
      .win .url { font-family: var(--mono); font-size: 15px; color: var(--mut); border: 1.5px solid var(--line); border-radius: 8px; padding: 9px 12px; white-space: nowrap; }
      .win .live { margin-top: 18px; display: flex; align-items: center; gap: 10px; font-size: 19px; font-weight: 600; }
      .win .live i { width: 12px; height: 12px; border-radius: 50%; background: var(--green); display: block; }
    </style>
  </head>
  <body>
    <div class="logo">
      <svg viewBox="16 12 32 40" aria-hidden="true"><path fill="#0a0a0a" fill-rule="evenodd" d="M16 12h8v7h4v-7h8v7h4v-7h8v10.5H16zM16 25.3h32V52H16zM27 52V40a5 5 0 0 1 10 0v12z"/></svg>
      <span>Rookbox</span>
    </div>
    <h1>{{title}}</h1>
    <div class="foot"><i></i><b>rookbox.run</b><span>{{e2b}}</span></div>

    <div class="term">
      <div class="bar"><i></i><i></i><i></i><span>{{terminalLabel}}</span></div>
      <div class="l">sbx = Sandbox.create()</div>
      <div class="l m"># {{ready}}</div>
      <div class="l">sbx.get_host(3000)</div>
      <div class="l o">3000-&lt;id&gt;.{{domain}}</div>
    </div>
    <div class="win">
      <div class="bar"><i></i><span>Chromium</span></div>
      <div class="body">
        <div class="url">3000-&lt;id&gt;.{{domain}}</div>
        <div class="live"><i></i>{{running}}</div>
      </div>
    </div>
  </body>
</html>
