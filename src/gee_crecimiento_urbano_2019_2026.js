// =======================================================
// 1. DEFINIR ÁREA DE ESTUDIO: Municipio del Distrito Central
// =======================================================

var departamentos = ee.FeatureCollection("FAO/GAUL_SIMPLIFIED_500m/2015/level2");

// Distrito Central (Tegucigalpa y Comayagüela)
var municipiosDistrito = [
  'Distrito Central'
];

var distritoCentral = departamentos.filter(ee.Filter.inList('ADM2_NAME', municipiosDistrito));
Map.centerObject(distritoCentral, 11);
Map.setOptions('HYBRID');

Map.addLayer(distritoCentral.style({
  color: '00E5FF',
  fillColor: '00000000',
  width: 2
}), {}, 'Límite Municipio Distrito Central');


// =======================================================
// 2. FUNCIÓN PARA OBTENER MÁSCARA URBANA POR NDVI
// =======================================================

function getUrbanMask(year) {
  var startDate = ee.Date.fromYMD(year, 1, 1);
  var endDate = (year === 2026) ? ee.Date(Date.now()) : ee.Date.fromYMD(year, 12, 31);

  var image = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(distritoCentral)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .map(function(img) {
      return img.normalizedDifference(['B8', 'B4']).rename('NDVI');
    })
    .median()
    .clip(distritoCentral);
    
  var urban = image.lt(0.2).selfMask().rename('UrbanMask');
  return urban;
}


// =======================================================
// 3. CAPA BASE: MANCHA URBANA 2019
// =======================================================

var urban2019 = getUrbanMask(2019);
Map.addLayer(urban2019, {palette: ['#757575']}, 'Mancha Urbana 2019 (Base)');


// =======================================================
// 4. CRECIMIENTO URBANO ANUAL: SÓLO SUPERFICIE NUEVA (2020-2026)
// =======================================================

var years = [2020, 2021, 2022, 2023, 2024, 2025, 2026];

// Paleta secuencial para distinguir cada año
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
var stats = [];
var urbanPrev = urban2019.unmask(0);

years.forEach(function(year) {
  var urbanYear = getUrbanMask(year).unmask(0);
  
  var growth = urbanYear.and(urbanPrev.not()).rename('Growth_' + year);
  Map.addLayer(growth.selfMask(), {palette: [yearColors[year]]}, 'Crecimiento ' + year);

  var areaM2 = pixelArea.updateMask(growth).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: distritoCentral.geometry(),
    scale: 20,
    maxPixels: 1e13
  }).get('area');

  var areaHa = ee.Number(areaM2).divide(10000);
  var areaKm2 = ee.Number(areaM2).divide(1000000);

  stats.push(ee.Feature(null, {
    'Año': year,
    'Superficie_ha': areaHa,
    'Superficie_km2': areaKm2
  }));

  urbanPrev = urbanPrev.or(urbanYear);
});

// Crecimiento acumulado entre 2019 y 2026
var crecimientoTotal = urbanPrev.and(urban2019.unmask(0).not()).selfMask();
Map.addLayer(crecimientoTotal, {palette: ['#00E5FF']}, 'Crecimiento Total (2019-2026)', false);

var tabla = ee.FeatureCollection(stats);
print('📊 Tabla de Crecimiento Urbano por Año (2020-2026):', tabla);

// Gráfico dinámico en consola
var chart = ui.Chart.feature.byFeature({
  features: tabla,
  xProperty: 'Año',
  yProperties: ['Superficie_km2']
}).setOptions({
  title: 'Crecimiento Urbano Anual en Distrito Central (km²)',
  hAxis: {title: 'Año', format: '####'},
  vAxis: {title: 'Superficie Nueva (km²)'},
  colors: ['#E53935'],
  lineWidth: 2,
  pointSize: 5
});
print(chart);


// =======================================================
// 5. EXPORTACIONES A DRIVE (VISIBLE EN TASKS)
// =======================================================

// 5.1 Exportar tabla de hectáreas y km² a CSV
Export.table.toDrive({
  collection: tabla,
  description: 'Crecimiento_Urbano_Distrito_Central_2019_2026',
  folder: 'GEE_Distrito_Central',
  fileFormat: 'CSV'
});

// 5.2 Exportar vector GeoJSON para el Geovisor web
var crecimientoFiltrado = crecimientoTotal.focal_mode({radius: 1.5, units: 'pixels'});

var vectorCrecimiento = crecimientoFiltrado.reduceToVectors({
  geometry: distritoCentral.geometry(),
  crs: 'EPSG:4326',
  scale: 30, // 30m: archivo ligero y rápido para MapLibre en navegadores
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


// =======================================================
// 6. LEYENDA EN EL MAPA
// =======================================================

var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '10px 14px',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    border: '1px solid #757575'
  }
});

legend.add(ui.Label('Crecimiento Urbano Distrito Central', {
  fontWeight: 'bold',
  fontSize: '13px',
  margin: '0 0 6px 0'
}));

var items = [
  ['#757575', 'Mancha urbana 2019 (Base)'],
  ['#FFEB3B', 'Crecimiento 2020'],
  ['#FFC107', 'Crecimiento 2021'],
  ['#FF9800', 'Crecimiento 2022'],
  ['#FF5722', 'Crecimiento 2023'],
  ['#F44336', 'Crecimiento 2024'],
  ['#E91E63', 'Crecimiento 2025'],
  ['#9C27B0', 'Crecimiento 2026']
];

items.forEach(function(item) {
  var row = ui.Panel({
    layout: ui.Panel.Layout.Flow('horizontal'),
    widgets: [
      ui.Label({
        style: {
          backgroundColor: item[0],
          padding: '7px',
          margin: '0 8px 3px 0',
          border: '1px solid #757575'
        }
      }),
      ui.Label(item[1], {style: {margin: '1px 0', fontSize: '11px'}})
    ]
  });
  legend.add(row);
});

Map.add(legend);
