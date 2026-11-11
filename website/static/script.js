(function () {
  const form = document.getElementById("shorten-form");
  if (!form) return;
  const input = document.getElementById("url");
  const btn = document.getElementById("go");
  const err = document.getElementById("error");
  const result = document.getElementById("result");
  const short = document.getElementById("short");
  const copy = document.getElementById("copy");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    result.hidden = true;
    btn.disabled = true;
    try {
      const res = await fetch("/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: input.value.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      short.textContent = data.shortUrl;
      short.href = data.shortUrl;
      result.hidden = false;
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(short.textContent);
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    } catch (_) {
      copy.textContent = "Press Ctrl+C";
    }
  });
})();
