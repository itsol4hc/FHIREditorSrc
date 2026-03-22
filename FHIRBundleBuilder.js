/**
 * FHIRBundleBuilder.js
 * Tento soubor slouží k převodu dat mezi vizuálním textovým editorem (Quill)
 * a standardizovaným FHIR formátem (FHIR Document Bundle).
 * 
 * Co je to FHIR Document Bundle:
 * Představuje ucelený "Klinický dokument" (např. zpráva z vyšetření).
 * Skládá se z několika položek (entries):
 * 1. Composition - Hlavička dokumentu (Kdo, Kdy, O kom zapisoval) + HTML text zprávy.
 * 2. Patient - Údaje o pacientovi.
 * 3. Practitioner - Údaje o lékaři.
 * 4. Organization - Údaje o nemocnici.
 * 5. Observation(s) - Samotné záznamy (tlak, tep...), na které se Composition odkazuje.
 *
 * Dependencies: mockPatient.js, mockHealthCareProvider.js, FHIRTemplates.js
 */

const FHIRBundleBuilder = {

    /**
     * Sestaví kompletní FHIR Document Bundle z aktuálního obsahu editoru.
     * Tento proces probíhá při uložení nebo exportu.
     * 
     * @param {Quill} quill - Instance Quill editoru
     * @returns {object} FHIR Bundle ve formátu JSON objektu
     */
    buildBundle(quill) {
        const currentTime = new Date().toISOString();
        const compositionId = crypto.randomUUID();

        // --- 1. Generování HTML obsahu pro dokument ---
        // Extrahuje text z editoru a očistí ho o nepotřebné atributy
        const compositionHtml = this._buildCompositionHtml(quill);

        // --- 2. Sestavení zdroje Composition (Hlavička dokumentu) ---
        // Tento FHIR resource představuje samotný dokument (klinický zápis).
        // Definuje autora, pacienta a obsahuje HTML text (narrative).
        const compositionResource = {
            resourceType: "Composition",
            id: compositionId,
            meta: {
                profile: ["http://hl7.org/fhir/StructureDefinition/clinicaldocument"]
            },
            text: { // Narativní část - sem patří vygenerované HTML
                status: "generated",
                div: `<div xmlns="http://www.w3.org/1999/xhtml">${compositionHtml}</div>`
            },
            status: "final",
            type: {
                coding: [{
                    system: "http://loinc.org",
                    code: "11488-4",
                    display: "Consult note"
                }],
                text: "Klinický zápis"
            },
            subject: getPatientRef(), // Na koho se dokument vztahuje (Pacient)
            date: currentTime,
            author: [getPractitionerRef()], // Kdo dokument vytvořil (Lékař)
            title: "Klinický zápis",
            custodian: MOCK_HEALTHCARE_PROVIDER.organization.reference,
            // Sekce dokumentu - Composition může mít více sekcí (zde jen Vitální funkce)
            section: [{
                title: "Zjištěné hodnoty",
                code: {
                    coding: [{
                        system: "http://loinc.org",
                        code: "8716-3",
                        display: "Vital signs note"
                    }],
                    text: "Vitální funkce"
                },
                text: {
                    status: "generated",
                    div: '<div xmlns="http://www.w3.org/1999/xhtml">Vitální funkce zaznamenané v klinickém zápisu</div>'
                },
                entry: [] // Sem se následně vloží odkazy na jednotlivá měření (Observations)
            }]
        };

        // --- 3. Sestavení kostry Bundle (obálky) ---
        // Bundle typu 'document' vždy musí mít jako úplně první prvek 'Composition'.
        const fhirBundle = {
            resourceType: "Bundle",
            id: crypto.randomUUID(),
            meta: {
                lastUpdated: currentTime
            },
            identifier: {
                system: "urn:ietf:rfc:3986",
                value: `urn:uuid:${crypto.randomUUID()}`
            },
            type: "document",
            timestamp: currentTime,
            entry: [
                // First entry is always Composition
                {
                    fullUrl: `urn:uuid:${compositionId}`,
                    resource: compositionResource
                },
                // Patient
                {
                    fullUrl: `urn:uuid:${MOCK_PATIENT.uuid}`,
                    resource: MOCK_PATIENT.resource
                },
                // Practitioner
                {
                    fullUrl: `urn:uuid:${MOCK_HEALTHCARE_PROVIDER.practitioner.uuid}`,
                    resource: MOCK_HEALTHCARE_PROVIDER.practitioner.resource
                },
                // Organization
                {
                    fullUrl: `urn:uuid:${MOCK_HEALTHCARE_PROVIDER.organization.uuid}`,
                    resource: MOCK_HEALTHCARE_PROVIDER.organization.resource
                }
            ]
        };

        // --- 4. Iterace přes všechny interaktivní FHIR elementy v editoru ---
        // V HTML editoru jsou tyto elementy označeny třídou '.fhir-blot'.
        // Z každého elementu si přečteme uložená data (id, type záznamu a aktuální naměřenou hodnotu).
        const blots = quill.root.querySelectorAll('.fhir-blot');
        blots.forEach(blot => {
            const id = blot.getAttribute('data-id');
            const type = blot.getAttribute('data-type');
            const value = blot.getAttribute('data-value');
            const t = TEMPLATES[type];

            if (t && t.buildResource && value) {
                // Sestavení cesty (URN) unikátní v rámci dokumentu
                const resourceUrl = `urn:uuid:${id}`;
                
                // Zavolání funkce buildResource z dané šablony (definované v FHIRTemplates.js), 
                // která nám vygeneruje plnohodnotný JSON objekt v souladu s FHIR specifikací.
                const resource = t.buildResource(id, value, currentTime);

                // Add Narrative text for the resource
                resource.text = {
                    status: "generated",
                    div: `<div xmlns="http://www.w3.org/1999/xhtml">${t.formatDisplay(value)}</div>`
                };

                // Odkaz z hlavičky (Composition) na toto konkrétní měření
                compositionResource.section[0].entry.push({
                    reference: resourceUrl
                });

                // Přidání tohoto JSON zdroje jako další položky (entry) do fyzického Bundle
                fhirBundle.entry.push({
                    fullUrl: resourceUrl,
                    resource: resource
                });
            }
        });

        // If no observations, handle empty section properly
        if (compositionResource.section[0].entry.length === 0) {
            // FHIR does not allow empty arrays — remove entry and add emptyReason
            delete compositionResource.section[0].entry;
            compositionResource.section[0].emptyReason = {
                coding: [{
                    system: "http://terminology.hl7.org/CodeSystem/list-empty-reason",
                    code: "nilknown",
                    display: "Nil Known"
                }],
                text: "Žádné záznamy"
            };
        }

        return fhirBundle;
    },

    /**
     * Build sanitized HTML for Composition.text.div.
     * Preserves class (FHIR ResourceType) and id (FHIR uuid) on fhir-blot spans/divs.
     * Removes editor-only attributes.
     */
    _buildCompositionHtml(quill) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = quill.root.innerHTML.replace(/\uFEFF/g, '');

        const allElements = tempDiv.querySelectorAll('*');
        allElements.forEach(el => {
            // For FHIR blot elements: keep class (resource type) and id, remove editor attrs
            if (el.classList.contains('fhir-blot')) {
                const fhirType = el.getAttribute('data-type');
                const fhirId = el.getAttribute('data-id');
                const template = TEMPLATES[fhirType];
                const resourceType = template ? template.fhirResourceType : 'Observation';

                // Remove ALL attributes first
                const attrNames = Array.from(el.attributes).map(a => a.name);
                attrNames.forEach(name => el.removeAttribute(name));

                // Set only the meaningful ones
                el.setAttribute('class', resourceType);
                el.setAttribute('id', fhirId);
            } else {
                // For non-FHIR elements: strip all potentially problematic attributes
                el.removeAttribute('data-id');
                el.removeAttribute('data-type');
                el.removeAttribute('data-value');
                el.removeAttribute('contenteditable');
                // Keep class/id for standard HTML formatting (ql-indent etc.)
            }
        });

        // Ensure valid XHTML: <br> → <br/>
        let html = tempDiv.innerHTML.replace(/<br>/g, '<br/>');
        return html;
    },

    /**
     * Import a parsování již existujícího FHIR Bundle souboru zpět do vizuálního editoru.
     * Zastává funkci "Načíst dokument".
     *
     * Celý mechanismus funguje tak, že:
     * 1. Extrahujeme z Bundle klinický text (z Composition.text.div) a vložíme jej do skrytého divu.
     * 2. Iterujeme přes všechny Observation zdroje v dokumentu a snažíme se na základě LOINC
     *    kódů zjistit, ke které naší šabloně (z FHIRTemplates.js) měření patří.
     * 3. Projdeme všechny <span> v klinickém textu, najdeme ty, jejichž ID odpovídá některé Observation,
     *    a podle příslušné šablony obnovíme třídu `fhir-blot` a datové atributy nutné k editaci.
     */
    importBundle(quill, bundleJson) {
        const bundle = typeof bundleJson === 'string' ? JSON.parse(bundleJson) : bundleJson;

        const composition = bundle.entry?.find(
            e => e.resource?.resourceType === "Composition"
        )?.resource;

        if (!composition || !composition.text || !composition.text.div) {
            throw new Error('Nenalezen platný Composition text ve FHIR Bundle.');
        }

        // Build a map of resource id → { type key, value }
        const resourceMap = {};
        bundle.entry?.forEach(entry => {
            const res = entry.resource;
            if (!res || res.resourceType !== 'Observation') return;

            // Find which template matches this resource (by LOINC code)
            for (const [key, tmpl] of Object.entries(TEMPLATES)) {
                const resCoding = res.code?.coding?.[0];
                const tmplCoding = tmpl.buildResource('test', '1', '2000-01-01').code?.coding?.[0];
                if (resCoding && tmplCoding && resCoding.code === tmplCoding.code) {
                    // Extract value
                    let value = '';
                    if (key === 'bp') {
                        const sys = res.component?.[0]?.valueQuantity?.value;
                        const dia = res.component?.[1]?.valueQuantity?.value;
                        value = `${sys || ''}/${dia || ''}`;
                    } else {
                        value = res.valueQuantity?.value?.toString() || '';
                    }
                    resourceMap[res.id] = { templateKey: key, value: value };
                    break;
                }
            }
        });

        // Parse composition HTML
        let rawHtml = composition.text.div;
        rawHtml = rawHtml.replace(/^<div xmlns="http:\/\/www\.w3\.org\/1999\/xhtml">/, '').replace(/<\/div>$/, '');

        // Restore fhir-blot attributes from resourceMap
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rawHtml;

        // Find elements whose class matches a FHIR resource type (Observation etc.)
        const resourceTypeNames = new Set(Object.values(TEMPLATES).map(t => t.fhirResourceType));

        tempDiv.querySelectorAll('*').forEach(el => {
            const classList = Array.from(el.classList);
            const matchedType = classList.find(c => resourceTypeNames.has(c));

            if (matchedType && el.id && resourceMap[el.id]) {
                const info = resourceMap[el.id];
                // Reconstruct fhir-blot
                el.setAttribute('class', `fhir-blot ${matchedType}${!info.value ? ' empty' : ''}`);
                el.setAttribute('data-id', el.id);
                el.setAttribute('data-type', info.templateKey);
                el.setAttribute('data-value', info.value);
                el.setAttribute('contenteditable', 'false');

                // Re-render display
                const tmpl = TEMPLATES[info.templateKey];
                if (tmpl) {
                    el.innerHTML = tmpl.formatDisplay(info.value);
                }
            }
        });

        quill.root.innerHTML = tempDiv.innerHTML;
    },

    /**
     * Stringify a bundle with nice formatting
     */
    toJson(bundle) {
        return JSON.stringify(bundle, null, 2);
    },

    /**
     * Download JSON as file
     */
    downloadBundle(bundle) {
        const json = this.toJson(bundle);
        const blob = new Blob([json], { type: 'application/fhir+json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `klinicky_zaznam_fhir_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }
};
