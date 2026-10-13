/* Cooper's Farm Weather: screens, data loading, radar, saved settings. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var DAYN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DEFAULT_PLACE = { name: "Snow Camp, NC", lat: 35.9, lon: -79.43 };
  var place = lsGet("cfw-place", DEFAULT_PLACE);
  var model = null;
  var crops = lsGet("cfw-crops", []);
  if (!Array.isArray(crops)) crops = [];

  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function clockNow(ts) { return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }

  /* ---------- icons (flat, filled; colors come from CSS tokens) ---------- */
  var SUN = '<circle cx="20" cy="20" r="8" fill="var(--sun)"/><path d="M20 4.5v4M20 31.5v4M4.5 20h4M31.5 20h4M9 9l2.8 2.8M28.2 28.2L31 31M31 9l-2.8 2.8M11.8 28.2L9 31" stroke="var(--sun)" stroke-width="2.6" stroke-linecap="round" fill="none"/>';
  var MOON = '<path d="M24 6.5A13.5 13.5 0 1 0 33.5 27 11 11 0 0 1 24 6.5z" fill="var(--moon)"/>';
  var CLOUD = '<path d="M12 31h17a6 6 0 0 0 .8-11.9A8.5 8.5 0 0 0 13.6 17 7 7 0 0 0 12 31z" fill="var(--cloud)"/>';
  function icon(cat, night, size) {
    var lead = night ? MOON : SUN, body;
    if (cat === "sun") body = lead;
    else if (cat === "partly") body = '<g transform="translate(-5 -6) scale(.8)">' + lead + '</g><g transform="translate(5 3) scale(.85)">' + CLOUD + '</g>';
    else if (cat === "cloud") body = CLOUD;
    else if (cat === "snow") body = '<g transform="translate(0 -4)">' + CLOUD + '</g><g fill="var(--rainc)"><circle cx="14" cy="34" r="1.8"/><circle cx="21" cy="37" r="1.8"/><circle cx="28" cy="34" r="1.8"/></g>';
    else if (cat === "storm") body = '<g transform="translate(0 -5)">' + CLOUD + '</g><path d="M22 26l-5 8h4l-2 6 7-9h-4.5z" fill="var(--sun)"/>';
    else body = '<g transform="translate(0 -5)">' + CLOUD + '</g><path d="M14 33l-1.8 4M21 33l-1.8 4M28 33l-1.8 4" stroke="var(--rainc)" stroke-width="2.6" stroke-linecap="round"/>';
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 40 40" aria-hidden="true">' + body + '</svg>';
  }
  function iconHtml(code, size, night) { return icon(Logic.catOf(code), !!night, size); }

  /* ---------- loading data ---------- */
  function weatherUrl(p) {
    return "https://api.open-meteo.com/v1/forecast?latitude=" + p.lat + "&longitude=" + p.lon +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,surface_pressure,wind_speed_10m,wind_gusts_10m" +
      "&hourly=temperature_2m,precipitation_probability,weather_code,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_temperature_6cm,vapor_pressure_deficit" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max,sunrise,sunset" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7";
  }
  function airUrl(p) {
    return "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + p.lat + "&longitude=" + p.lon + "&current=us_aqi,pm2_5";
  }
  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  var loading = false;
  function load() {
    if (loading) return;
    loading = true;
    $("refresh").textContent = "Refreshing...";
    Promise.all([getJson(weatherUrl(place)), getJson(airUrl(place)).catch(function () { return null; })])
      .then(function (res) {
        model = Logic.parse(res[0], res[1]);
        lsSet("cfw-cache", { lat: place.lat, lon: place.lon, model: model });
        showBanner("");
        render();
        loadRadar();
      })
      .catch(function () {
        if (model) showBanner("Can't reach the weather service. Showing weather from " + clockNow(model.fetched) + ".");
        else showBanner("Can't load the weather. Check your internet connection, then tap Refresh.");
      })
      .then(function () { loading = false; $("refresh").textContent = "Refresh"; });
  }

  function showBanner(msg) { var b = $("banner"); b.textContent = msg; b.hidden = !msg; }

  /* ---------- rendering ---------- */
  function meter(label, val, cls, line, note) {
    var w = val == null ? 0 : clamp(val * 2, 0, 100);
    return '<div class="meter"><div class="row"><span>' + label + '</span><span>' + (val == null ? "n/a" : val + "%") + '</span></div>' +
      '<div class="track ' + cls + '"><i style="width:' + w + '%"></i>' + (line ? '<span class="mark" style="left:' + (line * 2) + '%"></span>' : '') + '</div>' +
      '<div class="note">' + note + '</div></div>';
  }

  function render() {
    if (!model) return;
    var m = model, n = m.now, t = m.days[0], d0 = new Date();
    $("placeName").textContent = place.name;
    $("today").textContent = DAYN[d0.getDay()] + ", " + d0.toLocaleDateString(undefined, { month: "long", day: "numeric" }) + " · Updated " + clockNow(m.fetched);
    $("nowIcon").innerHTML = iconHtml(n.code, 84, n.night);
    $("nowTemp").textContent = n.temp;
    $("nowCond").textContent = Logic.COND[n.code] || "Cloudy";
    $("nowFeels").textContent = "Feels like " + n.feels + "°F · High " + t.hi + "° · Low " + t.lo + "°";

    var html = [
      ["Wind", n.wind + " mph", "Gusts " + n.gust],
      ["Rain chance", t.pop + "%", "Today"],
      ["Humidity", n.hum + "%", "Right now"],
      ["UV index", t.uv, t.uv >= 6 ? "High" : t.uv >= 3 ? "Moderate" : "Low"],
      ["Sun", "↑ " + Logic.fmtClock(t.rise).replace(" AM", "a"), "↓ " + Logic.fmtClock(t.set).replace(" PM", "p")],
      ["Pressure", n.press.toFixed(2) + " in", "At the surface"]
    ].map(function (s) { return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v">' + s[1] + '</div><div class="n">' + s[2] + '</div></div>'; }).join("");
    if (m.aqi) {
      html += '<div class="stat pollen" style="grid-column:1/-1"><div class="k">Air quality</div><div class="v">' + m.aqi.us + '</div><div class="n">' + Logic.aqiCat(m.aqi.us) + '</div><div class="bar2"><i style="width:' + clamp(m.aqi.us / 2, 2, 100) + '%"></i></div></div>';
    }
    $("stats").innerHTML = html;

    renderHours();

    var lo = Math.min.apply(null, m.days.map(function (x) { return x.lo; })), hi = Math.max.apply(null, m.days.map(function (x) { return x.hi; }));
    var span = Math.max(1, hi - lo);
    $("days").innerHTML = m.days.map(function (x, i) {
      var dt = new Date(x.date + "T12:00:00");
      var l = (x.lo - lo) / span * 100, w = Math.max(4, (x.hi - x.lo) / span * 100);
      return '<div class="day"><span class="nm">' + (i === 0 ? "Today" : DAYN[dt.getDay()]) + '</span>' + iconHtml(x.code, 28) +
        '<div class="range" role="img" aria-label="Low ' + x.lo + ', high ' + x.hi + '"><i style="left:' + l + '%;width:' + w + '%"></i></div>' +
        '<span class="hl">' + x.hi + '° / ' + x.lo + '°</span><span class="rain">' + (Logic.COND[x.code] || "") + ' · ' + x.pop + '% rain</span></div>';
    }).join("");

    var dd = m.days[1] ? m.days[1].hi - m.days[0].hi : 0, ad = Math.abs(dd);
    $("tomorrow").textContent = !m.days[1] ? "" : ad <= 1 ? "Tomorrow's high is about the same as today." :
      "Tomorrow's high is " + ad + "\u00b0 " + (dd > 0 ? "warmer" : "cooler") + " than today" + (ad >= 8 ? ". Big change." : ".");
    renderTractor();
    renderSoil();
    renderHay();
    renderTips();
  }

  function renderHours() {
    var m = model, W = 58, n = m.hours.length, H = 64, pad = 10;
    var temps = m.hours.map(function (h) { return h.temp; });
    var lo = Math.min.apply(null, temps), hi = Math.max.apply(null, temps), span = Math.max(1, hi - lo);
    function y(t) { return pad + (hi - t) / span * (H - pad * 2); }
    function cols(fn) { return '<div class="hr">' + m.hours.map(fn).join("") + '</div>'; }
    var pts = m.hours.map(function (h, i) { return (i * W + W / 2) + "," + y(h.temp).toFixed(1); }).join(" ");
    var drop = '<svg width="9" height="11" viewBox="0 0 9 11" aria-hidden="true"><path d="M4.5 0C4.5 0 0 5 0 7.2a4.5 4.5 0 0 0 9 0C9 5 4.5 0 4.5 0z" fill="var(--rain)"/></svg>';
    $("hours").innerHTML = '<div class="hrs" style="width:' + (n * W) + 'px">' +
      cols(function (h, i) { return '<span class="t">' + (i === 0 ? "Now" : (h.H % 12 || 12) + (h.H < 12 ? " AM" : " PM")) + '</span>'; }) +
      cols(function (h) { return '<span>' + iconHtml(h.code, 30, h.night) + '</span>'; }) +
      cols(function (h) { return '<span class="d">' + h.temp + '\u00b0</span>'; }) +
      '<svg class="line" width="' + (n * W) + '" height="' + H + '" viewBox="0 0 ' + (n * W) + ' ' + H + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="var(--line-strong)" stroke-width="2" stroke-linejoin="round"/>' +
      m.hours.map(function (h, i) { return '<circle cx="' + (i * W + W / 2) + '" cy="' + y(h.temp).toFixed(1) + '" r="3.5" fill="var(--green)"/>'; }).join("") + '</svg>' +
      cols(function (h) { return '<span class="p">' + drop + ' ' + h.pop + '%</span>'; }) + '</div>';
  }

  function renderTractor() {
    var tr = Logic.tractor(model);
    var svg = '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (tr.k === "cab" ? '<path d="M26 12h14l3 14H26z"/><path d="M26 12v14"/>' : tr.k === "either" ? '<path d="M26 12h14l3 14H26z" stroke-dasharray="4 4"/>' : '<path d="M30 26V16h8"/>') +
      '<path d="M8 26h38v10H8z"/><circle cx="16" cy="40" r="9"/><circle cx="42" cy="42" r="5"/></svg>';
    $("verdict").innerHTML = '<div class="verdict ' + tr.k + '">' + svg + '<div><div class="sub">Today\'s pick</div><div class="big">' + tr.title + '</div></div></div>';
    $("reasons").innerHTML = tr.why.map(function (w) { return "<li>" + w + "</li>"; }).join("");
  }

  function renderSoil() {
    var s = model.soil;
    $("meters").innerHTML =
      meter("Soil moisture, 1 to 4 in down", s.a, "", null, Logic.soilNote(s.a)) +
      meter("Soil moisture, 4 to 11 in down", s.b, "", null, "Deeper soil dries out more slowly.") +
      '<div class="note">' + (s.temp == null ? "" : "Soil temperature at 2 in: " + s.temp + "°F. ") + 'These are computer-model estimates for your spot, not readings from your own field.</div>';
  }

  function renderHay() {
    var hs = Logic.haySummary(model.days);
    var chips = hs.rates.map(function (r, i) {
      var dt = new Date(model.days[i].date + "T12:00:00");
      var k = r === "good" ? "go" : r === "ok" ? "soon" : "wait";
      return '<div class="chip"><b>' + (i === 0 ? "Today" : DAYN[dt.getDay()]) + '</b><span class="pill ' + k + '">' + (r === "ok" ? "OK" : r) + '</span></div>';
    }).join("");
    var probe = lsGet("cfw-hay", null), probeHtml = "";
    if (probe != null && typeof probe === "number") {
      var k, msg;
      if (probe <= 18 && model.next8 < 40) { k = "go"; msg = "Your reading of " + probe + "% is under 18%. Good to bale."; }
      else if (probe <= 18) { k = "soon"; msg = "Your reading of " + probe + "% is dry enough, but rain is likely soon. Bale it and get it covered."; }
      else { k = "wait"; msg = "Your reading of " + probe + "% is above 18%. Baling now can cause mold and heat. Wait and test again."; }
      probeHtml = '<p style="margin:14px 0 0"><span class="pill ' + k + '">Your probe</span> ' + msg + '</p>';
    }
    $("hay").innerHTML = '<div class="verdict ' + hs.k + '" style="margin-bottom:14px"><div><div class="sub">Drying forecast</div><div class="big">' + hs.label + '</div></div></div>' +
      '<p style="margin:0 0 12px">' + hs.msg + '</p><div class="chips">' + chips + '</div>' +
      '<p class="note" style="margin:10px 0 0">A good drying day has under 30% rain chance, almost no rain, and dry midday air.</p>' + probeHtml;
  }

  function renderTips() {
    var m = model, n = m.now, t = m.days[0];
    var heat = Math.round(Logic.thi(n.temp, n.hum));
    var frostNights = m.days.slice(0, 5).filter(function (x) { return x.lo <= 34; });
    var spray = n.wind >= 3 && n.wind <= 10 && m.next8 < 20;
    $("tips").innerHTML = [
      ["Animals", "Heat index " + heat + ". " + Logic.thiCat(heat)],
      ["Frost watch", frostNights.length ? frostNights.length + " night" + (frostNights.length > 1 ? "s" : "") + " at or below 34°F in the next 5 days. Cover tender plants." : "No frost in the next 5 nights."],
      ["Spraying", spray ? "Good window. Wind is " + n.wind + " mph and rain is unlikely." : "Wait. Spraying works best with wind between 3 and 10 mph and no rain coming."],
      ["Daylight", Logic.fmtClock(t.rise) + " to " + Logic.fmtClock(t.set)]
    ].map(function (x) { return '<div class="tip"><b>' + x[0] + '</b>' + x[1] + '</div>'; }).join("");
  }

  /* ---------- crops (typed in by hand, saved on this phone) ---------- */
  function saveCrops() { lsSet("cfw-crops", crops); }
  function renderCrops() {
    var box = $("crops"); box.textContent = "";
    if (!crops.length) {
      var p = document.createElement("p"); p.className = "empty";
      p.textContent = "No crops yet. Add the ones you are growing below, or tap Add examples."; box.appendChild(p); return;
    }
    crops.forEach(function (cr, i) {
      var k = cr.pct >= 90 ? "go" : cr.pct >= 70 ? "soon" : "wait", lab = k === "go" ? "Ready" : k === "soon" ? "Almost" : "Not yet";
      var row = document.createElement("div"); row.className = "crop";
      var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = cr.nm;
      var pill = document.createElement("span"); pill.className = "pill " + k; pill.textContent = lab;
      var x = document.createElement("button"); x.type = "button"; x.className = "x"; x.textContent = "×"; x.setAttribute("aria-label", "Remove " + cr.nm);
      x.addEventListener("click", function () { crops.splice(i, 1); saveCrops(); renderCrops(); });
      var note = document.createElement("span"); note.className = "note"; note.style.cssText = "grid-column:1/-1;margin-top:-2px"; note.textContent = cr.note || (cr.pct + "% ready");
      var tr = document.createElement("div"); tr.className = "track"; var bar = document.createElement("i"); bar.style.width = cr.pct + "%"; tr.appendChild(bar);
      row.appendChild(nm); row.appendChild(pill); row.appendChild(x); row.appendChild(note); row.appendChild(tr);
      box.appendChild(row);
    });
  }
  $("cropPct").addEventListener("input", function () { $("cropPctV").textContent = $("cropPct").value + "%"; });
  $("addcrop").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("cropName").value.trim(); if (!name) return;
    crops.push({ nm: name, pct: +$("cropPct").value, note: "" });
    saveCrops(); renderCrops(); $("cropName").value = ""; $("cropName").focus();
  });
  $("clearCrops").addEventListener("click", function () { crops = []; saveCrops(); renderCrops(); });
  $("exampleCrops").addEventListener("click", function () {
    crops = [{ nm: "Soybeans", pct: 90, note: "" }, { nm: "Sweet potatoes", pct: 100, note: "" }, { nm: "Pumpkins", pct: 100, note: "" }, { nm: "Collards", pct: 60, note: "" }];
    saveCrops(); renderCrops();
  });

  /* ---------- hay probe reading ---------- */
  $("hayForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = parseFloat($("hayMoist").value);
    if (isNaN(v) || v < 0 || v > 60) return;
    lsSet("cfw-hay", v); if (model) renderHay();
  });
  $("hayClear").addEventListener("click", function () { lsSet("cfw-hay", null); $("hayMoist").value = ""; if (model) renderHay(); });
  (function () { var v = lsGet("cfw-hay", null); if (typeof v === "number") $("hayMoist").value = v; })();

  /* ---------- radar (RainViewer frames over a CARTO map, drawn with Leaflet) ---------- */
  var radar = { map: null, marker: null, layers: [], times: [], i: 0, timer: null };
  function setRadarStatus(t) { $("rStatus").textContent = t; }

  function loadRadar() {
    if (typeof L === "undefined") { setRadarStatus("Radar needs an internet connection."); return; }
    if (!radar.map) {
      radar.map = L.map("map", { scrollWheelZoom: false, worldCopyJump: true }).setView([place.lat, place.lon], 7);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 12, subdomains: "abcd", attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
      }).addTo(radar.map);
    } else {
      radar.map.setView([place.lat, place.lon], radar.map.getZoom());
    }
    if (radar.marker) radar.map.removeLayer(radar.marker);
    radar.marker = L.circleMarker([place.lat, place.lon], { radius: 7, color: "#ffffff", weight: 3, fillColor: "#e9a60f", fillOpacity: 1 }).addTo(radar.map);
    setTimeout(function () { radar.map.invalidateSize(); }, 200);

    getJson("https://api.rainviewer.com/public/weather-maps.json").then(function (j) {
      var past = (j.radar && j.radar.past) || [];
      if (!past.length) throw new Error("no frames");
      radarStop();
      radar.layers.forEach(function (l) { radar.map.removeLayer(l); });
      radar.layers = []; radar.times = [];
      past.slice(-12).forEach(function (f) {
        var layer = L.tileLayer(j.host + f.path + "/256/{z}/{x}/{y}/2/1_1.png", { opacity: 0, maxNativeZoom: 7, maxZoom: 12, zIndex: 5, attribution: "Radar: RainViewer" });
        layer.addTo(radar.map);
        radar.layers.push(layer); radar.times.push(f.time);
      });
      var last = radar.layers.length - 1;
      $("rFrame").max = last; showFrame(last);
      setRadarStatus("Radar from RainViewer, updated " + clockNow(radar.times[last] * 1000) + ".");
      if (!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) radarPlay();
    }).catch(function () { setRadarStatus("Radar is not available right now."); });
  }
  function showFrame(i) {
    radar.i = i; $("rFrame").value = i;
    radar.layers.forEach(function (l, k) { l.setOpacity(k === i ? 0.75 : 0); });
    var ago = Math.round((radar.times[radar.times.length - 1] - radar.times[i]) / 60);
    $("rTime").textContent = i === radar.layers.length - 1 ? "Now" : ago + " min ago";
  }
  function radarStop() { clearInterval(radar.timer); radar.timer = null; $("rPlay").textContent = "Play"; }
  function radarPlay() {
    radarStop(); if (radar.layers.length < 2) return;
    $("rPlay").textContent = "Pause";
    radar.timer = setInterval(function () { showFrame((radar.i + 1) % radar.layers.length); }, 700);
  }
  $("rPlay").addEventListener("click", function () { if (radar.timer) radarStop(); else radarPlay(); });
  $("rFrame").addEventListener("input", function () { radarStop(); showFrame(+$("rFrame").value); });

  /* ---------- choosing a place ---------- */
  function setPlace(p) {
    place = p; lsSet("cfw-place", p); model = null;
    $("placePanel").hidden = true; $("placeResults").textContent = "";
    load();
  }
  $("placeBtn").addEventListener("click", function () { var p = $("placePanel"); p.hidden = !p.hidden; if (!p.hidden) $("placeQ").focus(); });
  $("placeForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = $("placeQ").value.trim(); if (!q) return;
    var box = $("placeResults"); box.textContent = "Searching...";
    getJson("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(q) + "&count=6&language=en&format=json").then(function (j) {
      box.textContent = "";
      var rs = j.results || [];
      if (!rs.length) { box.textContent = "No towns found. Try another spelling."; return; }
      rs.forEach(function (r) {
        var b = document.createElement("button"); b.type = "button"; b.className = "btn ghost";
        var label = r.name + (r.admin1 ? ", " + r.admin1 : "") + (r.country_code && r.country_code !== "US" ? " (" + r.country_code + ")" : "");
        b.textContent = label;
        b.addEventListener("click", function () { setPlace({ name: r.name + (r.admin1 ? ", " + r.admin1 : ""), lat: r.latitude, lon: r.longitude }); });
        box.appendChild(b);
      });
    }).catch(function () { box.textContent = "Search failed. Check your internet connection."; });
  });
  $("useGps").addEventListener("click", function () {
    var box = $("placeResults");
    if (!navigator.geolocation) { box.textContent = "This phone or browser can't share its location."; return; }
    box.textContent = "Finding you...";
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = Math.round(pos.coords.latitude * 1000) / 1000, lon = Math.round(pos.coords.longitude * 1000) / 1000;
      getJson("https://api.weather.gov/points/" + lat + "," + lon).then(function (j) {
        var rl = j.properties.relativeLocation.properties; return rl.city + ", " + rl.state;
      }).catch(function () { return "My location"; }).then(function (name) { setPlace({ name: name, lat: lat, lon: lon }); });
    }, function () { box.textContent = "Location is turned off. Allow it in your browser settings, or search for a town."; }, { timeout: 10000, maximumAge: 600000 });
  });
  $("refresh").addEventListener("click", load);

  /* ---------- start up ---------- */
  var cache = lsGet("cfw-cache", null);
  if (cache && cache.model && Math.abs(cache.lat - place.lat) < 0.01 && Math.abs(cache.lon - place.lon) < 0.01) { model = cache.model; render(); }
  renderCrops();
  load();
  setInterval(function () { if (!document.hidden && (!model || Date.now() - model.fetched > 15 * 60 * 1000)) load(); }, 60 * 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && (!model || Date.now() - model.fetched > 10 * 60 * 1000)) load(); });
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) { navigator.serviceWorker.register("sw.js").catch(function () {}); }
})();
