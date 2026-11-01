// Theme vor dem ersten Rendern setzen (kein Aufblitzen). Standard: System-Einstellung.
(function () {
  try {
    var pref = (JSON.parse(localStorage.getItem("bttt_prefs_v1") || "{}") || {}).theme;
    var dark = pref === "dark" || (pref !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.dataset.theme = "dark";
  } catch (e) { /* ignore */ }
})();
