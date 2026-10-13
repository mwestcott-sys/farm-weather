/* Pure weather and farm logic. No DOM here, so it can be tested on its own. */
var Logic = (function () {
  function catOf(code) {
    if (code <= 1) return "sun";
    if (code === 2) return "partly";
    if (code === 3 || code === 45 || code === 48) return "cloud";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
    if (code >= 95) return "storm";
    return "rain";
  }

  var COND = {
    0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Rain showers", 81: "Rain showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers",
    95: "Thunderstorm", 96: "Thunderstorm, hail", 99: "Thunderstorm, hail"
  };

  function fmtClock(iso) {
    var h = +iso.slice(11, 13), m = iso.slice(14, 16);
    return ((h % 12) || 12) + ":" + m + (h < 12 ? " AM" : " PM");
  }

  function at(arr, i) {
    var v = arr && arr[i];
    return v == null ? null : v;
  }

  /* True when the given local time falls before sunrise or after sunset that day. */
  function isNight(iso, days) {
    var key = iso.slice(0, 10), stamp = iso.slice(0, 16);
    for (var i = 0; i < days.length; i++) {
      if (days[i].date === key) return stamp < days[i].rise || stamp > days[i].set;
    }
    return false;
  }

  /* Turns the Open-Meteo forecast (w) and air-quality (a, may be null) responses into one model. */
  function parse(w, a) {
    var c = w.current, h = w.hourly, d = w.daily;
    var key = c.time.slice(0, 13) + ":00";
    var i0 = 0, i;
    for (i = 0; i < h.time.length; i++) { if (h.time[i] >= key) { i0 = i; break; } }

    var hours = [];
    for (var k = 0; k < 24 && i0 + k < h.time.length; k++) {
      var j = i0 + k;
      hours.push({
        t: h.time[j],
        H: +h.time[j].slice(11, 13),
        temp: Math.round(h.temperature_2m[j]),
        code: h.weather_code[j],
        pop: h.precipitation_probability[j] == null ? 0 : h.precipitation_probability[j]
      });
    }

    var days = [];
    for (var n = 0; n < d.time.length; n++) {
      var vs = 0, vc = 0;
      for (var hr = 10; hr <= 17; hr++) {
        var v = at(h.vapor_pressure_deficit, n * 24 + hr);
        if (v != null) { vs += v; vc++; }
      }
      days.push({
        date: d.time[n],
        hi: Math.round(d.temperature_2m_max[n]),
        lo: Math.round(d.temperature_2m_min[n]),
        code: d.weather_code[n],
        pop: d.precipitation_probability_max[n] || 0,
        rain: d.precipitation_sum[n] || 0,
        wind: Math.round(d.wind_speed_10m_max[n]),
        uv: Math.round(d.uv_index_max[n] || 0),
        rise: d.sunrise[n],
        set: d.sunset[n],
        vpd: vc ? vs / vc : null
      });
    }

    hours.forEach(function (x) { x.night = isNight(x.t, days); });
    var next8 = Math.max.apply(null, hours.slice(0, 8).map(function (x) { return x.pop; }));
    var s1 = at(h.soil_moisture_3_to_9cm, i0), s2 = at(h.soil_moisture_9_to_27cm, i0), st = at(h.soil_temperature_6cm, i0);

    return {
      fetched: Date.now(),
      now: {
        temp: Math.round(c.temperature_2m),
        feels: Math.round(c.apparent_temperature),
        code: c.weather_code,
        hum: Math.round(c.relative_humidity_2m),
        wind: Math.round(c.wind_speed_10m),
        gust: Math.round(c.wind_gusts_10m),
        press: c.surface_pressure * 0.02953,
        night: isNight(c.time, days)
      },
      hours: hours,
      days: days,
      next8: next8,
      soil: {
        a: s1 == null ? null : Math.round(s1 * 100),
        b: s2 == null ? null : Math.round(s2 * 100),
        temp: st == null ? null : Math.round(st)
      },
      aqi: a && a.current && a.current.us_aqi != null ? { us: Math.round(a.current.us_aqi), pm: a.current.pm2_5 } : null
    };
  }

  function aqiCat(v) {
    if (v <= 50) return "Good";
    if (v <= 100) return "Moderate";
    if (v <= 150) return "Unhealthy for sensitive people";
    return "Unhealthy";
  }

  function soilNote(v) {
    if (v == null) return "No soil reading for this spot.";
    if (v < 15) return "Dry. Seeds and young plants may need water.";
    if (v <= 35) return "Good. Most crops are happy here.";
    if (v <= 40) return "Wet. Wait before driving heavy equipment on it.";
    return "Soaked. Too wet for heavy equipment.";
  }

  /* Open-air vs cab. */
  function tractor(m) {
    var pts = 0, why = [], n = m.now;
    if (m.next8 >= 40) { pts += 2; why.push("Rain chance in the next 8 hours is " + m.next8 + "%, so stay dry in a cab."); }
    else if (m.next8 >= 20) { pts += 1; why.push("Rain chance in the next 8 hours is " + m.next8 + "%. A shower could pop up."); }
    else why.push("Rain chance in the next 8 hours is only " + m.next8 + "%.");
    if (n.wind >= 14) { pts += 1; why.push("Wind is " + n.wind + " mph, which blows dust and chaff around."); }
    else why.push("Wind is light at " + n.wind + " mph.");
    if (n.temp < 50) { pts += 1; why.push("It is " + n.temp + "°F, a little chilly with no windows."); }
    else if (n.temp > 88) { pts += 1; why.push("It is " + n.temp + "°F. A cab with AC wins."); }
    else why.push("Temperature is comfortable at " + n.temp + "°F.");
    if (m.aqi && m.aqi.us >= 101) { pts += 1; why.push("Air quality is " + m.aqi.us + " (" + aqiCat(m.aqi.us).toLowerCase() + "). A closed cab keeps dust and smoke out."); }
    if (pts >= 3) return { k: "cab", title: "Closed-air tractor (with cab)", why: why };
    if (pts >= 1) return { k: "either", title: "Either one works", why: why };
    return { k: "open", title: "Open-air tractor (no cab)", why: why };
  }

  /* Drying-day rating. Real inputs: rain chance, rain amount, midday vapor pressure deficit. */
  function rateDay(d) {
    if (d.pop < 30 && d.rain < 0.05 && (d.vpd == null || d.vpd >= 0.7)) return "good";
    if (d.pop < 45 && d.rain < 0.15) return "ok";
    return "poor";
  }

  function haySummary(days) {
    var streak = 0, limit = Math.min(days.length, 5), i;
    for (i = 0; i < limit; i++) { if (rateDay(days[i]) === "good") streak++; else break; }
    var k, label, msg;
    if (streak >= 3) { k = "open"; label = "Good time to cut"; msg = streak + " good drying days in a row. That is enough to cut, dry and bale."; }
    else if (streak >= 1) { k = "either"; label = "Maybe"; msg = "Only " + streak + " good drying day" + (streak > 1 ? "s" : "") + " before the weather turns. Hay usually needs 2 to 3."; }
    else { k = "cab"; label = "Not today"; msg = "Today is not a good drying day. Wait for a dry, breezy stretch."; }
    return { k: k, label: label, msg: msg, streak: streak, rates: days.slice(0, 5).map(rateDay) };
  }

  /* Temperature-humidity index for livestock (degrees F). */
  function thi(t, rh) { return t - (0.55 - 0.0055 * rh) * (t - 58); }
  function thiCat(v) {
    if (v < 72) return "Comfortable";
    if (v < 79) return "Alert. Give animals shade and water.";
    if (v < 84) return "Danger. Heat stress is likely.";
    return "Emergency. Cool the animals down now.";
  }

  return {
    catOf: catOf, COND: COND, fmtClock: fmtClock, parse: parse, aqiCat: aqiCat, soilNote: soilNote,
    tractor: tractor, rateDay: rateDay, haySummary: haySummary, thi: thi, thiCat: thiCat
  };
})();
if (typeof module !== "undefined") module.exports = Logic;
