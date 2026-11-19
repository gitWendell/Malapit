# Listing address lists

Listing creation uses local, static province/area, city/municipality and barangay lists. These are public geographic names, not users' addresses. The browser does not call a paid address service or send typed property addresses to a geocoder.

Names cover 1,642 cities/municipalities and 42,010 barangays. The base is [Tenasia/ph-psgc, pinned release 2026-Q2](https://github.com/Tenasia/ph-psgc/tree/2026-Q2), processed from the Philippine Statistics Authority's PSGC publication. Malapit applies the only third-quarter 2026 place-name correction: Lambangan → Lambagan in Cabanglasan, Bukidnon, code 1001322005. This is documented in [PSA release 2026-331, 12 October 2026](https://psa.gov.ph/classification/psgc). Thus the included names reflect 30 September 2026; future quarterly updates require review and a new build.

The geographic province assignments come from the 2026-Q3 city metadata exposed by [PH PSGC API](https://psgc.billyjamesramos.com/docs). They group Cebu City's independent city entry under Cebu for the address picker. Metro Manila and the Special Geographic Area are labelled as areas rather than provinces. Saved city labels include the province/area to distinguish names such as San Jose. Old saved names and neighborhood labels remain usable during edits; a place change clears the previous barangay and pin.

Area map points come from the PSA/NAMRIA 4Q 2023 boundaries processed by [faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps) and Tenasia. They are approximate area hints, with incomplete coverage of newer places and Manila's barangays. Known city map centers are retained. Missing barangay points fall back to the city overview; Kalayaan has a province overview. These points never confirm a property's position. The owner must drag, tap, or explicitly confirm the pin. Property coordinates stay numeric internally and retain existing public approximate-location controls.

PSA data is credited in the picker and licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The map-point MIT notice is shipped at `/locations/map-points-MIT.txt`. `/locations/sources.json` records source versions, the upstream archive hash and the exact Q3 correction.

## Refreshing

Download the pinned source ZIP from `https://codeload.github.com/Tenasia/ph-psgc/zip/refs/tags/2026-Q2` and four city-metadata pages from `https://psgc.billyjamesramos.com/api/v1/cities-municipalities?limit=500&page=1` through page 4. The current cached inputs are ignored under `.sites-runtime/locations-source/`. Only JSON and public data are read; downloaded scripts are not run.

Run:

```sh
python3 scripts/build-location-data.py --source-zip .sites-runtime/locations-source/ph-psgc-2026-Q2.zip --metadata-dir .sites-runtime/locations-source
npm run check
npm test
```

The builder checks counts, unique codes, geographic ranges and the single expected name correction. Do not substitute a newer archive or API release without updating these checks, reviewing PSGC changes and rerunning the browser location checks. Bundled assets are loaded only when the location step is opened; barangays load one province/independent-city area at a time. No database migration or new provider subscription is needed.
