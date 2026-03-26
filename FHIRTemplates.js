/**
 * FHIRTemplates.js
 * Clinical data templates for FHIR resources.
 *
 * THIS FILE IS THE MAIN ENTRY POINT FOR ADDING NEW TYPES OF CLINICAL RECORDS (TEMPLATES).
 *
 * What is FHIR (Fast Healthcare Interoperability Resources):
 * A modern standard for exchanging healthcare information. Data is represented
 * as "Resources" in JSON format. In this editor, we primarily work with the
 * `Observation` resource type (e.g., blood pressure, temperature, etc.).
 *
 * How a template works:
 * Each template in the `TEMPLATES` object defines:
 * 1. Discoverability and name (label, keywords, icon).
 * 2. How an entered value is transformed into a valid FHIR JSON (buildResource).
 * 3. How the value is rendered in the text editor (formatDisplay).
 * 4. The HTML template for the floating entry form (renderInput).
 * 5. How the raw text value is extracted from the form (getValue).
 *
 * If you want to add a new template (e.g., 'Blood Sugar'), copy an existing one (e.g., 'temp'),
 * change its key ('glucose') and adjust LOINC codes, units, and appearance via the functions.
 *
 * Dependencies: mockPatient.js, mockHealthCareProvider.js (must be loaded before this file)
 */

// --- Shared coding constants ---
// FHIR often requires categorizing resources (e.g., classifying a pulse as "Vital Signs").
// The vital signs category is configured here according to the current FHIR standard.
const VITAL_SIGNS_CATEGORY = [{
    coding: [{
        system: "http://terminology.hl7.org/CodeSystem/observation-category",
        code: "vital-signs",
        display: "Vital Signs"
    }]
}];

// Reference to a FHIR profile determining the structure for an Observation resource within vital signs.
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
 * The TEMPLATES object contains definitions of all supported clinical data points.
 * The key (e.g., 'bp', 'temp') serves as a unique identifier within the system.
 */
const TEMPLATES = {
    'bp': {
        // id: Unique template ID (must match the structural key)
        id: 'bp',
        // label: UI label shown to the user in the suggestion box and form
        label: 'TK',
        // icon: FontAwesome class icon used in UI rendering
        icon: 'fa-heart-pulse',
        // keywords: Search parameters users can type to pull up this template
        keywords: ['tk', 'tlak', 'krevni tlak', 'krevní tlak'],
        // fhirResourceType: The FHIR resource type used. Most often 'Observation'
        fhirResourceType: 'Observation',
        
        // buildResource: A function building the final hierarchical FHIR JSON object.
        // Accepts a resource UUID ('id'), the raw text value ('value'), and the recording time ('time').
        buildResource: (id, value, time) => {
            const vals = (value || '').split('/');
            return {
                resourceType: "Observation", // Declaring the FHIR Resource type
                id: id,                      // Unique Document UUID
                meta: { profile: [OBSERVATION_PROFILE_VITALSIGNS] }, // Required valid profile
                status: "final",             // Status ('final' indicates a completed, valid entry)
                category: VITAL_SIGNS_CATEGORY, // Target category (vital signs)
                code: {                      // WHAT is measured. Typically specified by LOINC standard
                    coding: [{
                        system: "http://loinc.org",
                        code: "85354-9",
                        display: "Blood pressure panel with all children optional"
                    }],
                    text: "Krevní tlak"
                },
                subject: getPatientRef(),    // WHO is the patient (MOCK Patient reference)
                effectiveDateTime: time,     // WHEN the measurement happened
                performer: [getPractitionerRef()], // WHO performed the measurement (Doctor reference)
                
                // An Observation can either hold a singular value ('valueQuantity' like 'temp' or 'pulse') 
                // or a composite value utilizing multiple parts. BP contains systole and diastole 
                // and therefore mandates an array inside the 'component' key.
                component: [
                    {
                        code: {
                            coding: [{
                                system: "http://loinc.org",
                                code: "8480-6",
                                display: "Systolic blood pressure"
                            }]
                        },
                        valueQuantity: {     // MEASURED VALUE AND UNIT for systole
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
                        valueQuantity: {     // MEASURED VALUE AND UNIT for diastole
                            value: parseFloat(vals[1]),
                            unit: "mmHg",
                            system: "http://unitsofmeasure.org",
                            code: "mm[Hg]"
                        }
                    }
                ]
            };
        },
        
        // formatDisplay: Defines the HTML visualization inside the text editor (Quill blot)
        // This text format will be used exactly as-is in the text-export payload (FHIR Narrative).
        formatDisplay: (val) => `<span title="krevní tlak">${val ? `TK: ${val} mmHg` : 'TK: ___/___ mmHg'}</span>`,
        
        // renderInput: Renders the HTML miniature form when clicked on in the UI popup.
        renderInput: (vals) => `
            <input type="text" class="min-input fhir-input" placeholder="Sys" value="${vals[0] || ''}">
            <span class="min-sep">/</span>
            <input type="text" class="min-input fhir-input" placeholder="Dia" value="${vals[1] || ''}">
            <span class="min-unit">mmHg</span>
        `,
        
        // getValue: Extracts the returned raw text value from the form after "Save" is clicked.
        // Will serve as the primary argument back into the `buildResource` and `formatDisplay` fields (e.g. "120/80").
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
            // Unlike blood pressure, pulse is a single data value, meaning 'valueQuantity'
            // is utilized here rather than the 'component' array. This pattern covers a vast 
            // majority of simple FHIR measurement resources.
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

// ====================================================================
// SECTIONS — Clinical sections definitions (Composition.section)
//
// Sections are block headers/separators within the editor. Content following
// a header gets grouped inside that section until another section is found
// or the document ends.
//
// Configuration:
// - allowedResources: types of FHIR resources permitted (['*'] = all)
// - allowedChildren:  types of sub-sections permitted (['*'] = all, [] = none)
// - allowSameTypeChild: allows nested sub-sections of identical types (default: false)
// - showInList: toggle section visibility within UI shortcut lists (e.g. F2) (default: true)
//
// How to add a new section:
// 1. Add a new key into the SECTIONS object.
// 2. Fill missing properties (id, label, icon, keywords, colors, allowedResources, LOINC code).
// 3. The section automatically appears dynamically inside the UI's F2 list menu.
// ====================================================================
const SECTIONS = {
    /**
     * General Section — Default text with no specific purpose.
     * Functions as the main level of the editor outside visual blocks.
     * Only appears in search if explicitly allowed via `allowedChildren` by the parent.
     */
    general: {
        id: 'general',
        label: 'Obecné',
        icon: 'fa-file-lines',
        keywords: ['obecné', 'obecne', 'general'],
        color: 'transparent',
        borderColor: 'transparent',
        allowedResources: ['*'],
        allowedChildren: ['*'],
        allowSameTypeChild: false,
        showInList: false,          // Do not show in the default UI list
        code: { system: 'http://loinc.org', code: '51848-0', display: 'Assessment note' },
        description: 'Obecná sekce — přijímá všechny typy resources'
    },

    /**
     * Subjective patient complaints.
     * Recommended future resources: Observation, QuestionnaireResponse
     */
    subjective: {
        id: 'subjective',
        label: 'Subj.',
        icon: 'fa-comment-medical',
        keywords: ['subj', 'subjektivně', 'subjektivne'],
        color: '#fef9c3',
        borderColor: '#fde047',
        allowedResources: [],
        allowedChildren: [],
        allowSameTypeChild: false,
        showInList: true,
        code: { system: 'http://loinc.org', code: '61150-9', display: 'Subjective' },
        description: 'Subjektivní obtíže — volný text, budoucí: Observation, QuestionnaireResponse'
    },

    /**
     * Objective medical findings.
     */
    objective: {
        id: 'objective',
        label: 'Obj.',
        icon: 'fa-stethoscope',
        keywords: ['obj', 'objektivně', 'objektivne'],
        color: '#dcfce7',
        borderColor: '#86efac',
        allowedResources: ['Observation'],
        allowedChildren: [],
        allowSameTypeChild: false,
        showInList: true,
        code: { system: 'http://loinc.org', code: '61149-1', display: 'Objective' },
        description: 'Objektivní nález — Observation'
    },

    /**
     * Current illness / History of present illness.
     * Future resources: Observation, ImagingStudy, DiagnosticReport
     */
    currentIllness: {
        id: 'currentIllness',
        label: 'NO',
        icon: 'fa-disease',
        keywords: ['no', 'nynější onemocnění', 'nynejsi onemocneni'],
        color: '#fce7f3',
        borderColor: '#f9a8d4',
        allowedResources: ['Observation'],
        allowedChildren: ['objective'],     // Objective embedded internally as a sub-section
        allowSameTypeChild: false,
        showInList: true,
        code: { system: 'http://loinc.org', code: '10164-2', display: 'History of present illness' },
        description: 'Nynější onemocnění — Observation, budoucí: ImagingStudy, DiagnosticReport'
    },

    /**
     * Epicrisis / Final outcome or summary.
     * Future resources: Observation, ImagingStudy, DiagnosticReport, Condition
     */
    epicrisis: {
        id: 'epicrisis',
        label: 'Epikríza',
        icon: 'fa-clipboard-check',
        keywords: ['epikriza', 'epikríza', 'souhrn'],
        color: '#e0e7ff',
        borderColor: '#a5b4fc',
        allowedResources: ['Observation'],
        allowedChildren: ['objective', 'therapy', 'conclusion'],
        allowSameTypeChild: false,
        showInList: true,
        code: { system: 'http://loinc.org', code: '11535-2', display: 'Hospital discharge Dx' },
        description: 'Epikríza — Observation, budoucí: ImagingStudy, DiagnosticReport, Condition'
    },

    /**
     * Therapy / Conducted medical procedures.
     * Future resources: Procedure, MedicationRequest, MedicationAdministration
     */
    therapy: {
        id: 'therapy',
        label: 'Výkony',
        icon: 'fa-syringe',
        keywords: ['terapie', 'výkony', 'vykony'],
        color: '#fef3c7',
        borderColor: '#fbbf24',
        allowedResources: [],
        allowedChildren: [],
        allowSameTypeChild: false,
        showInList: true,
        code: { "system": "http://loinc.org", "code": "29554-3", "display": "Procedure Narrative" },
        description: 'Provedené výkony — budoucí: Procedure, MedicationRequest, MedicationAdministration'
    },

    /**
     * Conclusion.
     * Future resources: Condition, ClinicalImpression
     */
    conclusion: {
        id: 'conclusion',
        label: 'Závěr',
        icon: 'fa-circle-check',
        keywords: ['záver', 'závěr', 'zaver'],
        color: '#f3e8ff',
        borderColor: '#c084fc',
        allowedResources: [],
        allowedChildren: [],
        allowSameTypeChild: false,
        showInList: true,
        code: { system: 'http://loinc.org', code: '55110-1', display: 'Conclusions [Interpretation] Document' },
        description: 'Závěr — budoucí: Condition, ClinicalImpression'
    },

    /**
     * Recommendations / Care Plans.
     * Future resources: CarePlan, ServiceRequest
     */
    recommendation: {
        id: 'recommendation',
        label: 'Doporučení',
        icon: 'fa-hand-point-right',
        keywords: ['doporučení', 'doporuceni', 'plan'],
        color: '#ccfbf1',
        borderColor: '#5eead4',
        allowedResources: [],
        allowedChildren: [],
        allowSameTypeChild: false,
        showInList: true,
        code: { system: 'http://loinc.org', code: '18776-5', display: 'Plan of care note' },
        description: 'Doporučení — budoucí: CarePlan, ServiceRequest'
    }
};
