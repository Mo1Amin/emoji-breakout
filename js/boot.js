// Loaded as a blocking script in <head> so the page never paints its final
// layout for a frame before the intro hides it. The intro plays once per visit.
try {
  if (!sessionStorage.getItem("playto.intro")) document.documentElement.classList.add("intro");
} catch {
  document.documentElement.classList.add("intro");
}
