# Desarrollo técnico reproducible (`hn-distrito-central`)

Espacio preparado para versionar los scripts (Google Earth Engine, Python, openEO, R o SQL espacial) que generen las capas publicables en `geovisor/` y las contribuciones a `atlas/products/`.

## Scripts disponibles

| Archivo | Plataforma | Descripción |
|---|---|---|
| [`gee_analisis_urbano_y_riesgos_completo.js`](file:///C:/proyectos_copernicus/urbano-hn-distrito-central/src/gee_analisis_urbano_y_riesgos_completo.js) | Google Earth Engine (JavaScript) | **Script maestro unificado:** Análisis multitemporal 2019–2026, modelado de susceptibilidad (inundación/deslizamiento), exposición territorial, visualización y exportación directa a GeoJSON (EPSG:4326) para el Geovisor. |
| [`gee_crecimiento_urbano_2019_2026.js`](file:///C:/proyectos_copernicus/urbano-hn-distrito-central/src/gee_crecimiento_urbano_2019_2026.js) | Google Earth Engine (JavaScript) | Detección multitemporal de crecimiento de mancha urbana anual (2019–2026) en el Municipio del Distrito Central mediante Sentinel-2 (NDVI), cálculo de áreas (m², ha, km²), gráfico dinámico y exportación a Drive (CSV y GeoTIFF EPSG:4326). |
| [`gee_riesgo_inundacion_deslizamiento.js`](file:///C:/proyectos_copernicus/urbano-hn-distrito-central/src/gee_riesgo_inundacion_deslizamiento.js) | Google Earth Engine (JavaScript) | Modelado de susceptibilidad física a deslizamientos (Copernicus DEM GLO-30 / pendientes críticas) e inundaciones (HAND / drenaje hidrográfico) y cruce espacial de exposición con el crecimiento urbano 2019–2026. |

