/**
 * FHIRBundleBuilder.js
 * Conversion of data between the visual text editor (Quill) and a FHIR Document Bundle.
 * 
 * What is a FHIR Document Bundle:
 * Represents a complete "Clinical Document" (e.g., an examination report).
 * It consists of several entries:
 * 1. Composition - Document header + HTML text + sections.
 * 2. Patient - Patient data.
 * 3. Practitioner - Doctor's data.
 * 4. Organization - Hospital/Clinic data.
 * 5. Observation(s) - The actual recorded values (blood pressure, pulse, etc.) that the sections reference.
 *
 * Dependencies: mockPatient.js, mockHealthCareProvider.js, FHIRTemplates.js
 */

const FHIRBundleBuilder = {

    /**
     * Builds a complete FHIR Document Bundle from the current editor content.
     * Dynamically generates Composition.section[] based on SectionBlot elements.
     * 
     * @param {Quill} quill - Quill editor instance
     * @returns {object} FHIR Bundle in JSON format
     */
    buildBundle(quill) {
        const currentTime = new Date().toISOString();
        const compositionId = crypto.randomUUID();

        // --- 1. HTML content generation ---
        const { fullHtml: compositionHtml, sectionsHtmlMap } = this._buildCompositionHtml(quill);

        // --- 2. Editor section and resource parsing ---
        const sectionTree = this._buildSectionTree(quill, currentTime, sectionsHtmlMap);

        // --- 3. Composition construction ---
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

        // If there are no sections, remove the empty array
        if (compositionResource.section.length === 0) {
            delete compositionResource.section;
        }

        // --- 4. Bundle construction ---
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

        // Add all resource entries to the Bundle
        sectionTree.allResources.forEach(res => {
            fhirBundle.entry.push({
                fullUrl: res.fullUrl,
                resource: res.resource
            });
        });

        return fhirBundle;
    },

    /**
     * Parses the editor layout and creates a section tree with assigned resources.
     * Iterates through Delta operations to find section and resource embeds.
     * 
     * @returns {{ sections: object[], allResources: object[] }}
     */
    _buildSectionTree(quill, currentTime, sectionsHtmlMap = {}) {
        const delta = quill.getContents();
        const allResources = [];
        
        // State: list of sections and current nesting stack
        const rootSections = [];
        const sectionStack = []; // Stack for tracking current section (for nesting)
        let currentSectionEntries = []; // Entries for current section (or root)

        // Iterate through all delta operations
        delta.ops.forEach(op => {
            if (!op.insert || typeof op.insert !== 'object') return;

            // Section found
            if (op.insert['fhir-section']) {
                const secData = op.insert['fhir-section'];
                const sectionDef = SECTIONS[secData.sectionType];
                if (!sectionDef || secData.sectionType === 'general') return;

                const level = parseInt(secData.level) || 0;

                const secId = secData.id || crypto.randomUUID();
                
                const fhirSection = {
                    id: secId, // Unique section identifier
                    title: sectionDef.label,
                    code: {
                        coding: [sectionDef.code],
                        text: sectionDef.label
                    },
                    text: {
                        status: "generated",
                        div: sectionsHtmlMap[secId] || `<div xmlns="http://www.w3.org/1999/xhtml">${sectionDef.description}</div>`
                    },
                    entry: [],
                    section: [], // For nested sections
                    _level: level // Internal attribute, removed before export
                };

                // Attaching the section into the tree based on level
                if (level === 0) {
                    // Add previous "free" entries to the default section if they exist
                    if (currentSectionEntries.length > 0 && sectionStack.length === 0) {
                        // Resources without a section — create an implicit top-level section
                        rootSections.push(this._createDefaultSection(currentSectionEntries));
                        currentSectionEntries = [];
                    }
                    rootSections.push(fhirSection);
                    sectionStack.length = 0;
                    sectionStack.push(fhirSection);
                    currentSectionEntries = fhirSection.entry;
                } else {
                    // Nested section: search for parent based on level
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

            // Resource found (FHIR blot)
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

                // Add reference to the current section
                currentSectionEntries.push({ reference: resourceUrl });

                // Add resource to the global list for Bundle entries
                allResources.push({ fullUrl: resourceUrl, resource: resource });
            }
        });

        // Remaining unassigned resources (after the last section or no sections at all)
        if (currentSectionEntries.length > 0 && sectionStack.length === 0 && currentSectionEntries !== rootSections[rootSections.length - 1]?.entry) {
            rootSections.push(this._createDefaultSection(currentSectionEntries));
        }

        // Clean internal attributes and empty arrays
        this._cleanSectionTree(rootSections);

        return { sections: rootSections, allResources };
    },

    /**
     * Creates a default FHIR section for resources without an assigned section.
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
     * Cleans the section tree — removes internal attributes and empty arrays.
     */
    _cleanSectionTree(sections) {
        sections.forEach(sec => {
            delete sec._level;
            
            // FHIR does not allow empty arrays
            if (sec.entry && sec.entry.length === 0) {
                delete sec.entry;
            }
            if (sec.section && sec.section.length === 0) {
                delete sec.section;
            } else if (sec.section) {
                this._cleanSectionTree(sec.section);
            }
            
            // If there's neither an entry nor section, append emptyReason
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

        // 1. Process all FHIR blots (embedded resources)
        const allElements = tempDiv.querySelectorAll('*');
        allElements.forEach(el => {
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
        });

        // Remove UI section elements prior to semantic conversion
        tempDiv.querySelectorAll('.section-controls, .section-header, .section-label').forEach(el => el.remove());

        // FHIR Narrative (txt-1 constraint) allows only basic HTML formatting.
        // Attributes like contenteditable or title on non-specific tags result in errors.
        tempDiv.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
        tempDiv.querySelectorAll('[title]').forEach(el => el.removeAttribute('title')); // FHIR Narrative doesn't allow random titles

        // 2. Convert flat Quill structure to semantic <div> blocks
        const semanticDiv = document.createElement('div');
        let currentSectionContainer = semanticDiv; // Default container for non-section content

        Array.from(tempDiv.childNodes).forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('fhir-section')) {
                const sType = node.getAttribute('data-section-type');
                const sId = node.getAttribute('data-section-id');
                const sectionDef = SECTIONS[sType];
                
                if (sectionDef && sType !== 'general') {
                    // Create a new wrapping div for the section
                    const wrapper = document.createElement('div');
                    wrapper.className = `section-block section-${sType}`;
                    if (sId) wrapper.id = sId;
                    
                    // Add a semantic heading
                    const h3 = document.createElement('h3');
                    h3.textContent = sectionDef.label;
                    h3.className = 'section-title';
                    wrapper.appendChild(h3);
                    
                    semanticDiv.appendChild(wrapper);
                    currentSectionContainer = wrapper; // Future elements will fall into here
                } else {
                    // General section resets back to the root level (outside the block)
                    currentSectionContainer = semanticDiv;
                }
            } else {
                // Not a section blot marker, insert the content into the current container
                currentSectionContainer.appendChild(node.cloneNode(true));
            }
        });

        // Fetch section-specific HTML content
        const sectionsHtmlMap = {};
        Array.from(semanticDiv.childNodes).forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE && child.classList.contains('section-block') && child.id) {
                // Save the HTML section for use in _buildSectionTree
                sectionsHtmlMap[child.id] = `<div xmlns="http://www.w3.org/1999/xhtml">${child.innerHTML.replace(/<br>/g, '<br/>')}</div>`;
            }
        });

        let html = semanticDiv.innerHTML.replace(/<br>/g, '<br/>');
        return { fullHtml: html, sectionsHtmlMap };
    },

    /**
     * Import FHIR Bundle back into the visual editor.
     * Reconstructs sections and FHIR blots.
     */
    importBundle(quill, bundleJson) {
        const bundle = typeof bundleJson === 'string' ? JSON.parse(bundleJson) : bundleJson;

        const composition = bundle.entry?.find(
            e => e.resource?.resourceType === "Composition"
        )?.resource;

        if (!composition || !composition.text || !composition.text.div) {
            throw new Error('Nenalezen platný Composition text ve FHIR Bundle.');
        }

        // 1. Obtain resource values (Map)
        const resourceMap = {};
        bundle.entry?.forEach(entry => {
            const res = entry.resource;
            // ... logiku na hledání resources ponecháme ...
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

        // 2. Extract HTML content of the composition
        let rawHtml = composition.text.div;
        rawHtml = rawHtml.replace(/^<div xmlns="http:\/\/www\.w3\.org\/1999\/xhtml">/, '').replace(/<\/div>$/, '');
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rawHtml;
        
        const flatDiv = document.createElement('div');

        // 3. Flatten semantic <div> blocks back into the standard Quill structure
        Array.from(tempDiv.childNodes).forEach(node => {
            let handledAsSection = false;
            
            if (node.nodeType === Node.ELEMENT_NODE && node.className && typeof node.className === 'string') {
                const classList = Array.from(node.classList);
                const sectionClass = classList.find(c => c.startsWith('section-') && c !== 'section-title' && c !== 'section-block');
                
                if (sectionClass) {
                    const sType = sectionClass.replace('section-', '');
                    if (SECTIONS[sType]) {
                        handledAsSection = true;
                        
                        // Insert a marker (SectionBlot div)
                        const marker = document.createElement('div');
                        marker.className = 'fhir-section';
                        marker.setAttribute('data-section-type', sType);
                        marker.setAttribute('data-section-id', node.id || crypto.randomUUID());
                        marker.setAttribute('data-section-level', '0');
                        marker.setAttribute('contenteditable', 'false');
                        flatDiv.appendChild(marker);
                        
                        // Copy section contents, skipping the h3 header
                        Array.from(node.childNodes).forEach(child => {
                            if (child.nodeType === Node.ELEMENT_NODE && child.classList.contains('section-title')) return;
                            flatDiv.appendChild(child.cloneNode(true));
                        });
                        
                        // Append a 'general' delimiter after the section to reset the UI context correctly
                        const generalMarker = document.createElement('div');
                        generalMarker.className = 'fhir-section';
                        generalMarker.setAttribute('data-section-type', 'general');
                        generalMarker.setAttribute('data-section-level', '0');
                        generalMarker.setAttribute('contenteditable', 'false');
                        flatDiv.appendChild(generalMarker);
                    }
                }
            }
            
            if (!handledAsSection) {
                flatDiv.appendChild(node.cloneNode(true));
            }
        });

        // 4. Restore the fhir-blot properties based on the parsed HTML classes
        const resourceTypeNames = new Set(Object.values(TEMPLATES).map(t => t.fhirResourceType));
        flatDiv.querySelectorAll('*').forEach(el => {
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
                if (tmpl) el.innerHTML = tmpl.formatDisplay(info.value);
            }
        });

        // 5. Load the contents back to Quill (quill.clipboard.convert automatically calls SectionBlot.create)
        const delta = quill.clipboard.convert({ html: flatDiv.innerHTML });
        quill.setContents(delta, 'api');
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
