/**
 * FHIRTemplates.js
 * Klinické datové šablony pro FHIR zdroje (resources).
 *
 * TENTO SOUBOR JE HLAVNÍM MÍSTEM PRO PŘIDÁVÁNÍ NOVÝCH TYPŮ ZÁZNAMŮ (ŠABLON).
 * 
 * Co je to FHIR (Fast Healthcare Interoperability Resources):
 * Moderní standard pro výměnu zdravotnických informací. Data jsou reprezentována
 * jako "Zdroje" (Resources) ve formátu JSON. V tomto editoru nejčastěji pracujeme
 * se zdrojem typu `Observation` (Pozorování/Měření - např. krevní tlak, teplota).
 *
 * Jak funguje šablona:
 * Každá šablona v objektu `TEMPLATES` definuje:
 * 1. Jak se záznam jmenuje a hledá (label, keywords, icon)
 * 2. Jak se z hodnoty (zadané uživatelem) vytvoří platný FHIR JSON (buildResource)
 * 3. Jak se hodnota zobrazí v textovém editoru (formatDisplay)
 * 4. Jak vypadá zadávací formulář v plovoucím okně (renderInput)
 * 5. Jak se z formuláře získá surová textová hodnota (getValue)
 *
 * Chcete-li přidat novou šablonu (např. 'Hladina cukru'), zkopírujte existující (např. 'temp'),
 * změňte její klíč ('glucose') a upravte LOINC kódy, jednotky a vzhled ve funkcích.
 *
 * Dependencies: mockPatient.js, mockHealthCareProvider.js (loaded before this file)
 */

// --- Shared coding constants ---
// FHIR často vyžaduje kategorizaci zdrojů (např. že tep patří do "Vital Signs").
// Zde je definována kategorie pro vitální funkce podle platného FHIR standardu.
const VITAL_SIGNS_CATEGORY = [{
    coding: [{
        system: "http://terminology.hl7.org/CodeSystem/observation-category",
        code: "vital-signs",
        display: "Vital Signs"
    }]
}];

// Odkaz na FHIR profil určující předepsanou strukturu pro Observation u vitálních funkcí.
const OBSERVATION_PROFILE_VITALSIGNS = "http://hl7.org/fhir/StructureDefinition/vitalsigns";

// --- Helper: shorthand references from mock data ---
function getPatientRef() {
    return MOCK_PATIENT.reference;
}

function getPractitionerRef() {
    return MOCK_HEALTHCARE_PROVIDER.practitioner.reference;
}

// --- Template definitions ---
/**
 * Objekt TEMPLATES obsahuje definice všech podporovaných klinických údajů.
 * Klíč (např. 'bp', 'temp') slouží jako unikátní identifikátor v systému.
 */
const TEMPLATES = {
    'bp': {
        // id: Unikátní ID šablony (musí odpovídat klíči struktury)
        id: 'bp',
        // label: Název zobrazený uživateli v našeptávači a formuláři
        label: 'TK',
        // icon: Ikona (třída FontAwesome) zobrazená v UI
        icon: 'fa-heart-pulse',
        // keywords: Klíčová slova, podle kterých editor hledá, když uživatel píše text
        keywords: ['tk', 'tlak', 'krevni tlak', 'krevní tlak'],
        // fhirResourceType: Typ FHIR zdroje - nejčastěji 'Observation' pro měření
        fhirResourceType: 'Observation',
        
        // buildResource: Funkce, která sestaví finální hierarchický FHIR JSON objekt.
        // Přijímá UUID zdroje ('id'), surovou textovou hodnotu ('value') a čas měření ('time').
        buildResource: (id, value, time) => {
            const vals = (value || '').split('/');
            return {
                resourceType: "Observation", // Deklarace typu FHIR zdroje
                id: id,                      // Unikátní UUID v rámci dokumentu
                meta: { profile: [OBSERVATION_PROFILE_VITALSIGNS] }, // Uvedení platného profilu
                status: "final",             // Stav - 'final' značí hotový platný záznam
                category: VITAL_SIGNS_CATEGORY, // Cílová kategorie (vitální funkce)
                code: {                      // CO SE MĚŘÍ. Typicky specifikováno standardem LOINC
                    coding: [{
                        system: "http://loinc.org",
                        code: "85354-9",
                        display: "Blood pressure panel with all children optional"
                    }],
                    text: "Krevní tlak"
                },
                subject: getPatientRef(),    // KDO je pacient (Reference na MOCK pacienta)
                effectiveDateTime: time,     // KDY bylo měření provedeno
                performer: [getPractitionerRef()], // KDO ho pořídil (Reference na lékaře)
                
                // Měření může mít buď jednoduchou hodnotu (valueQuantity - viz 'temp' / 'pulse'), 
                // nebo kompozitní hodnotu skládající se z více prvků. Tlak se skládá ze systoly a diastoly, 
                // proto využívá pole záznamů 'component'.
                component: [
                    {
                        code: {
                            coding: [{
                                system: "http://loinc.org",
                                code: "8480-6",
                                display: "Systolic blood pressure"
                            }]
                        },
                        valueQuantity: {     // NAMĚŘENÁ HODNOTA A JEDNOTKA pro systolu
                            value: parseFloat(vals[0]),
                            unit: "mmHg",
                            system: "http://unitsofmeasure.org",
                            code: "mm[Hg]"
                        }
                    },
                    {
                        code: {
                            coding: [{
                                system: "http://loinc.org",
                                code: "8462-4",
                                display: "Diastolic blood pressure"
                            }]
                        },
                        valueQuantity: {     // NAMĚŘENÁ HODNOTA A JEDNOTKA pro diastolu
                            value: parseFloat(vals[1]),
                            unit: "mmHg",
                            system: "http://unitsofmeasure.org",
                            code: "mm[Hg]"
                        }
                    }
                ]
            };
        },
        
        // formatDisplay: Funkce připravující HTML vizualizaci hodnoty do textového editoru (Quill blot).
        // Tento text se zároveň později exportuje do FHIR Bundle narativu.
        formatDisplay: (val) => `<span title="krevní tlak">${val ? `TK: ${val} mmHg` : 'TK: ___/___ mmHg'}</span>`,
        
        // renderInput: Vykreslí HTML editačního miniformuláře, když uživatel na záznam klikne.
        renderInput: (vals) => `
            <input type="text" class="min-input fhir-input" placeholder="Sys" value="${vals[0] || ''}">
            <span class="min-sep">/</span>
            <input type="text" class="min-input fhir-input" placeholder="Dia" value="${vals[1] || ''}">
            <span class="min-unit">mmHg</span>
        `,
        
        // getValue: Extrahuje vrácenou surovou hodnotu z editačního miniformuláře po kliknutí na Uložit.
        // Tato hodnota se předává do šablony (vrací např. "120/80")
        getValue: (container) => {
            const inps = container.querySelectorAll('input.fhir-input');
            if (!inps[0].value && !inps[1].value) return '';
            return `${inps[0].value}/${inps[1].value}`;
        }
    },

    'pulse': {
        id: 'pulse',
        label: 'Tep',
        icon: 'fa-wave-square',
        keywords: ['pulz', 'puls', 'tep', 'tepová frekvence'],
        fhirResourceType: 'Observation',
        buildResource: (id, value, time) => ({
            resourceType: "Observation",
            id: id,
            meta: { profile: [OBSERVATION_PROFILE_VITALSIGNS] },
            status: "final",
            category: VITAL_SIGNS_CATEGORY,
            code: {
                coding: [{
                    system: "http://loinc.org",
                    code: "8867-4",
                    display: "Heart rate"
                }],
                text: "Tepová frekvence"
            },
            subject: getPatientRef(),
            effectiveDateTime: time,
            performer: [getPractitionerRef()],
            // Na rozdíl od tlaku, tep představuje jednu jedinou hodnotu, a proto se nepoužívá
            // pole 'component', ale element 'valueQuantity'. Tímto způsobem je kódována a 
            // ukládána drtivá většina jednoduchých FHIR měření.
            valueQuantity: {
                value: parseFloat(value),
                unit: "/min",
                system: "http://unitsofmeasure.org",
                code: "/min"
            }
        }),
        formatDisplay: (val) => `<span title="tep">${val ? `TF: ${val}/min` : 'TF: ___/min'}</span>`,
        renderInput: (vals) => `
            <input type="text" class="min-input fhir-input" style="width: 50px;" placeholder="tep" value="${vals[0] || ''}">
            <span class="min-unit">/min</span>
        `,
        getValue: (container) => container.querySelector('input.fhir-input').value
    },

    'temp': {
        id: 'temp',
        label: 'Teplota',
        icon: 'fa-temperature-half',
        keywords: ['teplota', 'tt', 'tělesná teplota'],
        fhirResourceType: 'Observation',
        buildResource: (id, value, time) => ({
            resourceType: "Observation",
            id: id,
            meta: { profile: [OBSERVATION_PROFILE_VITALSIGNS] },
            status: "final",
            category: VITAL_SIGNS_CATEGORY,
            code: {
                coding: [{
                    system: "http://loinc.org",
                    code: "8310-5",
                    display: "Body temperature"
                }],
                text: "Tělesná teplota"
            },
            subject: getPatientRef(),
            effectiveDateTime: time,
            performer: [getPractitionerRef()],
            valueQuantity: {
                value: parseFloat(value),
                unit: "°C",
                system: "http://unitsofmeasure.org",
                code: "Cel"
            }
        }),
        formatDisplay: (val) => `<span title="teplota">${val ? `TT: ${val} °C` : 'TT: ___ °C'}</span>`,
        renderInput: (vals) => `
            <input type="text" class="min-input fhir-input" style="width: 55px;" placeholder="°C" value="${vals[0] || ''}">
            <span class="min-unit">°C</span>
        `,
        getValue: (container) => container.querySelector('input.fhir-input').value
    },

    'spo2': {
        id: 'spo2',
        label: 'SpO₂',
        icon: 'fa-lungs',
        keywords: ['spo2', 'saturace', 'kyslík', 'oxymetrie'],
        fhirResourceType: 'Observation',
        buildResource: (id, value, time) => ({
            resourceType: "Observation",
            id: id,
            meta: { profile: [OBSERVATION_PROFILE_VITALSIGNS] },
            status: "final",
            category: VITAL_SIGNS_CATEGORY,
            code: {
                coding: [{
                    system: "http://loinc.org",
                    code: "2708-6",
                    display: "Oxygen saturation in Arterial blood"
                }],
                text: "Saturace kyslíkem (SpO₂)"
            },
            subject: getPatientRef(),
            effectiveDateTime: time,
            performer: [getPractitionerRef()],
            valueQuantity: {
                value: parseFloat(value),
                unit: "%",
                system: "http://unitsofmeasure.org",
                code: "%"
            }
        }),
        formatDisplay: (val) => `<span title="SpO₂">${val ? `SpO₂: ${val} %` : 'SpO₂: ___ %'}</span>`,
        renderInput: (vals) => `
            <input type="text" class="min-input fhir-input" style="width: 50px;" placeholder="%" value="${vals[0] || ''}">
            <span class="min-unit">%</span>
        `,
        getValue: (container) => container.querySelector('input.fhir-input').value
    },

    'resp': {
        id: 'resp',
        label: 'Dechová frekvence',
        icon: 'fa-wind',
        keywords: ['dech', 'df', 'dechová frekvence', 'respirace'],
        fhirResourceType: 'Observation',
        buildResource: (id, value, time) => ({
            resourceType: "Observation",
            id: id,
            meta: { profile: [OBSERVATION_PROFILE_VITALSIGNS] },
            status: "final",
            category: VITAL_SIGNS_CATEGORY,
            code: {
                coding: [{
                    system: "http://loinc.org",
                    code: "9279-1",
                    display: "Respiratory rate"
                }],
                text: "Dechová frekvence"
            },
            subject: getPatientRef(),
            effectiveDateTime: time,
            performer: [getPractitionerRef()],
            valueQuantity: {
                value: parseFloat(value),
                unit: "/min",
                system: "http://unitsofmeasure.org",
                code: "/min"
            }
        }),
        formatDisplay: (val) => `<span title="dechová frekvence">${val ? `DF: ${val}/min` : 'DF: ___/min'}</span>`,
        renderInput: (vals) => `
            <input type="text" class="min-input fhir-input" style="width: 50px;" placeholder="DF" value="${vals[0] || ''}">
            <span class="min-unit">/min</span>
        `,
        getValue: (container) => container.querySelector('input.fhir-input').value
    },

    'height': {
        id: 'height',
        label: 'Výška',
        icon: 'fa-ruler-vertical',
        keywords: ['vyska', 'výška'],
        fhirResourceType: 'Observation',
        buildResource: (id, value, time) => ({
            resourceType: "Observation",
            id: id,
            meta: { profile: [OBSERVATION_PROFILE_VITALSIGNS] },
            status: "final",
            category: VITAL_SIGNS_CATEGORY,
            code: {
                coding: [{
                    system: "http://loinc.org",
                    code: "8302-2",
                    display: "Body height"
                }],
                text: "Tělesná výška"
            },
            subject: getPatientRef(),
            effectiveDateTime: time,
            performer: [getPractitionerRef()],
            valueQuantity: {
                value: parseFloat(value),
                unit: "cm",
                system: "http://unitsofmeasure.org",
                code: "cm"
            }
        }),
        formatDisplay: (val) => `<span title="výška">${val ? `výška ${val} cm` : 'výška ___ cm'}</span>`,
        renderInput: (vals) => `
            <input type="text" class="min-input fhir-input" style="width: 50px;" placeholder="cm" value="${vals[0] || ''}">
            <span class="min-unit">cm</span>
        `,
        getValue: (container) => container.querySelector('input.fhir-input').value
    },

    'weight': {
        id: 'weight',
        label: 'Váha',
        icon: 'fa-weight-scale',
        keywords: ['vaha', 'váha', 'hmotnost'],
        fhirResourceType: 'Observation',
        buildResource: (id, value, time) => ({
            resourceType: "Observation",
            id: id,
            meta: { profile: [OBSERVATION_PROFILE_VITALSIGNS] },
            status: "final",
            category: VITAL_SIGNS_CATEGORY,
            code: {
                coding: [{
                    system: "http://loinc.org",
                    code: "29463-7",
                    display: "Body weight"
                }],
                text: "Tělesná hmotnost"
            },
            subject: getPatientRef(),
            effectiveDateTime: time,
            performer: [getPractitionerRef()],
            valueQuantity: {
                value: parseFloat(value),
                unit: "kg",
                system: "http://unitsofmeasure.org",
                code: "kg"
            }
        }),
        formatDisplay: (val) => `<span title="váha">${val ? `váha ${val} kg` : 'váha ___ kg'}</span>`,
        renderInput: (vals) => `
            <input type="text" class="min-input fhir-input" style="width: 50px;" placeholder="kg" value="${vals[0] || ''}">
            <span class="min-unit">kg</span>
        `,
        getValue: (container) => container.querySelector('input.fhir-input').value
    },

    'bmi': {
        id: 'bmi',
        label: 'BMI',
        icon: 'fa-calculator',
        keywords: ['bmi', 'body mass index'],
        fhirResourceType: 'Observation',
        buildResource: (id, value, time) => ({
            resourceType: "Observation",
            id: id,
            meta: { profile: [OBSERVATION_PROFILE_VITALSIGNS] },
            status: "final",
            category: VITAL_SIGNS_CATEGORY,
            code: {
                coding: [{
                    system: "http://loinc.org",
                    code: "39156-5",
                    display: "Body mass index (BMI) [Ratio]"
                }],
                text: "BMI"
            },
            subject: getPatientRef(),
            effectiveDateTime: time,
            performer: [getPractitionerRef()],
            valueQuantity: {
                value: parseFloat(value),
                unit: "kg/m2",
                system: "http://unitsofmeasure.org",
                code: "kg/m2"
            }
        }),
        formatDisplay: (val) => `<span title="BMI">${val ? `BMI: ${val} kg/m²` : 'BMI: ___ kg/m²'}</span>`,
        renderInput: (vals) => `
            <input type="text" class="min-input fhir-input" style="width: 55px;" placeholder="BMI" value="${vals[0] || ''}">
            <span class="min-unit">kg/m²</span>
        `,
        getValue: (container) => container.querySelector('input.fhir-input').value
    },

    'waist': {
        id: 'waist',
        label: 'Obvod břicha',
        icon: 'fa-child-reaching',
        keywords: ['pas', 'obvod', 'bricho', 'břicho'],
        fhirResourceType: 'Observation',
        buildResource: (id, value, time) => ({
            resourceType: "Observation",
            id: id,
            meta: { profile: [OBSERVATION_PROFILE_VITALSIGNS] },
            status: "final",
            category: VITAL_SIGNS_CATEGORY,
            code: {
                coding: [{
                    system: "http://loinc.org",
                    code: "8280-0",
                    display: "Waist Circumference at umbilicus by Tape measure"
                }],
                text: "Obvod břicha"
            },
            subject: getPatientRef(),
            effectiveDateTime: time,
            performer: [getPractitionerRef()],
            valueQuantity: {
                value: parseFloat(value),
                unit: "cm",
                system: "http://unitsofmeasure.org",
                code: "cm"
            }
        }),
        formatDisplay: (val) => `<span title="obvod břicha">${val ? `OB: ${val} cm` : 'OB: ___ cm'}</span>`,
        renderInput: (vals) => `
            <input type="text" class="min-input fhir-input" style="width: 50px;" placeholder="cm" value="${vals[0] || ''}">
            <span class="min-unit">cm</span>
        `,
        getValue: (container) => container.querySelector('input.fhir-input').value
    }
};
