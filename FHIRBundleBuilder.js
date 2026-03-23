/**
 * FHIRBundleBuilder.js
 * Převod dat mezi vizuálním textovým editorem (Quill) a FHIR Document Bundle.
 * 
 * Co je to FHIR Document Bundle:
 * Představuje ucelený "Klinický dokument" (např. zpráva z vyšetření).
 * Skládá se z několika položek (entries):
 * 1. Composition - Hlavička dokumentu + HTML text + sekce (section).
 * 2. Patient - Údaje o pacientovi.
 * 3. Practitioner - Údaje o lékaři.
 * 4. Organization - Údaje o nemocnici.
 * 5. Observation(s) - Samotné záznamy (tlak, tep...), na které se sekce odkazují.
 *
 * Dependencies: mockPatient.js, mockHealthCareProvider.js, FHIRTemplates.js
 */

const FHIRBundleBuilder = {

    /**
     * Sestaví kompletní FHIR Document Bundle z aktuálního obsahu editoru.
     * Dynamicky generuje Composition.section[] na základě SectionBlot elementů.
     * 
     * @param {Quill} quill - Instance Quill editoru
     * @returns {object} FHIR Bundle ve formátu JSON objektu
     */
    buildBundle(quill) {
        const currentTime = new Date().toISOString();
        const compositionId = crypto.randomUUID();

        // --- 1. Generování HTML obsahu ---
        const compositionHtml = this._buildCompositionHtml(quill);

        // --- 2. Analýza sekcí a resources v editoru ---
        const sectionTree = this._buildSectionTree(quill, currentTime);

        // --- 3. Sestavení Composition ---
        const compositionResource = {
            resourceType: "Composition",
            id: compositionId,
            meta: {
                profile: ["http://hl7.org/fhir/StructureDefinition/clinicaldocument"]
            },
            text: {
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
            subject: getPatientRef(),
            date: currentTime,
            author: [getPractitionerRef()],
            title: "Klinický zápis",
            custodian: MOCK_HEALTHCARE_PROVIDER.organization.reference,
            section: sectionTree.sections
        };

        // Pokud nejsou žádné sekce, odstraníme prázdný array
        if (compositionResource.section.length === 0) {
            delete compositionResource.section;
        }

        // --- 4. Sestavení Bundle ---
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
                {
                    fullUrl: `urn:uuid:${compositionId}`,
                    resource: compositionResource
                },
                {
                    fullUrl: `urn:uuid:${MOCK_PATIENT.uuid}`,
                    resource: MOCK_PATIENT.resource
                },
                {
                    fullUrl: `urn:uuid:${MOCK_HEALTHCARE_PROVIDER.practitioner.uuid}`,
                    resource: MOCK_HEALTHCARE_PROVIDER.practitioner.resource
                },
                {
                    fullUrl: `urn:uuid:${MOCK_HEALTHCARE_PROVIDER.organization.uuid}`,
                    resource: MOCK_HEALTHCARE_PROVIDER.organization.resource
                }
            ]
        };

        // Přidáme všechny resource entries do Bundle
        sectionTree.allResources.forEach(res => {
            fhirBundle.entry.push({
                fullUrl: res.fullUrl,
                resource: res.resource
            });
        });

        return fhirBundle;
    },

    /**
     * Analyzuje editor a vytvoří strom sekcí s přiřazenými resources.
     * Prochází Delta operace hledá section a resource embedy.
     * 
     * @returns {{ sections: object[], allResources: object[] }}
     */
    _buildSectionTree(quill, currentTime) {
        const delta = quill.getContents();
        const allResources = [];
        
        // Stav: seznam sekcí a aktuální zásobník pro zanořování
        const rootSections = [];
        const sectionStack = []; // Stack pro tracking aktuální sekce (pro nesting)
        let currentSectionEntries = []; // Entries pro aktuální sekci (nebo root)

        // Projdeme všechny delta operace
        delta.ops.forEach(op => {
            if (!op.insert || typeof op.insert !== 'object') return;

            // Nalezena sekce
            if (op.insert['fhir-section']) {
                const secData = op.insert['fhir-section'];
                const sectionDef = SECTIONS[secData.sectionType];
                if (!sectionDef || secData.sectionType === 'general') return;

                const level = parseInt(secData.level) || 0;

                const fhirSection = {
                    title: sectionDef.label,
                    code: {
                        coding: [sectionDef.code],
                        text: sectionDef.label
                    },
                    text: {
                        status: "generated",
                        div: `<div xmlns="http://www.w3.org/1999/xhtml">${sectionDef.description}</div>`
                    },
                    entry: [],
                    section: [], // Pro zanořené sekce
                    _level: level // Interní atribut, odstraníme před exportem
                };

                // Zařazení sekce do stromu dle level
                if (level === 0) {
                    // Přidáme předchozí "volné" entries do výchozí sekce pokud existují
                    if (currentSectionEntries.length > 0 && sectionStack.length === 0) {
                        // Resources bez sekce — vytvoříme implicitní top-level sekci
                        rootSections.push(this._createDefaultSection(currentSectionEntries));
                        currentSectionEntries = [];
                    }
                    rootSections.push(fhirSection);
                    sectionStack.length = 0;
                    sectionStack.push(fhirSection);
                    currentSectionEntries = fhirSection.entry;
                } else {
                    // Zanořená sekce: hledáme rodiče dle level
                    while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1]._level >= level) {
                        sectionStack.pop();
                    }
                    if (sectionStack.length > 0) {
                        const parent = sectionStack[sectionStack.length - 1];
                        parent.section.push(fhirSection);
                    } else {
                        rootSections.push(fhirSection);
                    }
                    sectionStack.push(fhirSection);
                    currentSectionEntries = fhirSection.entry;
                }
            }

            // Nalezen resource (FHIR blot)
            if (op.insert['fhir-resource']) {
                const resData = op.insert['fhir-resource'];
                const tmpl = TEMPLATES[resData.type];
                if (!tmpl || !tmpl.buildResource || !resData.value) return;

                const resourceUrl = `urn:uuid:${resData.id}`;
                const resource = tmpl.buildResource(resData.id, resData.value, currentTime);
                resource.text = {
                    status: "generated",
                    div: `<div xmlns="http://www.w3.org/1999/xhtml">${tmpl.formatDisplay(resData.value)}</div>`
                };

                // Přidáme referenci do aktuální sekce
                currentSectionEntries.push({ reference: resourceUrl });

                // Přidáme resource do globálního seznamu pro Bundle entries
                allResources.push({ fullUrl: resourceUrl, resource: resource });
            }
        });

        // Zbylé volné resources (po poslední sekci nebo bez sekce vůbec)
        if (currentSectionEntries.length > 0 && sectionStack.length === 0 && currentSectionEntries !== rootSections[rootSections.length - 1]?.entry) {
            rootSections.push(this._createDefaultSection(currentSectionEntries));
        }

        // Vyčistíme interní atributy a prázdné arrays
        this._cleanSectionTree(rootSections);

        return { sections: rootSections, allResources };
    },

    /**
     * Vytvoří výchozí FHIR sekci pro resources bez přiřazené sekce.
     */
    _createDefaultSection(entries) {
        return {
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
            entry: entries
        };
    },

    /**
     * Vyčistí strom sekcí — odstraní interní atributy a prázdné arrays.
     */
    _cleanSectionTree(sections) {
        sections.forEach(sec => {
            delete sec._level;
            
            // FHIR nedovoluje prázdné arrays
            if (sec.entry && sec.entry.length === 0) {
                delete sec.entry;
            }
            if (sec.section && sec.section.length === 0) {
                delete sec.section;
            } else if (sec.section) {
                this._cleanSectionTree(sec.section);
            }
            
            // Pokud nemá entry ani section, přidáme emptyReason
            if (!sec.entry && !sec.section) {
                sec.emptyReason = {
                    coding: [{
                        system: "http://terminology.hl7.org/CodeSystem/list-empty-reason",
                        code: "nilknown",
                        display: "Nil Known"
                    }],
                    text: "Žádné záznamy"
                };
            }
        });
    },

    /**
     * Build sanitized HTML for Composition.text.div.
     * Preserves class (FHIR ResourceType) and id (FHIR uuid) on fhir-blot spans.
     * Converts section blots to semantic HTML sections.
     */
    _buildCompositionHtml(quill) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = quill.root.innerHTML.replace(/\uFEFF/g, '');

        const allElements = tempDiv.querySelectorAll('*');
        allElements.forEach(el => {
            // FHIR blot elementy
            if (el.classList.contains('fhir-blot')) {
                const fhirType = el.getAttribute('data-type');
                const fhirId = el.getAttribute('data-id');
                const template = TEMPLATES[fhirType];
                const resourceType = template ? template.fhirResourceType : 'Observation';

                const attrNames = Array.from(el.attributes).map(a => a.name);
                attrNames.forEach(name => el.removeAttribute(name));

                el.setAttribute('class', resourceType);
                el.setAttribute('id', fhirId);
            }
            // Section bloty — převod na sémantický HTML
            else if (el.classList.contains('fhir-section')) {
                const sType = el.getAttribute('data-section-type');
                const sectionDef = SECTIONS[sType];
                
                if (sectionDef && sType !== 'general') {
                    const h3 = document.createElement('h3');
                    h3.textContent = sectionDef.label;
                    h3.className = 'section-title';
                    el.replaceWith(h3);
                } else {
                    el.remove();
                }
            }
            else {
                // Non-FHIR elements: clean editor attributes
                el.removeAttribute('data-id');
                el.removeAttribute('data-type');
                el.removeAttribute('data-value');
                el.removeAttribute('data-section-type');
                el.removeAttribute('data-section-id');
                el.removeAttribute('data-section-level');
                el.removeAttribute('contenteditable');
            }
        });

        // Remove section controls from output
        tempDiv.querySelectorAll('.section-controls, .section-header, .section-label').forEach(el => el.remove());

        let html = tempDiv.innerHTML.replace(/<br>/g, '<br/>');
        return html;
    },

    /**
     * Import FHIR Bundle zpět do vizuálního editoru.
     * Rekonstruuje sekce i FHIR bloty.
     */
    importBundle(quill, bundleJson) {
        const bundle = typeof bundleJson === 'string' ? JSON.parse(bundleJson) : bundleJson;

        const composition = bundle.entry?.find(
            e => e.resource?.resourceType === "Composition"
        )?.resource;

        if (!composition || !composition.text || !composition.text.div) {
            throw new Error('Nenalezen platný Composition text ve FHIR Bundle.');
        }

        // Build map: resource id → { template key, value }
        const resourceMap = {};
        bundle.entry?.forEach(entry => {
            const res = entry.resource;
            if (!res || res.resourceType !== 'Observation') return;

            for (const [key, tmpl] of Object.entries(TEMPLATES)) {
                const resCoding = res.code?.coding?.[0];
                const tmplCoding = tmpl.buildResource('test', '1', '2000-01-01').code?.coding?.[0];
                if (resCoding && tmplCoding && resCoding.code === tmplCoding.code) {
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

        // Restore fhir-blot attributes
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rawHtml;

        const resourceTypeNames = new Set(Object.values(TEMPLATES).map(t => t.fhirResourceType));

        tempDiv.querySelectorAll('*').forEach(el => {
            const classList = Array.from(el.classList);
            const matchedType = classList.find(c => resourceTypeNames.has(c));

            if (matchedType && el.id && resourceMap[el.id]) {
                const info = resourceMap[el.id];
                el.setAttribute('class', `fhir-blot ${matchedType}${!info.value ? ' empty' : ''}`);
                el.setAttribute('data-id', el.id);
                el.setAttribute('data-type', info.templateKey);
                el.setAttribute('data-value', info.value);
                el.setAttribute('contenteditable', 'false');

                const tmpl = TEMPLATES[info.templateKey];
                if (tmpl) {
                    el.innerHTML = tmpl.formatDisplay(info.value);
                }
            }
        });

        // Rekonstrukce sekcí z Composition.section
        if (composition.section) {
            this._reconstructSections(tempDiv, composition.section, 0);
        }

        quill.root.innerHTML = tempDiv.innerHTML;
    },

    /**
     * Rekonstruuje SectionBlot elementy z Composition.section stromu.
     * Vkládá section dividers na začátek obsahu.
     */
    _reconstructSections(containerDiv, sections, level) {
        if (!sections || sections.length === 0) return;

        sections.forEach(sec => {
            // Najdeme odpovídající definici sekce dle LOINC kódu
            const sectionCode = sec.code?.coding?.[0]?.code;
            let sectionDef = null;
            let sectionKey = null;
            
            for (const [key, def] of Object.entries(SECTIONS)) {
                if (def.code.code === sectionCode) {
                    sectionDef = def;
                    sectionKey = key;
                    break;
                }
            }

            if (sectionDef && sectionKey !== 'general') {
                const sectionId = crypto.randomUUID();
                const sectionDiv = document.createElement('div');
                sectionDiv.className = 'fhir-section';
                sectionDiv.setAttribute('data-section-type', sectionKey);
                sectionDiv.setAttribute('data-section-id', sectionId);
                sectionDiv.setAttribute('data-section-level', level);
                sectionDiv.setAttribute('contenteditable', 'false');

                if (sectionDef.color !== 'transparent') {
                    sectionDiv.style.backgroundColor = sectionDef.color;
                    sectionDiv.style.borderColor = sectionDef.borderColor;
                } else {
                    sectionDiv.classList.add('section-general');
                }
                if (level > 0) {
                    sectionDiv.style.marginLeft = `${level * 20}px`;
                }

                sectionDiv.innerHTML = `
                    <div class="section-header">
                        <span class="section-label">
                            <i class="fa-solid ${sectionDef.icon}"></i> ${sectionDef.label}
                        </span>
                        <span class="section-controls">
                            <button class="section-btn" data-action="change" title="Změnit typ sekce">
                                <i class="fa-solid fa-right-left"></i>
                            </button>
                            <button class="section-btn" data-action="unlink" title="Zrušit sekci (ponechat obsah)">
                                <i class="fa-solid fa-link-slash"></i>
                            </button>
                            <button class="section-btn section-btn-danger" data-action="delete" title="Odstranit sekci včetně obsahu">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </span>
                    </div>`;

                // Remove any <h3 class="section-title"> that was generated during export
                const h3s = containerDiv.querySelectorAll('h3.section-title');
                for (const h3 of h3s) {
                    if (h3.textContent.trim() === sectionDef.label) {
                        h3.replaceWith(sectionDiv);
                        break;
                    }
                }
                // If h3 wasn't found, prepend section div
                if (!sectionDiv.parentNode) {
                    containerDiv.appendChild(sectionDiv);
                }
            }

            // Rekurzivně zpracovat vnořené sekce
            if (sec.section) {
                this._reconstructSections(containerDiv, sec.section, level + 1);
            }
        });
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
