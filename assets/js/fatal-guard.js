// Plain script, not a module — loaded before the page's module script so it is
// already listening if that module fails to load or throws before painting
// anything. Without this, a broken import or an uncaught error leaves a
// blank white screen with no clue what happened, which is unrecoverable for
// anyone who can't open devtools (this app's median member, and anyone on a
// phone). This never replaces fixing the underlying bug — it just makes sure
// a failure is visible instead of silent.
(function () {
  var shown = false;

  function showFatal(message) {
    if (shown) return;
    shown = true;
    document.body.dataset.ready = '1';
    // Colors are var(--color-...), not literals — this has to stay legible in
    // dark mode too, and the whole point of this screen is that it survives
    // even when nothing else on the page does.
    document.body.innerHTML =
      '<div style="max-width:420px;margin:15vh auto 0;padding:0 24px;' +
      'font:16px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;' +
      'text-align:center;color:var(--color-text-primary)">' +
      '<p style="font-weight:700;font-size:20px;margin:0 0 8px">This page hit a snag</p>' +
      '<p style="color:var(--color-text-secondary);margin:0 0 20px;word-break:break-word">' +
      String(message).replace(/</g, '&lt;') +
      '</p>' +
      '<button type="button" onclick="location.reload()" ' +
      'style="padding:12px 24px;border-radius:8px;border:0;background:var(--color-primary);' +
      'color:var(--color-on-primary);font:inherit;font-weight:700;cursor:pointer">Try again</button>' +
      '</div>';
  }

  // capture: true — a failed <script>/<link>/<img> load is a resource error that
  // does not bubble, so without capture this only ever catches in-script runtime
  // errors and a bad module import (e.g. a 404) falls through silently to the
  // generic 8s timeout instead of naming the actual failure.
  window.addEventListener(
    'error',
    function (e) {
      if (e.target && e.target !== window && e.target.tagName) {
        var src = e.target.src || e.target.href;
        showFatal('Failed to load ' + (src || e.target.tagName.toLowerCase()) + '.');
        return;
      }
      showFatal(e.message || (e.error && e.error.message) || 'A script failed to run.');
    },
    true,
  );
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    showFatal((reason && (reason.message || String(reason))) || 'A request failed.');
  });
  setTimeout(function () {
    if (document.body.dataset.ready !== '1') {
      showFatal('This is taking longer than expected. Check your connection and try again.');
    }
  }, 8000);
})();
