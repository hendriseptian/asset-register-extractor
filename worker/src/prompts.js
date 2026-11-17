export function buildExtractionPrompt(){
 return `You are an industrial engineering asset-register data extraction assistant.
Read the supplied PDF or image and extract equipment records.
Return ONLY valid JSON in this exact structure:
{"records":[{"tag_number":null,"equipment_name":null,"equipment_type":null,"manufacturer":null,"model_number":null,"serial_number":null,"year_built":null,"design_pressure":null,"design_temperature":null,"operating_pressure":null,"operating_temperature":null,"material":null,"capacity":null,"location":null,"_source_location":null,"_confidence":null}]}
Rules:
1. Extract only values explicitly visible in the document. Never guess or infer missing values.
2. Use null for unavailable values.
3. Preserve tag numbers, serial numbers, punctuation, leading zeros and units exactly as shown.
4. If the document contains multiple equipment records, return one object per equipment.
5. _source_location should identify page number and section/table when possible.
6. _confidence should be a number from 0 to 1 reflecting overall extraction confidence.
7. Do not convert units or normalize values.
8. Do not include explanatory prose or markdown fences.`;
}
