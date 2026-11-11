// ==============================================================================
// INICIATIVA: hn-distrito-central (Comunidad Urbana Copernicus Centroamérica)
// ANÁLISIS INTEGRAL: Crecimiento de Mancha Urbana (2019-2026), Susceptibilidad
// a Inundaciones y Deslizamientos, y Exportación a GeoJSON para el Geovisor
// PLATAFORMA: Google Earth Engine (Code Editor)
// ==============================================================================

// 1. ÁREA DE ESTUDIO: Municipio del Distrito Central (Tegucigalpa y Comayagüela)
var departamentos = ee.FeatureCollection("FAO/GAUL_SIMPLIFIED_500m/2015/level2");
var distritoCentral = departamentos.filter(ee.Filter.inList('ADM2_NAME', ['Distrito Central']));

Map.centerObject(distritoCentral, 11);
Map.setOptions('HYBRID');

// Visualizar límite municipal
Map.addLayer(distritoCentral.style({
  color: '#00E5FF',
  fillColor: '00000000',
  width: 2
}), {}, 'Límite Municipio Distrito Central');


// ==============================================================================
// 2. DETECCIÓN MULTITEMPORAL DE MANCHA URBANA (Sentinel-2 Harmonized)
// ==============================================================================
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

  // Umbral NDVI < 0.2 identifica superficie construida y suelo sin cobertura vegetal
  var urban = s2.lt(0.2).selfMask().rename('UrbanMask');
  return urban;
}

// 2.1 Capa Base 2019
var urban2019 = getUrbanMask(2019);
Map.addLayer(urban2019, {palette: ['#757575']}, '1. Mancha Urbana Base (2019)', false);

// 2.2 Crecimiento Anual (2020 a 2026)
var years = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
var yearColors = {
  2020: '#FFEB3B', // Amarillo
  2021: '#FFC107', // Ámbar
  2022: '#FF9800', // Naranja
  2023: '#FF5722', // Naranja rojizo
  2024: '#F44336', // Rojo
  2025: '#E91E63', // Magenta
  2026: '#9C27B0'  // Púrpura
};

var pixelArea = ee.Image.pixelArea();
var statsList = [];
var urbanPrev = urban2019.unmask(0);

// Capa raster unificada de año de aparición (2019..2026)
var rasterAnios = ee.Image(2019).updateMask(urban2019);

years.forEach(function(year) {
  var urbanYear = getUrbanMask(year).unmask(0);
  var growth = urbanYear.and(urbanPrev.not()).rename('Growth_' + year);
  
  // Agregar cada año al mapa con su color distintivo
  Map.addLayer(growth.selfMask(), {palette: [yearColors[year]]}, 'Crecimiento ' + year, false);
  
  rasterAnios = rasterAnios.where(growth, year);

  var areaM2 = pixelArea.updateMask(growth).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: distritoCentral.geometry(),
    scale: 20,
    maxPixels: 1e13
  }).get('area');

  statsList.push(ee.Feature(null, {
    'Año': year,
    'Superficie_ha': ee.Number(areaM2).divide(10000),
    'Superficie_km2': ee.Number(areaM2).divide(1000000)
  }));

  urbanPrev = urbanPrev.or(urbanYear);
});

// Crecimiento urbano total acumulado entre 2019 y 2026
var crecimientoTotal = urbanPrev.and(urban2019.unmask(0).not()).selfMask();
Map.addLayer(crecimientoTotal, {palette: ['#FF00FF']}, '2. Crecimiento Total Acumulado (2019-2026)', true);


// ==============================================================================
// 3. MODELADO DE AMENAZAS TOPOGRÁFICAS E HIDROLÓGICAS
// ==============================================================================
// 3.1 Modelo Digital de Elevación (Copernicus DEM 30m)
var dem = ee.Image('COPERNICUS/DEM/GLO30_COG').select('DEM').clip(distritoCentral);
var slope = ee.Terrain.slope(dem);

// Susceptibilidad a Deslizamientos:
// 1 = Moderada (15°-25°), 2 = Alta (25°-35°), 3 = Crítica (>35°)
var deslizamiento = ee.Image(0)
  .where(slope.gte(15).and(slope.lt(25)), 1)
  .where(slope.gte(25).and(slope.lt(35)), 2)
  .where(slope.gte(35), 3)
  .clip(distritoCentral);

Map.addLayer(deslizamiento.selfMask(), {
  min: 1, max: 3, 
  palette: ['#FFF59D', '#FB8C00', '#B71C1C']
}, '3. Susceptibilidad Deslizamientos (GLO30)', false);

// 3.2 Susceptibilidad a Inundaciones (HAND - MERIT Hydro)
var hand = ee.Image("MERIT/Hydro/v1_0_1").select('hnd').clip(distritoCentral);
var inundacion = ee.Image(0)
  .where(hand.lte(5).and(slope.lte(8)), 2)  // Alta susceptibilidad (Río Choluteca y quebradas)
  .where(hand.gt(5).and(hand.lte(15)).and(slope.lte(10)), 1) // Moderada
  .clip(distritoCentral);

Map.addLayer(inundacion.selfMask(), {
  min: 1, max: 2, 
  palette: ['#64B5F6', '#0D47A1']
}, '4. Susceptibilidad Inundaciones (HAND)', false);


// ==============================================================================
// 4. CRUCE DE EXPOSICIÓN: CRECIMIENTO URBANO EN ZONAS DE ALTO RIESGO
// ==============================================================================
// 4.1 Crecimiento sobre laderas críticas (pendiente >= 25°)
var urbanoEnLadera = crecimientoTotal.updateMask(slope.gte(25));
Map.addLayer(urbanoEnLadera, {palette: ['#D50000']}, '⚠️ 5. Crecimiento en Ladera Crítica (>=25°)', true);

// 4.2 Crecimiento en márgenes aluviales / inundables (HAND <= 5m)
var urbanoEnInundacion = crecimientoTotal.updateMask(inundacion.eq(2));
Map.addLayer(urbanoEnInundacion, {palette: ['#00E676']}, '⚠️ 6. Crecimiento en Margen Inundable (HAND <=5m)', true);


// ==============================================================================
// 5. DIAGNÓSTICO ESTADÍSTICO EN CONSOLA
// ==============================================================================
var tablaAnual = ee.FeatureCollection(statsList);
print('📊 1. Crecimiento Urbano Anual (ha y km²):', tablaAnual);

// Gráfico en consola
var chart = ui.Chart.feature.byFeature({
  features: tablaAnual,
  xProperty: 'Año',
  yProperties: ['Superficie_km2']
}).setOptions({
  title: 'Expansión Urbana Anual en Distrito Central (km²)',
  hAxis: {title: 'Año', format: '####'},
  vAxis: {title: 'Superficie Nueva (km²)'},
  colors: ['#E91E63'],
  lineWidth: 2,
  pointSize: 5
});
print(chart);


// ==============================================================================
// 6. EXPORTACIONES A GOOGLE DRIVE (LISTAS PARA GEOVISOR Y GITHUB)
// ==============================================================================
// Filtro morfológico para eliminar pixeles aislados y aligerar el vector para web
var crecimientoFiltrado = crecimientoTotal.focal_mode({radius: 1.5, units: 'pixels'});

// 6.1 Vector GeoJSON: Crecimiento Urbano 2019-2026 (Para el Geovisor MapLibre)
var vectorCrecimiento = crecimientoFiltrado.reduceToVectors({
  geometry: distritoCentral.geometry(),
  crs: 'EPSG:4326',
  scale: 30, // 30m para archivo GeoJSON ligero y rápido en navegadores
  geometryType: 'polygon',
  eightConnected: false,
  labelProperty: 'valor',
  maxPixels: 1e13
});

Export.table.toDrive({
  collection: vectorCrecimiento,
  description: 'mdc_crecimiento_urbano_2019_2026',
  folder: 'GEE_Distrito_Central',
  fileFormat: 'GeoJSON'
});

// 6.2 Vector GeoJSON: Zonas de Crecimiento en Ladera Crítica (Riesgo Deslizamiento)
var vectorLaderas = urbanoEnLadera.reduceToVectors({
  geometry: distritoCentral.geometry(),
  crs: 'EPSG:4326',
  scale: 30,
  geometryType: 'polygon',
  eightConnected: false,
  labelProperty: 'riesgo_ladera',
  maxPixels: 1e13
});

Export.table.toDrive({
  collection: vectorLaderas,
  description: 'mdc_crecimiento_en_ladera_critica',
  folder: 'GEE_Distrito_Central',
  fileFormat: 'GeoJSON'
});

// 6.3 Tabla Resumen en CSV
Export.table.toDrive({
  collection: tablaAnual,
  description: 'tabla_crecimiento_anual_2019_2026',
  folder: 'GEE_Distrito_Central',
  fileFormat: 'CSV'
});


// ==============================================================================
// 7. LEYENDA EN EL MAPA
// ==============================================================================
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '10px 14px',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    border: '1px solid #78909C'
  }
});

legend.add(ui.Label('Distrito Central: Crecimiento y Riesgos', {
  fontWeight: 'bold', fontSize: '13px', color: '#0D47A1', margin: '0 0 6px 0'
}));

var items = [
  ['#757575', 'Mancha Urbana Base (2019)'],
  ['#FF00FF', 'Crecimiento Acumulado (2019-2026)'],
  ['#D50000', '⚠️ Crecimiento en Ladera Crítica (>25°)'],
  ['#00E676', '⚠️ Crecimiento en Margen Inundable (HAND <5m)'],
  ['#FB8C00', 'Susceptibilidad a Deslizamiento'],
  ['#0D47A1', 'Susceptibilidad a Inundación']
];

items.forEach(function(item) {
  var row = ui.Panel({
    layout: ui.Panel.Layout.Flow('horizontal'),
    widgets: [
      ui.Label({style: {backgroundColor: item[0], padding: '7px', margin: '0 8px 3px 0', border: '1px solid #455A64'}}),
      ui.Label(item[1], {style: {margin: '1px 0', fontSize: '11px'}})
    ]
  });
  legend.add(row);
});

Map.add(legend);
