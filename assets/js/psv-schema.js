/* DTP PSV Asset Register map: based on DTP_PSV_Asset_Register(2).xlsx (37 columns A:AK). */
(()=> {
const rows=[
'A|1|record_no|No.|Identification|1|',
'B|2|tag_psv|Tag PSV|Identification||PSV tag;tag number;equipment tag;tag no;equipment number;tag id;safety valve tag',
'C|3|owner_operator|Owner / Operator|Identification||owner;operator;owner operator;company;client',
'D|4|location_platform|Location / Platform|Identification||location;platform;area;plant location;equipment location;installation unit;unit;plant unit;process unit',
'E|5|psv_type|PSV Type|General Data||PSV type;valve type;safety valve type;type',
'F|6|serial_number|Serial No.|General Data||serial number;serial no;S/N;SN;serial',
'G|7|manufacturer|Manufacturer|General Data||manufacturer;maker;vendor;OEM;brand',
'H|8|model|Model|General Data||model;model number;model no',
'I|9|year_built|Year Built|Year||year built;built year;manufacturing year;MFG year;year of manufacture',
'J|10|date_built|Date Built|Year||date built;manufacture date;manufacturing date;date of manufacture',
'K|11|used|Used|Year||used;service status;in service;operating status',
'L|12|actual_inspection|Actual Inspection|Year||actual inspection year;inspection year;year of safety inspection;year pemeriksaan keselamatan;tahun pemeriksaan keselamatan;actual insp',
'M|13|actual_inspection_date|Actual Date|Year||actual inspection date;safety inspection date;date of safety inspection;tanggal pemeriksaan keselamatan;act date;inspection date actual',
'N|14|psv_size_inch|Size (Inch)|PSV Size (inch)||PSV size;size;valve size;nominal size;size inch',
'O|15|inlet_inch|Inlet (Inch)|PSV Size (inch)||inlet size;inlet;inlet inch;inlet connection size',
'P|16|inlet_rating|Rating (Inlet)|PSV Size (inch)||inlet rating;inlet flange rating;inlet class;inlet pressure class',
'Q|17|outlet_inch|Outlet (Inch)|PSV Size (inch)||outlet size;outlet;outlet inch;outlet connection size',
'R|18|outlet_rating|Rating (Outlet)|PSV Size (inch)||outlet rating;outlet flange rating;outlet class;outlet pressure class',
'S|19|outlet_rating_lbs|Rating (lbs)|PSV Size (inch)||rating lbs;flange rating pair;inlet x outlet rating;rating inlet outlet;class rating lbs',
'T|20|design_pressure|Design|Pressure||design pressure;design press;design pressure kg/cm2',
'U|21|mawp|MAWP|Pressure||MAWP;maximum allowable working pressure;maximum working pressure',
'V|22|setting_pressure|Setting|Pressure||set pressure;setting pressure;set point;setpoint;spring setting',
'W|23|operating_pressure|Operating|Pressure||operating pressure;normal operating pressure;working pressure',
'X|24|date_inspection|Date Inspection|Previous Inspection||date inspection;previous inspection date;last inspection date;inspection date',
'Y|25|back_pressure|Back Pressure|Previous Inspection||back pressure;superimposed back pressure;built up back pressure',
'Z|26|pop_test|Pop Test|Previous Inspection||pop test;pop pressure;pop test result',
'AA|27|leak_test|Leak Test|Previous Inspection||leak test;leakage test;seat leakage test',
'AB|28|overpressure_scenario_previous|Overpressure Scenario|Previous Inspection||previous overpressure scenario;overpressure scenario;relieving scenario;contingency;overpressure case',
'AC|29|design_temperature_c|Design (°C)|Temperature||design temperature C;design temperature Celsius;design temp C',
'AD|30|operating_temperature_c|Operating (°C)|Temperature||operating temperature C;operating temperature Celsius;operating temp C',
'AE|31|design_temperature_f|Design (°F)|Temperature||design temperature F;design temperature Fahrenheit;design temp F',
'AF|32|operating_temperature_f|Operating (°F)|Temperature||operating temperature F;operating temperature Fahrenheit;operating temp F',
'AG|33|orifice_area_calculated|Calculated|Orifice Area||calculated orifice area;calculated area;orifice area calculated',
'AH|34|orifice_area_selected|Selected|Orifice Area||selected orifice area;selected area;orifice area selected',
'AI|35|orifice_designation|Designation|Orifice Area||orifice designation;designation;API orifice designation',
'AJ|36|required_capacity|Required|Capacity||required capacity;required capacity kg/hr;required flow;required rate',
'AK|37|rated_capacity|Rated Capacity|Capacity||rated capacity;certified capacity;rated capacity kg/hr;relieving capacity'
];
const fields=rows.map(line=>{const [column,index,key,label,group,auto,aliases]=line.split('|');return{column,index:Number(index),key,label,group,auto:auto==='1',aliases:aliases?aliases.split(';'):[]}});
window.ARE_PSV_SCHEMA={templateFile:'assets/templates/asset-register-template.xlsx',worksheet:'Sheet1',firstDataRow:5,totalTemplateColumns:37,expectedMergedRanges:18,fields};
})();