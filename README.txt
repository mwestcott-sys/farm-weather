COOPER'S FARM WEATHER - INSTALL STEPS

1. Put this whole folder on a website that uses https. Easiest free options:
   - Netlify Drop: go to app.netlify.com/drop and drag the folder onto the page.
   - Cloudflare Pages or GitHub Pages also work.
   (It must be https. Opening index.html straight from a phone's files will not install or find your location.)

2. Open the web address on your phone.
   - iPhone: use Safari. Tap Share, then Add to Home Screen.
   - Android: use Chrome. Tap the menu, then Install app (or Add to Home screen).

3. The first time, tap the place name at the top and choose "Use my location".

Data sources (all free, no account or key):
   Weather, soil, air quality: open-meteo.com
   Radar: NOAA NEXRAD via mesonet.agron.iastate.edu (U.S. only)
   Map: OpenStreetMap (backup: USGS The National Map)
   Town name for GPS (US): api.weather.gov

After you change any file and re-upload, change the version name in sw.js
(CACHE = "cooper-farm-weather-v1") to v2 so phones pick up the update.
