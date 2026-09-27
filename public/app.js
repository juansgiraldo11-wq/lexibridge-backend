const API_BASE_URL = "https://lexibridge-api.onrender.com";

const form = document.querySelector("#form"),
  input = document.querySelector("#word"),
  result = document.querySelector("#result"),
  error = document.querySelector("#error"),
  status = document.querySelector("#status");

const esc = (x) =>
  String(x ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

document.querySelectorAll("[data-w]").forEach(
  (b) =>
    (b.onclick = () => {
      input.value = b.dataset.w;
      search(b.dataset.w);
    })
);

form.onsubmit = (e) => {
  e.preventDefault();
  search(input.value);
};

function details(e) {
  if (!e.details?.length) return "";
  return `<div class="section">Grammar details</div><table class="details"><tbody>${e.details
    .map((x) => `<tr><th>${esc(x.label)}</th><td>${esc(x.value)}</td></tr>`)
    .join("")}</tbody></table>`;
}

function entry(e) {
  const s = e.subcategory || {};
  return `<article class="entry"><div class="entrytop"><div class="pos">${esc(
    e.partOfSpeech
  )} <span class="code">${esc(s.code)}</span></div><span class="confidence ${esc(
    e.confidence
  )}">${esc(e.confidence)} confidence</span></div><p class="meaning">${esc(
    e.meaning_en
  )}</p><div class="grid"><div class="box"><small>Spanish</small><b>${esc(
    e.translation_es
  )}</b></div><div class="box"><small>Italian</small><b>${esc(
    e.translation_it
  )}</b></div></div><div class="sub"><b>${esc(s.code)} — ${esc(
    s.name
  )}</b>${esc(s.explanation)}<br><small>${esc(
    s.purpose
  )}</small></div>${details(e)}${
    e.examples?.length
      ? `<div class="section">Examples</div>${e.examples
          .map(
            (x) =>
              `<div class="example"><b>${esc(x.english)}</b><p><span>ES:</span> ${esc(
                x.spanish
              )}</p><p><span>IT:</span> ${esc(x.italian)}</p></div>`
          )
          .join("")}`
      : ""
  }${
    e.usage_notes?.length
      ? `<div class="section">Usage notes</div>${e.usage_notes
          .map((x) => `<div class="note">${esc(x)}</div>`)
          .join("")}`
      : ""
  }${
    e.exceptions?.length
      ? `<div class="section">Exceptions / special cases</div>${e.exceptions
          .map((x) => `<div class="note">${esc(x)}</div>`)
          .join("")}`
      : ""
  }</article>`;
}

async function search(w) {
  w = String(w || "").trim();
  if (!w) return;
  error.classList.add("hidden");
  result.innerHTML = `<div class="loading">Analyzing <b>${esc(
    w
  )}</b>…</div>`;
  status.textContent = "Searching…";
  try {
    const r = await fetch(`${API_BASE_URL}/api/search?word=${encodeURIComponent(w)}`);
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Search failed");
    result.innerHTML = `<section class="head"><h2 class="wordtitle">${esc(
      d.word
    )}</h2><div class="ipa">${esc(
      d.pronunciation?.ipa || "Pronunciation unavailable"
    )}</div><a class="wr" target="_blank" rel="noopener" href="https://www.wordreference.com/definition/${encodeURIComponent(
      d.word
    )}">Open WordReference manually ↗</a></section>${(d.entries || [])
      .map(entry)
      .join("")}<section class="sources"><h3>Sources & verification</h3><p>${esc(
      d.reliability_note || ""
    )}</p>${(d.sources || [])
      .map(
        (s) =>
          `<p><b>${esc(s.name)}</b> —${esc(
            s.role
          )} <a href="${esc(s.url)}" target="_blank" rel="noopener">Open ↗</a></p>`
      )
      .join("")}</section>`;
    status.textContent = "Ready";
    result.scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    result.innerHTML = "";
    error.textContent = e.message;
    error.classList.remove("hidden");
    status.textContent = "Error";
  }
}