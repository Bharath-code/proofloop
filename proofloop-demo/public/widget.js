/*!
 * ProofLoop embed loader.
 * Usage: <div data-proofloop-widget="client-slug"></div>
 *        <script async src="https://YOUR-PROOFLOOP-HOST/widget.js"></script>
 * Injects a responsive iframe of the hosted widget page per marker.
 */
(function () {
  'use strict';
  var ORIGIN = new URL(document.currentScript.src, location.href).origin;

  function mount(el) {
    var slug = el.getAttribute('data-proofloop-widget');
    if (!slug || el.querySelector('iframe')) return;
    var iframe = document.createElement('iframe');
    iframe.src = ORIGIN + '/w/' + encodeURIComponent(slug) + '?embed=1';
    iframe.title = 'Customer reviews by ProofLoop';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('style', 'width:100%;border:0;display:block;height:600px;overflow:hidden;');
    el.appendChild(iframe);
  }

  function init() {
    var markers = document.querySelectorAll('[data-proofloop-widget]');
    for (var i = 0; i < markers.length; i++) mount(markers[i]);
  }

  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'proofloop:height' || e.origin !== ORIGIN) return;
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        var h = Math.max(200, Math.min(6000, Number(e.data.height) || 0));
        frames[i].style.height = h + 'px';
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
