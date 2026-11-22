/* DTP PSV Asset Register map: latest 39-column A:AM workbook. */
(() => {
const rows = [
'A|1|record_no|No.|Identification|1|',
'B|2|tag_psv|Tag PSV|Identification||PSV tag;tag number;equipment tag;tag no;equipment number;tag id;safety valve tag',
'C|3|owner_operator|Owner / Operator|Identification||owner;operator;owner operator;company;client',
'D|4|location_platform|Location / Platform|Identification||location;platform;area;plant location;equipment location;installation unit;unit;plant unit;process unit',
'E|5|psv_type|PSV Type|General Data||PSV type;valve type;safety valve type;type',
'F|6|serial_number|Serial No.|General Data||serial number;serial no;S/N;SN;serial',
'G|7|manufacturer|Manufacturer|General Data||manufacturer;maker;vendor;OEM;brand',
'H|8|model|Model|General Data||model;model number;model no',
'I|9|year_built|Year Built|Year||year built;built year;manufacturing year;MFG year;year of manufacture',
'J|10|used|Used|Year||used;service status;in service;operating status',
'K|11|actual_inspection|Inspection Year|Year||inspection year;year of inspection;date inspection year;actual inspection year;tahun inspeksi;tahun pemeriksaan',
'L|12|actual_inspection_date|Inspection Date|Year||inspection date;date of inspection;date inspection;tanggal inspeksi;tanggal pemeriksaan;actual inspection date',
'M|13|psv_size_inch|Size (Inch)|PSV Size (inch)||PSV size;size;valve size;nominal size;size inch',
'N|14|inlet_inch|Inlet (Inch)|PSV Size (inch)||inlet size;inlet;inlet inch;inlet connection size',
'O|15|inlet_rating|Rating (Inlet)|PSV Size (inch)||inlet rating;inlet flange rating;inlet class;inlet pressure class',
'P|16|outlet_inch|Outlet (Inch)|PSV Size (inch)||outlet size;outlet;outlet inch;outlet connection size',
'Q|17|outlet_rating|Rating (Outlet)|PSV Size (inch)||outlet rating;outlet flange rating;outlet class;outlet pressure class',
'R|18|outlet_rating_lbs|Rating (lbs)|PSV Size (inch)||rating lbs;flange rating pair;inlet x outlet rating;rating inlet outlet;class rating lbs',
'S|19|design_pressure|Design|Pressure||design pressure;design press;design pressure kg/cm2',
'T|20|mawp|MAWP|Pressure||MAWP;maximum allowable working pressure;maximum working pressure',
'U|21|setting_pressure|Setting|Pressure||set pressure;setting pressure;set point;setpoint;spring setting',
'V|22|operating_pressure|Operating|Pressure||operating pressure;normal operating pressure;working pressure',
'W|23|date_inspection|Date Inspection|Previous Inspection||date inspection;inspection date;date of inspection;tanggal inspeksi;tanggal pemeriksaan;previous inspection date;last inspection date',
'X|24|back_pressure|Back Pressure|Previous Inspection||back pressure;superimposed back pressure;built up back pressure',
'Y|25|pop_test|Pop Test|Previous Inspection||pop test;pop pressure;pop test result',
'Z|26|leak_test|Leak Test|Previous Inspection||leak test;leakage test;seat leakage test',
'AA|27|overpressure_scenario_previous|Overpressure Scenario|Previous Inspection||previous overpressure scenario;overpressure scenario;relieving scenario;contingency;overpressure case',
'AB|28|protected_equipment_type|Type Equipment|Equipment Protected||type equipment;equipment protected;protected equipment;jenis peralatan yang dilindungi;equipment type;protected item description',
'AC|29|protected_equipment_item_no|No Item|Equipment Protected||no item;item number;item no;equipment number;equipment tag;nomor item;nomor peralatan;tag peralatan yang dilindungi',
'AD|30|protected_equipment_fluid|Fluid|Equipment Protected||fluid;process fluid;protected equipment fluid;fluida;jenis fluida;fluida peralatan yang dilindungi',
'AE|31|protected_equipment_design_temperature|Design Temperature|Temperature||protected equipment design temperature;design temperature equipment protected;temperatur desain peralatan yang dilindungi;design temperature',
'AF|32|protected_equipment_operating_temperature|Operating Temperature|Temperature||protected equipment operating temperature;operating temperature equipment protected;temperatur operasi peralatan yang dilindungi;operating temperature',
'AG|33|protected_equipment_design_pressure|Design Pressure|Protected Equipment Pressure||protected equipment design pressure;design pressure equipment protected;tekanan desain peralatan yang dilindungi',
'AH|34|protected_equipment_operating_pressure|Operating Pressure|Protected Equipment Pressure||protected equipment operating pressure;operating pressure equipment protected;tekanan operasi peralatan yang dilindungi',
'AI|35|orifice_area_calculated|Calculated|Orifice Area||calculated orifice area;calculated area;orifice area calculated',
'AJ|36|orifice_area_selected|Selected|Orifice Area||selected orifice area;selected area;orifice area selected',
'AK|37|orifice_designation|Designation|Orifice Area||orifice designation;designation;API orifice designation',
'AL|38|required_capacity|Required|Capacity||required capacity;required capacity kg/hr;required flow;required rate',
'AM|39|rated_capacity|Rated Capacity|Capacity||rated capacity;certified capacity;rated capacity kg/hr;relieving capacity'
];
const fields = rows.map(line => {
  const [column,index,key,label,group,auto,aliases] = line.split('|');
  return {column,index:Number(index),key,label,group,auto:auto==='1',aliases:aliases?aliases.split(';'):[]};
});
window.ARE_PSV_SCHEMA = {
  templateFile:'assets/templates/asset-register-template.xlsx',
  worksheet:'Sheet1',
  firstDataRow:5,
  totalTemplateColumns:39,
  expectedMergedRanges:null,
  expectedHeaderRows:4,
  fields
};
})();
