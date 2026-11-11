// =======================================================
// INICIATIVA: hn-distrito-central (Comunidad Urbana Copernicus Centroamérica)
// ANÁLISIS: Susceptibilidad a Inundaciones, Deslizamientos y Exposición Urbana (2019-2026)
// PLATAFORMA: Google Earth Engine (Code Editor)
// =======================================================

// 1. ÁREA DE ESTUDIO: Municipio del Distrito Central (Tegucigalpa y Comayagüela)
var departamentos = ee.FeatureCollection("FAO/GAUL_SIMPLIFIED_500m/2015/level2");
var distritoCentral = departamentos.filter(ee.Filter.inList('ADM2_NAME', ['Distrito Central']));

Map.centerObject(distritoCentral, 11);
Map.setOptions('HYBRID');

// Límite municipal
Map.addLayer(distritoCentral.style({
  color: '#00E5FF',
  fillColor: '00000000',
  width: 2
}), {}, 'Límite Municipio Distrito Central');


// =======================================================
// 2. MODELO DIGITAL DE ELEVACIÓN Y VARIABLES TOPOGRÁFICAS (Copernicus DEM 30m)
// =======================================================
// Copernicus GLO-30 (30 metros de resolución espacial)
var dem = ee.Image('COPERNICUS/DEM/GLO30_COG')
  .select('DEM')
  .clip(distritoCentral);

var terrain = ee.Terrain.products(dem);
var slope = terrain.select('slope'); // Pendiente en grados

// Visualización de relieve sombreado (Hillshade)
Map.addLayer(terrain.select('hillshade'), {min: 150, max: 255}, 'Relieve (Hillshade)', false);


// =======================================================
// 3. ANÁLISIS DE SUSCEPTIBILIDAD A DESLIZAMIENTOS DE TIERRA
// =======================================================
// Criterio topográfico de pendientes críticas para laderas de Tegucigalpa:
// 1 = Pendiente Moderada (15° - 25°)
// 2 = Pendiente Alta (25° - 35°)
// 3 = Pendiente Muy Alta / Crítica (> 35°)
var deslizamiento = ee.Image(0)
  .where(slope.gte(15).and(slope.lt(25)), 1)
  .where(slope.gte(25).and(slope.lt(35)), 2)
  .where(slope.gte(35), 3)
  .clip(distritoCentral);

var paletaDeslizamiento = ['#FFF59D', '#FB8C00', '#B71C1C']; // Amarillo suave, Naranja, Rojo oscuro
Map.addLayer(deslizamiento.selfMask(), {min: 1, max: 3, palette: paletaDeslizamiento}, 'Susceptibilidad a Deslizamientos', true);


// =======================================================
// 4. ANÁLISIS DE SUSCEPTIBILIDAD A INUNDACIONES
// =======================================================
// 4.1 Modelo HAND (Height Above Nearest Drainage de MERIT Hydro)
// Indica la elevación relativa de cada punto respecto a la red de drenaje más próxima.
var hand = ee.Image("MERIT/Hydro/v1_0_1")
  .select('hnd')
  .clip(distritoCentral);

// 4.2 Criterio de inundabilidad ribereña y acumulación de escorrentía:
// HAND < 5m y pendiente baja (< 8°): Alta susceptibilidad (inundación recurrente Río Choluteca y quebradas)
// HAND 5m - 15m y pendiente baja (< 8°): Susceptibilidad moderada
var inundacion = ee.Image(0)
  .where(hand.lte(5).and(slope.lte(8)), 2)  // Alta
  .where(hand.gt(5).and(hand.lte(15)).and(slope.lte(10)), 1) // Moderada
  .clip(distritoCentral);

var paletaInundacion = ['#64B5F6', '#0D47A1']; // Azul claro (Moderada), Azul oscuro (Alta)
Map.addLayer(inundacion.selfMask(), {min: 1, max: 2, palette: paletaInundacion}, 'Susceptibilidad a Inundaciones', true);


// =======================================================
// 5. EXPOSICIÓN DEL CRECIMIENTO URBANO (2019 - 2026)
// =======================================================
// Extraemos la mancha urbana base 2019 y el crecimiento 2020-2026 con Sentinel-2
function getUrbanMask(year) {
  var startDate = ee.Date.fromYMD(year, 1, 1);
  var endDate = (year === 2026) ? ee.Date(Date.now()) : ee.Date.fromYMD(year, 12, 31);

  var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(distritoCentral)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .map(function(img) {
      return img.normalizedDifference(['B8', 'B4']).rename('NDVI');
    })
    .median()
    .clip(distritoCentral);

  return s2.lt(0.2).selfMask().rename('UrbanMask');
}

var urban2019 = getUrbanMask(2019).unmask(0);
var urban2026 = getUrbanMask(2026).unmask(0);

// Crecimiento urbano ocurrido entre 2019 y 2026
var crecimientoTotal = urban2026.and(urban2019.not()).selfMask();
Map.addLayer(crecimientoTotal, {palette: ['#FF00FF']}, 'Crecimiento Urbano Nuevo (2019-2026)', true);

// 5.1 Intersección: Nuevas construcciones en zonas de ALTO RIESGO de deslizamiento (pendiente > 25°)
var urbanoEnLaderaCritica = crecimientoTotal.updateMask(slope.gte(25));
Map.addLayer(urbanoEnLaderaCritica, {palette: ['#FF1744']}, '⚠️ Crecimiento en Ladera Crítica (>25°)', true);

// 5.2 Intersección: Nuevas construcciones en zonas de ALTO RIESGO de inundación (HAND < 5m)
var urbanoEnInundacion = crecimientoTotal.updateMask(inundacion.eq(2));
Map.addLayer(urbanoEnInundacion, {palette: ['#00E676']}, '⚠️ Crecimiento en Margen Inundable (HAND < 5m)', true);


// =======================================================
// 6. CÁLCULO DE ÁREAS EXPUESTAS (HECTÁREAS Y KM²)
// =======================================================
var pixelArea = ee.Image.pixelArea();

function calcularArea(mascara, nombre) {
  var areaM2 = pixelArea.updateMask(mascara).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: distritoCentral.geometry(),
    scale: 10,
    maxPixels: 1e13
  }).get('area');

  var areaHa = ee.Number(areaM2).divide(10000);
  var areaKm2 = ee.Number(areaM2).divide(1000000);

  return ee.Feature(null, {
    'Categoria': nombre,
    'Superficie_ha': areaHa,
    'Superficie_km2': areaKm2
  });
}

var estadisticasExposicion = ee.FeatureCollection([
  calcularArea(crecimientoTotal, 'Crecimiento Urbano Total 2019-2026'),
  calcularArea(urbanoEnLaderaCritica, 'Crecimiento Expuesto a Deslizamiento (>25°)'),
  calcularArea(urbanoEnInundacion, 'Crecimiento Expuesto a Inundación (HAND < 5m)')
]);

print('📊 Diagnóstico de Exposición del Crecimiento Urbano:', estadisticasExposicion);


// =======================================================
// 7. EXPORTACIONES A GOOGLE DRIVE
// =======================================================
// 7.1 Tabla resumen de amenazas
Export.table.toDrive({
  collection: estadisticasExposicion,
  description: 'Diagnostico_Riesgos_Crecimiento_Distrito_Central_2019_2026',
  folder: 'GEE_Distrito_Central',
  fileFormat: 'CSV'
});

// 7.2 Raster de amenaza por deslizamientos (EPSG:4326)
Export.image.toDrive({
  image: deslizamiento.toByte(),
  description: 'Susceptibilidad_Deslizamientos_Distrito_Central_GLO30',
  folder: 'GEE_Distrito_Central',
  scale: 30,
  region: distritoCentral.geometry(),
  maxPixels: 1e13,
  crs: 'EPSG:4326'
});

// 7.3 Raster de susceptibilidad a inundaciones (EPSG:4326)
Export.image.toDrive({
  image: inundacion.toByte(),
  description: 'Susceptibilidad_Inundaciones_Distrito_Central_HAND',
  folder: 'GEE_Distrito_Central',
  scale: 30,
  region: distritoCentral.geometry(),
  maxPixels: 1e13,
  crs: 'EPSG:4326'
});


// =======================================================
// 8. LEYENDA INTEGRADA EN EL MAPA
// =======================================================
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '10px 14px',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    border: '1px solid #90A4AE'
  }
});

legend.add(ui.Label('Amenazas y Crecimiento Urbano', {fontWeight: 'bold', fontSize: '13px', color: '#0D47A1'}));

var items = [
  ['#FFF59D', 'Deslizamiento Moderado (15°-25°)'],
  ['#FB8C00', 'Deslizamiento Alto (25°-35°)'],
  ['#B71C1C', 'Deslizamiento Crítico (>35°)'],
  ['#64B5F6', 'Inundación Moderada (HAND 5-15m)'],
  ['#0D47A1', 'Inundación Alta (HAND < 5m)'],
  ['#FF00FF', 'Crecimiento Urbano (2019-2026)'],
  ['#FF1744', '⚠️ Construcción en Ladera Crítica'],
  ['#00E676', '⚠️ Construcción en Margen Inundable']
];

items.forEach(function(item) {
  var row = ui.Panel({
    layout: ui.Panel.Layout.Flow('horizontal'),
    widgets: [
      ui.Label({style: {backgroundColor: item[0], padding: '7px', margin: '0 8px 3px 0', border: '1px solid #546E7A'}}),
      ui.Label(item[1], {style: {margin: '1px 0', fontSize: '11px'}})
    ]
  });
  legend.add(row);
});

Map.add(legend);
