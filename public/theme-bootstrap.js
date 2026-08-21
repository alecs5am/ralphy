(function () {
  var preference = "system";
  try {
    var value = JSON.parse(localStorage.getItem("ralphy-media-workbench-v1") || "null");
    if (value && ["system", "dark", "light"].indexOf(value.theme) !== -1) {
      preference = value.theme;
    }
  } catch (_) {
    // Storage can be unavailable before the renderer starts; system is safe.
  }

  var systemDark = false;
  try {
    systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (_) {
    // A light first paint is the browser default when media queries are unavailable.
  }

  var theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}());
