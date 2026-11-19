/* DTP BV/BVV Asset Register map: 31-column workbook without Date Built. */
(() => {
const rows = [
'A|1|record_no|No.|Identification|1|',
'B|2|tag_bvv|Tag BVV|Identification||BVV tag;BV tag;breather valve tag;tag number;equipment tag',
'C|3|owner_operator|Owner / Operator|Identification||owner;operator;owner operator;company;client',
'D|4|location_platform|Location / Platform|Identification||location;platform;area;plant location;installation unit',
'E|5|bvv_type|BVV Type|General Data||BVV type;BV type;breather valve type;valve type',
'F|6|serial_number|Serial No.|General Data||serial number;serial no;S/N',
'G|7|manufacturer|Manufacturer|General Data||manufacturer;maker;vendor;OEM;brand',
'H|8|model|Model|General Data||model;model number;model no',
'I|9|year_built|Built|Year||year built;built year;manufacturing year;year of manufacture',
'J|10|used|Used|Year||used;service status;in service;operating status',
'K|11|actual_inspection|Actual Inspection|Year||actual inspection year;test year;inspection year',
'L|12|actual_inspection_date|Actual Date|Year||test date;date of test;tanggal pengujian;tanggal pemeriksaan keselamatan',
'M|13|bvv_size_inch|Size (Inch)|BVV Size (inch)||BVV size;BV size;valve size;nominal size',
'N|14|bvv_rating|Rating|BVV Size (inch)||rating;flange rating;pressure class',
'O|15|opening_pressure|Pressure|Pressure||opening pressure;tekanan buka;setting pressure',
'P|16|vacuum_pressure|Vacuum|Pressure||vacuum pressure;suction pressure;tekanan isap;vacuum setting',
'Q|17|test_media|Media|Pressure||test media;media untuk pengujian;media',
'R|18|overpressure_scenario|Overpressure Scenario|Pressure||overpressure scenario;relieving scenario',
'S|19|protected_equipment_type|Type Equipment|Equipment Protected||type equipment;equipment protected;protected equipment;jenis peralatan yang dilindungi',
'T|20|protected_equipment_item_no|No Item|Equipment Protected||no item;item number;item no;nomor item',
'U|21|protected_equipment_temperature|Temperature|Equipment Protected||protected equipment temperature;temperature of protected equipment',
'V|22|protected_equipment_fluid|Fluida|Equipment Protected||fluid;process fluid;fluida',
'W|23|design_temperature|Design|Temperature||design temperature;temperatur desain',
'X|24|operating_temperature|Operating|Temperature||operating temperature;temperatur operasi',
'Y|25|design_pressure|Design|Pressure||protected equipment design pressure;design pressure;tekanan desain',
'Z|26|operating_pressure|Operating|Pressure||protected equipment operating pressure;operating pressure;tekanan operasi',
'AA|27|orifice_area_calculated|Calculated|Orifice Area||calculated orifice area;calculated area',
'AB|28|orifice_area_selected|Selected|Orifice Area||selected orifice area;selected area',
'AC|29|orifice_designation|Designation|Orifice Area||orifice designation;API designation',
'AD|30|required_capacity|Required|Capacity||required capacity;required flow',
'AE|31|rated_capacity|Rated Capacity|Capacity||rated capacity;certified capacity;relieving capacity'
];
const fields = rows.map(line => {
  const [column,index,key,label,group,auto,aliases] = line.split('|');
  return {column,index:Number(index),key,label,group,auto:auto==='1',aliases:aliases?aliases.split(';'):[]};
});
window.ARE_BVV_SCHEMA = {
  templateFile:'assets/templates/bvv-asset-register-template.xlsx',
  worksheet:'Sheet1',
  firstDataRow:5,
  totalTemplateColumns:31,
  expectedMergedRanges:18,
  expectedHeaderRows:4,
  fields
};
})();
