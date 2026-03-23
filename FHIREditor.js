/**
 * FHIREditor.js
 * Hlavní logika FHIR klinického editoru.
 *
 * Architektura sekcí:
 * SectionBlot = tenký záhlaví (BlockEmbed = atomický, needitovatelný).
 * Obsah sekce = normální Quill odstavce ZA tímto záhlavím.
 * Po každé změně JS projde DOM a přidá CSS třídy na odstavce
 * "patřící" sekci. Observer se dočasně odpojuje, aby nenarušil Quill.
 *
 * Dependencies: Quill.js 2.x, FHIRTemplates.js, FHIRBundleBuilder.js
 */

// ===================================================================
// 1. Custom Quill Blots
// ===================================================================
const Embed = Quill.import('blots/embed');

class FhirBlot extends Embed {
    static create(data) {
        const node = super.create();
        const id = data.id || crypto.randomUUID();
        const t = TEMPLATES[data.type];
        const resClass = t && t.fhirResourceType ? t.fhirResourceType : 'Observation';

        node.setAttribute('id', id);
        node.setAttribute('data-id', id);
        node.setAttribute('data-type', data.type);
        node.setAttribute('data-value', data.value || '');
        node.setAttribute('class', `fhir-blot ${resClass}`);
        node.setAttribute('contenteditable', 'false');

        if (t) {
            if (!data.value) node.classList.add('empty');
            node.innerHTML = t.formatDisplay(data.value);
        }
        return node;
    }

    static formats(node) {
        return { id: node.getAttribute('data-id'), type: node.getAttribute('data-type'), value: node.getAttribute('data-value') };
    }

    static value(node) {
        return { id: node.getAttribute('data-id'), type: node.getAttribute('data-type'), value: node.getAttribute('data-value') };
    }
}
FhirBlot.blotName = 'fhir-resource';
FhirBlot.tagName = 'span';
Quill.register(FhirBlot);


// --- SectionBlot: TENKÝ ZÁHLAVÍ ---
const BlockEmbed = Quill.import('blots/block/embed');

class SectionBlot extends BlockEmbed {
    static create(data) {
        const node = super.create();
        const sectionDef = SECTIONS[data.sectionType] || SECTIONS.general;
        const level = parseInt(data.level) || 0;
        const id = data.id || crypto.randomUUID();

        node.setAttribute('data-section-type', data.sectionType);
        node.setAttribute('data-section-id', id);
        node.setAttribute('data-section-level', level);
        node.setAttribute('contenteditable', 'false');

        // Čistý styl: jen pozadí + label, ŽÁDNÉ bordery v editoru
        const bgColor = sectionDef.color !== 'transparent' ? sectionDef.color : '#f8fafc';

        // general sekce = neviditelný oddělovač (boundary marker pro CSS)
        if (data.sectionType === 'general') {
            node.style.cssText = 'display:block;height:0;padding:0;margin:0;border:none;overflow:hidden;line-height:0;font-size:0;';
            node.innerHTML = '';
            return node;
        }

        node.style.cssText = `
            background: ${bgColor};
            border: none;
            padding: 3px 10px;
            margin-top: 10px;
            margin-bottom: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 24px;
            cursor: default;
        `;
        if (level > 0) node.style.marginLeft = `${level * 20}px`;

        node.innerHTML = `
            <span class="section-label">
                <i class="fa-solid ${sectionDef.icon}"></i> ${sectionDef.label}
            </span>
            <span class="section-controls">
                <button class="section-btn" data-action="change" title="Změnit typ sekce"><i class="fa-solid fa-right-left"></i></button>
                <button class="section-btn" data-action="unlink" title="Zrušit sekci (ponechat obsah)"><i class="fa-solid fa-link-slash"></i></button>
                <button class="section-btn section-btn-danger" data-action="delete" title="Odstranit sekci včetně obsahu"><i class="fa-solid fa-trash-can"></i></button>
            </span>`;

        return node;
    }

    static value(node) {
        return {
            sectionType: node.getAttribute('data-section-type'),
            id: node.getAttribute('data-section-id'),
            level: parseInt(node.getAttribute('data-section-level')) || 0
        };
    }
}
SectionBlot.blotName = 'fhir-section';
SectionBlot.tagName = 'div';
SectionBlot.className = 'fhir-section';
Quill.register(SectionBlot);


// ===================================================================
// 2. Initialize Quill Editor
// ===================================================================
const quill = new Quill('#editor-container', {
    modules: {
        toolbar: '#toolbar',
        keyboard: { bindings: {} }
    },
    theme: 'snow',
    placeholder: 'Zde pište klinický záznam. Zkuste napsat „TK " nebo stiskněte Ctrl+.'
});


// ===================================================================
// 3. Section Content Styling
//    ČISTĚ CSS přístup: injektujeme <style> tag s nth-child selektory.
//    NULOVÁ modifikace Quill DOM = žádné konflikty s MutationObserverem.
// ===================================================================
function updateSectionContentStyling() {
    let styleEl = document.getElementById('section-content-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'section-content-styles';
        document.head.appendChild(styleEl);
    }

    const children = Array.from(quill.root.children);
    const rules = [];

    for (let i = 0; i < children.length; i++) {
        if (!children[i].classList.contains('fhir-section')) continue;
        const sType = children[i].getAttribute('data-section-type');
        const def = SECTIONS[sType];
        if (!def || sType === 'general') continue;

        const bg = def.color || 'transparent';
        const childStart = i + 2; // nth-child je 1-indexed, obsah začíná za headerem

        // Najít konec: příští sekce nebo konec dětí
        let childEnd = children.length;
        for (let j = i + 1; j < children.length; j++) {
            if (children[j].classList.contains('fhir-section')) { childEnd = j; break; }
        }

        if (childStart <= childEnd) {
            rules.push(`.ql-editor > *:nth-child(n+${childStart}):nth-child(-n+${childEnd}) { background-color: ${bg}; padding-left: 12px; }`);
        }
    }

    styleEl.textContent = rules.join('\n');
}

// Spustit po každé změně (s debounce) a na startu
let _sectionStyleTimeout = null;
function scheduleSectionStyling() {
    if (_sectionStyleTimeout) clearTimeout(_sectionStyleTimeout);
    _sectionStyleTimeout = setTimeout(updateSectionContentStyling, 16);
}
quill.on('text-change', scheduleSectionStyling);
setTimeout(updateSectionContentStyling, 100);


// ===================================================================
// 4. Utility Functions
// ===================================================================
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => t.style.opacity = '1', 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.style.display = 'none', 300); }, 3000);
}

function getCursorRect() {
    const range = quill.getSelection();
    if (!range) return null;
    const bounds = quill.getBounds(range.index);
    const containerRect = quill.container.getBoundingClientRect();
    return { top: bounds.top + containerRect.top, bottom: bounds.bottom + containerRect.top, left: bounds.left + containerRect.left, right: bounds.right + containerRect.left };
}

function getCurrentSection(index) {
    if (index === undefined) { const range = quill.getSelection(); if (!range) return null; index = range.index; }
    const delta = quill.getContents(0, index);
    let lastSection = null;
    delta.ops.forEach(op => {
        if (op.insert && typeof op.insert === 'object' && op.insert['fhir-section'])
            lastSection = SECTIONS[op.insert['fhir-section'].sectionType] || null;
    });
    return lastSection;
}

function getCurrentSectionType(index) {
    if (index === undefined) { const range = quill.getSelection(); if (!range) return null; index = range.index; }
    const delta = quill.getContents(0, index);
    let lastType = null;
    delta.ops.forEach(op => {
        if (op.insert && typeof op.insert === 'object' && op.insert['fhir-section']) {
            const t = op.insert['fhir-section'].sectionType;
            // 'general' je neviditelný boundary marker, ne skutečný rodič
            lastType = (t === 'general') ? null : t;
        }
    });
    return lastType;
}

function getFilteredTemplates(section) {
    const allTemplates = Object.values(TEMPLATES);
    if (!section || section.allowedResources === undefined || section.allowedResources === null) return allTemplates;
    if (section.allowedResources.includes('*')) return allTemplates;
    if (section.allowedResources.length === 0) return []; // Sekce nemá žádné povolené resources
    return allTemplates.filter(t => section.allowedResources.includes(t.fhirResourceType));
}

function getAvailableSections(parentSectionType) {
    const parentDef = parentSectionType ? SECTIONS[parentSectionType] : null;
    return Object.values(SECTIONS).filter(s => {
        if (!s.showInList) {
            if (parentDef && parentDef.allowedChildren) {
                if (!parentDef.allowedChildren.includes('*') && !parentDef.allowedChildren.includes(s.id)) return false;
                return true;
            }
            return false;
        }
        if (parentDef) {
            const allowed = parentDef.allowedChildren;
            if (!allowed || allowed.length === 0) return false;
            if (!allowed.includes('*') && !allowed.includes(s.id)) return false;
            if (s.id === parentSectionType && !parentDef.allowSameTypeChild) return false;
        }
        return true;
    });
}

function getDisallowedResourcesInRange(startIndex, length, section) {
    if (!section || section.allowedResources.includes('*')) return [];
    const disallowed = [];
    const delta = quill.getContents(startIndex, length);
    let currentIndex = startIndex;
    delta.ops.forEach(op => {
        if (op.insert && typeof op.insert === 'object' && op.insert['fhir-resource']) {
            const tmpl = TEMPLATES[op.insert['fhir-resource'].type];
            if (tmpl && !section.allowedResources.includes(tmpl.fhirResourceType))
                disallowed.push({ index: currentIndex, data: op.insert['fhir-resource'], template: tmpl });
        }
        currentIndex += (typeof op.insert === 'string') ? op.insert.length : 1;
    });
    return disallowed;
}


// ===================================================================
// 5. Modal Dialogs
// ===================================================================
const Modals = {
    _overlay: null, _cmInstance: null,
    open(opts) {
        this.close();
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) this.close(); });
        const actionsHtml = (opts.headerActions || []).map(a =>
            `<button class="modal-btn ${a.cls || ''}" id="${a.id || ''}" title="${a.title || ''}">${a.icon ? `<i class="fa-solid ${a.icon}"></i> ` : ''}${a.label}</button>`
        ).join('');
        overlay.innerHTML = `<div class="modal-container"><div class="modal-header"><h3><i class="fa-solid ${opts.icon} text-slate-400"></i> ${opts.title}</h3><div class="modal-header-actions">${actionsHtml}<button class="modal-close" id="modal-maximize-btn" title="Maximalizovat"><i class="fa-solid fa-expand"></i></button><button class="modal-close" id="modal-close-btn" title="Zavřít (Esc)"><i class="fa-solid fa-xmark"></i></button></div></div><div class="modal-body" id="modal-body">${opts.bodyHtml || ''}</div></div>`;
        document.body.appendChild(overlay);
        this._overlay = overlay;
        overlay.querySelector('#modal-close-btn').onclick = () => this.close();
        const maxBtn = overlay.querySelector('#modal-maximize-btn');
        maxBtn.onclick = () => { const c = overlay.querySelector('.modal-container'); const m = c.classList.toggle('modal-maximized'); maxBtn.querySelector('i').className = m ? 'fa-solid fa-compress' : 'fa-solid fa-expand'; if (this._cmInstance) setTimeout(() => this._cmInstance.refresh(), 50); };
        this._escHandler = e => { if (e.key === 'Escape') { this.close(); e.preventDefault(); } };
        window.addEventListener('keydown', this._escHandler);
        (opts.headerActions || []).forEach(a => { if (a.id && a.onClick) { const btn = overlay.querySelector(`#${a.id}`); if (btn) btn.onclick = a.onClick; } });
        if (opts.onOpen) setTimeout(() => opts.onOpen(overlay), 0);
    },
    close() {
        if (this._cmInstance) this._cmInstance = null;
        if (this._overlay) { this._overlay.remove(); this._overlay = null; }
        if (this._escHandler) { window.removeEventListener('keydown', this._escHandler); this._escHandler = null; }
    },
    openCodeEditor() {
        this.open({
            title: 'Editor HTML kódu', icon: 'fa-code',
            headerActions: [{ id: 'btn-code-apply', label: 'Použít', icon: 'fa-check', cls: 'primary', onClick: () => { if (!this._cmInstance) return; quill.root.innerHTML = this._cmInstance.getValue(); this.close(); showToast('HTML kód aplikován'); scheduleSectionStyling(); } }],
            bodyHtml: `<div id="cm-editor-container" style="height:100%"></div>`,
            onOpen: (ov) => {
                const c = ov.querySelector('#cm-editor-container'); if (!c) return;
                this._cmInstance = CodeMirror(c, { value: this._prettyHtml(quill.root.innerHTML), mode: 'htmlmixed', theme: 'material-darker', lineNumbers: true, lineWrapping: true, tabSize: 2, matchBrackets: true, autoCloseTags: true, extraKeys: { 'Escape': () => this.close() } });
                this._cmInstance.setSize('100%', '100%'); setTimeout(() => this._cmInstance.refresh(), 10);
            }
        });
    },
    openJsonPreview() {
        const bundle = FHIRBundleBuilder.buildBundle(quill);
        const jsonStr = FHIRBundleBuilder.toJson(bundle);
        this.open({
            title: 'FHIR Bundle (JSON)', icon: 'fa-file-code',
            headerActions: [
                { id: 'btn-json-copy', label: 'Kopírovat', icon: 'fa-copy', onClick: () => this._copyJson() },
                { id: 'btn-json-download', label: 'Stáhnout', icon: 'fa-download', onClick: () => { FHIRBundleBuilder.downloadBundle(bundle); showToast('Stažen'); } },
                { id: 'btn-json-validate', label: 'Validovat', icon: 'fa-shield-check', onClick: () => { window.open('https://inferno.healthit.gov/validator/', '_blank'); this._copyJson(); showToast('Validátor otevřen – JSON zkopírován'); } }
            ],
            bodyHtml: `<div id="cm-json-container" style="height:100%"></div>`,
            onOpen: (ov) => {
                const c = ov.querySelector('#cm-json-container'); if (!c) return;
                this._cmInstance = CodeMirror(c, { value: jsonStr, mode: 'application/json', theme: 'material-darker', lineNumbers: true, lineWrapping: true, readOnly: true, tabSize: 2, extraKeys: { 'Escape': () => this.close() } });
                this._cmInstance.setSize('100%', '100%'); setTimeout(() => this._cmInstance.refresh(), 10);
            }
        });
    },
    openPrintPreview() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const pn = MOCK_PATIENT.resource.name?.[0]; const patientName = pn ? `${pn.given?.join(' ')||''} ${pn.family||''}` : 'Neznámý';
        const bd = MOCK_PATIENT.resource.birthDate || '';
        const dn = MOCK_HEALTHCARE_PROVIDER.practitioner.resource.name?.[0]; const doctorName = dn ? `${dn.prefix?.join(' ')||''} ${dn.given?.join(' ')||''} ${dn.family||''}` : 'Neznámý';
        const orgName = MOCK_HEALTHCARE_PROVIDER.organization.resource.name || '';

        const reportHtml = `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8"><title>Klinický zápis</title>
<style>
@media print { body { margin: 15mm; } .no-print { display: none !important; } }
body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 20px; }
.rh { border-bottom: 2px solid #334155; padding-bottom: 12px; margin-bottom: 20px; }
.rh h1 { font-size: 20px; margin: 0 0 8px; color: #0f172a; }
.rm { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 13px; color: #475569; }
.rm strong { color: #1e293b; }
.rs { margin: 14px 0 4px; padding: 0 0 2px; font-weight: 600; font-size: 14px; color: #475569; }
.rc { margin-top: 16px; }
.rc .fhir-blot, .rc .Observation { color: #0369a1; font-weight: 500; }
.rf { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: right; }
</style></head><body>
<div class="rh"><h1>Klinický zápis</h1><div class="rm">
<div><strong>Pacient:</strong> ${patientName}</div><div><strong>Datum:</strong> ${dateStr}</div>
<div><strong>Datum narození:</strong> ${bd}</div><div><strong>Lékař:</strong> ${doctorName}</div>
<div><strong>Organizace:</strong> ${orgName}</div></div></div>
<div class="rc">${this._buildPrintContent()}</div>
<div class="rf">Vygenerováno: ${dateStr} | FHIR Clinical Document</div></body></html>`;

        this.open({
            title: 'Náhled zprávy pro tisk', icon: 'fa-print',
            headerActions: [{ id: 'btn-print-exec', label: 'Tisk', icon: 'fa-print', cls: 'primary', onClick: () => { const f = document.querySelector('#print-iframe'); if (f?.contentWindow) f.contentWindow.print(); } }],
            bodyHtml: `<iframe id="print-iframe" style="width:100%;height:100%;border:none;background:white;"></iframe>`,
            onOpen: (ov) => { const f = ov.querySelector('#print-iframe'); if (f) f.srcdoc = reportHtml; }
        });
    },
    /** Sestaví tiskový obsah: sekce → jen nadpis + barevné podtržení */
    _buildPrintContent() {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = quill.root.innerHTML;

        // Sekce → decentní nadpis s barevným podtržením
        tempDiv.querySelectorAll('.fhir-section').forEach(secNode => {
            const sType = secNode.getAttribute('data-section-type');
            const def = SECTIONS[sType];
            if (def && sType !== 'general') {
                const h = document.createElement('div');
                h.className = 'rs';
                const color = def.borderColor !== 'transparent' ? def.borderColor : '#cbd5e1';
                h.style.borderBottom = `2px solid ${color}`;
                h.textContent = def.label;
                secNode.replaceWith(h);
            } else {
                secNode.remove();
            }
        });

        // Vyčistit in-section styly
        tempDiv.querySelectorAll('.in-section').forEach(el => {
            el.classList.remove('in-section'); el.removeAttribute('data-in-section'); el.removeAttribute('style');
        });
        tempDiv.querySelectorAll('.fhir-blot').forEach(el => el.removeAttribute('contenteditable'));
        return tempDiv.innerHTML.replace(/<br>/g, '<br/>');
    },
    async _copyJson() {
        const json = this._cmInstance ? this._cmInstance.getValue() : '';
        try { await navigator.clipboard.writeText(json); showToast('JSON zkopírován'); }
        catch { const ta = document.createElement('textarea'); ta.value = json; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showToast('JSON zkopírován'); }
    },
    _prettyHtml(html) {
        let result = '', indent = 0; const step = '  ';
        html = html.replace(/>\s*</g, '>\n<');
        for (let line of html.split('\n')) {
            line = line.trim(); if (!line) continue;
            if (line.match(/^<\/(div|p|ul|ol|li|h[1-6]|blockquote|section|table|thead|tbody|tr|td|th)/i)) indent = Math.max(0, indent - 1);
            result += step.repeat(indent) + line + '\n';
            if (line.match(/^<(div|p|ul|ol|li|h[1-6]|blockquote|section|table|thead|tbody|tr|td|th)[^/]*>/i) && !line.match(/<\/(div|p|ul|ol|li|h[1-6]|blockquote|section|table|thead|tbody|tr|td|th)>/i)) indent += 1;
        }
        return result.trim();
    }
};


// ===================================================================
// 6. Floating UI Manager
// ===================================================================
const UI = {
    el: document.getElementById('floating-ui'),
    state: 'CLOSED', ctx: {}, filteredItems: [], selIndex: -1,
    isOpen() { return this.state !== 'CLOSED'; },
    init() { this.el.addEventListener('mousedown', e => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') e.preventDefault(); }); },

    show(state, rect, context = {}) {
        this.state = state; this.ctx = context;
        if (this.ctx.insertIndex === undefined) { const r = quill.getSelection(); if (r) this.ctx.insertIndex = r.index; }
        this.el.style.display = 'block'; this.el.style.opacity = '0';
        setTimeout(() => {
            const uiRect = this.el.getBoundingClientRect();
            let top = rect.bottom + 8, left = rect.left;
            if (this.state === 'SEARCH' || this.state === 'SECTION_SEARCH') { top = rect.top - 4; left = rect.left + 4; }
            if (top + uiRect.height > window.innerHeight) { if (this.state === 'SEARCH' || this.state === 'SECTION_SEARCH') { this.el.style.display = 'flex'; this.el.style.flexDirection = 'column-reverse'; top = rect.bottom - uiRect.height + 4; } else { top = rect.top - uiRect.height - 8; } } else { this.el.style.display = 'block'; this.el.style.flexDirection = 'column'; }
            if (left + uiRect.width > window.innerWidth) left = window.innerWidth - uiRect.width - 16;
            this.el.style.top = `${Math.max(10, top)}px`; this.el.style.left = `${Math.max(10, left)}px`; this.el.style.opacity = '1';
        }, 0);
        this.selIndex = -1; this.render();
    },

    hide() {
        this.state = 'CLOSED'; this.el.style.display = 'none'; this.el.style.flexDirection = 'column'; this.el.style.opacity = '0';
        if (this.ctx.node) this.ctx.node.classList.remove('active');
        this.ctx = {}; quill.focus();
    },

    renderListOnly() {
        const container = document.getElementById('ui-list-container'); if (!container) return;
        if (this.filteredItems.length === 0) { container.innerHTML = `<div style="padding:8px;font-size:13px;color:#94a3b8;text-align:center">Nic nenalezeno</div>`; return; }
        let html = '';
        this.filteredItems.forEach((item, i) => {
            const sel = i === this.selIndex ? 'selected' : '';
            const isSection = item._isSection;
            const cls = isSection ? 'ui-item ui-item-section' : 'ui-item';
            const fn = isSection ? `SectionUI.execAction(${i})` : `UI.execAction(${i})`;
            const kw = item.keywords ? item.keywords.join(', ') : '';
            const iconColor = isSection ? `color:${item.borderColor || '#64748b'}` : '';
            const icon = item.icon ? `<i class="fa-solid ${item.icon}" style="margin-right:6px;${iconColor}"></i>` : '';
            html += `<div class="${cls} ${sel}" onclick="${fn}"><span class="res-name">${icon}${item.label}</span><span class="res-keys">${kw}</span></div>`;
        });
        container.innerHTML = html;
    },

    render() {
        if (this.state === 'SEARCH' || this.state === 'SUGGEST_NEW') {
            let html = '';
            if (this.state === 'SEARCH') html += `<input type="text" id="ui-search-input" class="ui-search-input" placeholder="hledat údaj..." autocomplete="off">`;
            html += `<div class="ui-list" id="ui-list-container"></div>`;
            this.el.innerHTML = html;
            this.renderListOnly();
            if (this.state === 'SEARCH') {
                const inp = document.getElementById('ui-search-input'); inp.focus();
                inp.oninput = (e) => {
                    const q = e.target.value.toLowerCase();
                    const section = getCurrentSection();
                    this.filteredItems = getFilteredTemplates(section).filter(t => t.label.toLowerCase().includes(q) || t.keywords.some(k => k.includes(q)));
                    this.selIndex = this.filteredItems.length > 0 ? 0 : -1;
                    this.renderListOnly();
                };
            }
        }
        else if (this.state === 'SECTION_SEARCH') {
            this.el.innerHTML = `<input type="text" id="ui-search-input" class="ui-search-input" placeholder="hledat sekci..." autocomplete="off"><div class="ui-list" id="ui-list-container"></div>`;
            this.renderListOnly();
            const inp = document.getElementById('ui-search-input'); inp.focus();
            inp.oninput = (e) => {
                const q = e.target.value.toLowerCase();
                const parentType = getCurrentSectionType();
                this.filteredItems = getAvailableSections(parentType).filter(s => s.label.toLowerCase().includes(q) || s.keywords.some(k => k.includes(q))).map(s => ({ ...s, _isSection: true }));
                this.selIndex = this.filteredItems.length > 0 ? 0 : -1;
                this.renderListOnly();
            };
        }
        else if (this.state === 'SUGGEST_EDIT') {
            const t = TEMPLATES[this.ctx.type]; const sel = this.selIndex === 0 ? 'selected' : '';
            this.el.innerHTML = `<div class="ui-list"><div class="ui-item ${sel}" onclick="UI.openEditForm()"><span class="res-name"><i class="fa-solid fa-pen-to-square" style="color:#3b82f6;margin-right:8px"></i> Editovat ${t.label}</span></div></div>`;
        }
        else if (this.state === 'EDIT_FORM') {
            const t = TEMPLATES[this.ctx.type]; const vals = (this.ctx.value || '').split('/');
            this.el.innerHTML = `<div class="ui-minimal-edit">
                <i class="fa-solid ${t.icon}" style="color:#94a3b8;font-size:14px" title="${t.label}"></i>
                <div style="display:flex;align-items:center;gap:4px">${t.renderInput(vals)}</div>
                <div style="width:1px;height:20px;background:#e5e7eb;margin:0 4px"></div>
                <button style="color:#16a34a;background:none;border:none;cursor:pointer;padding:4px;border-radius:4px" title="Uložit" onclick="UI.saveEdit()"><i class="fa-solid fa-check"></i></button>
                ${this.ctx.value ? `<button style="color:#dc2626;background:none;border:none;cursor:pointer;padding:4px;border-radius:4px" title="Odstranit" onclick="UI.deleteBlot()"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                <button style="color:#94a3b8;background:none;border:none;cursor:pointer;padding:4px;border-radius:4px" title="Zrušit" onclick="UI.hide()"><i class="fa-solid fa-xmark"></i></button>
            </div>`;
            setTimeout(() => { const inps = this.el.querySelectorAll('input.fhir-input'); if (inps[0]) { inps[0].focus(); inps[0].select(); } }, 50);
        }
    },

    moveSelection(dir) {
        if (this.state === 'SUGGEST_EDIT') { this.selIndex = 0; this.render(); return; }
        if (['SEARCH','SUGGEST_NEW','SECTION_SEARCH'].includes(this.state)) {
            if (this.filteredItems.length === 0) return;
            this.selIndex = this.selIndex === -1 ? (dir === 1 ? 0 : this.filteredItems.length - 1) : (this.selIndex + dir + this.filteredItems.length) % this.filteredItems.length;
            this.renderListOnly();
            const c = document.getElementById('ui-list-container'); if (c) { const s = c.querySelector('.selected'); if (s) s.scrollIntoView({ block: 'nearest' }); }
        }
    },

    confirmSelection() {
        if (['SEARCH','SUGGEST_NEW'].includes(this.state)) { if (this.selIndex >= 0) this.execAction(this.selIndex); }
        else if (this.state === 'SECTION_SEARCH') { if (this.selIndex >= 0) SectionUI.execAction(this.selIndex); }
        else if (this.state === 'SUGGEST_EDIT') { if (this.selIndex >= 0) this.openEditForm(); }
        else if (this.state === 'EDIT_FORM') { this.saveEdit(); }
    },

    execAction(index) {
        const item = this.filteredItems[index]; if (!item) return;
        // Pokud je to sekce, delegujeme na SectionUI
        if (item._isSection) { SectionUI.execAction(index); return; }

        let insertIndex = this.ctx.insertIndex !== undefined ? this.ctx.insertIndex : (quill.getSelection(true)?.index || 0);
        const wordRange = this.ctx.wordRange;
        if (wordRange) { quill.deleteText(Math.max(0, wordRange.index || 0), wordRange.length || 0, 'api'); insertIndex = wordRange.index; }
        const id = crypto.randomUUID();
        quill.insertEmbed(insertIndex, 'fhir-resource', { type: item.id, id, value: '' }, 'api');
        quill.insertText(insertIndex + 1, ' ', 'user');
        this.hide();
        setTimeout(() => { const n = document.querySelector(`.fhir-blot[data-id="${id}"]`); if (n) { this.ctx.node = n; this.openEditForm(n); } }, 50);
    },

    openEditForm(node = null) {
        if (node) this.ctx.node = node;
        const n = this.ctx.node; if (!n?.classList) return;
        n.classList.add('active');
        const rect = n.getBoundingClientRect();
        const data = FhirBlot.value(n);
        this.show('EDIT_FORM', rect, { node: n, id: data.id, type: data.type, value: data.value });
    },

    saveEdit() {
        const t = TEMPLATES[this.ctx.type]; this.ctx.value = t.getValue(this.el);
        const blot = Quill.find(this.ctx.node);
        if (blot) {
            const idx = quill.getIndex(blot);
            if (!this.ctx.value) { quill.deleteText(idx, 1, 'user'); }
            else { quill.deleteText(idx, 1, 'api'); quill.insertEmbed(idx, 'fhir-resource', { type: this.ctx.type, id: this.ctx.id, value: this.ctx.value }, 'api'); quill.setSelection(idx + 1, 0); }
        }
        this.hide();
    },

    deleteBlot() { const blot = Quill.find(this.ctx.node); if (blot) quill.deleteText(quill.getIndex(blot), 1, 'user'); this.hide(); }
};
UI.init();


// ===================================================================
// 6b. Section UI Manager
// ===================================================================
const SectionUI = {
    openSectionSearch() {
        quill.focus();
        const range = quill.getSelection(true);
        const insertIdx = range ? range.index : 0;
        const parentType = getCurrentSectionType(insertIdx);
        const available = getAvailableSections(parentType);
        UI.filteredItems = available.map(s => ({ ...s, _isSection: true }));
        if (UI.filteredItems.length === 0) { showToast('V této sekci nelze vložit podsekci'); return; }
        const bounds = quill.getBounds(insertIdx);
        const containerRect = quill.container.getBoundingClientRect();
        const rect = { top: bounds.top + containerRect.top, bottom: bounds.bottom + containerRect.top, left: bounds.left + containerRect.left, right: bounds.right + containerRect.left };
        UI.show('SECTION_SEARCH', rect, { insertIndex: insertIdx, selectionLength: range ? range.length : 0 });
    },

    execAction(index) {
        const section = UI.filteredItems[index]; if (!section) return;
        let insertIdx = UI.ctx.insertIndex || 0;

        // Změna typu existující sekce
        if (UI.ctx._changingSection) {
            const sn = UI.ctx._changingSection;
            const blot = Quill.find(sn); if (!blot) return;
            const idx = quill.getIndex(blot);
            const oldData = SectionBlot.value(sn);
            quill.deleteText(idx, 1, 'api');
            quill.insertEmbed(idx, 'fhir-section', { sectionType: section.id, id: oldData.id, level: oldData.level }, 'api');
            UI.hide(); showToast(`Sekce → „${section.label}"`); scheduleSectionStyling();
            return;
        }

        // Smazat psaný výraz (pokud sekce vložena z našeptávače)
        const wordRange = UI.ctx.wordRange;
        if (wordRange) {
            quill.deleteText(wordRange.index, wordRange.length, 'api');
            insertIdx = wordRange.index;
        }

        // Level dle rodičovské sekce
        let level = 0;
        const parentType = getCurrentSectionType(insertIdx);
        if (parentType) {
            const delta = quill.getContents(0, insertIdx);
            delta.ops.forEach(op => { if (op.insert && typeof op.insert === 'object' && op.insert['fhir-section']) level = (parseInt(op.insert['fhir-section'].level) || 0) + 1; });
        }

        quill.insertEmbed(insertIdx, 'fhir-section', { sectionType: section.id, id: crypto.randomUUID(), level }, 'api');
        quill.setSelection(insertIdx + 1, 0);
        UI.hide(); showToast(`Sekce „${section.label}" vložena`); scheduleSectionStyling();
    },

    changeSectionType(sn) {
        const blot = Quill.find(sn); if (!blot) return;
        const currentType = sn.getAttribute('data-section-type');
        const parentType = getCurrentSectionType(quill.getIndex(blot));
        UI.filteredItems = getAvailableSections(parentType).filter(s => s.id !== currentType).map(s => ({ ...s, _isSection: true }));
        UI.show('SECTION_SEARCH', sn.getBoundingClientRect(), { insertIndex: quill.getIndex(blot), _changingSection: sn });
    },

    unlinkSection(sn) {
        const blot = Quill.find(sn); if (blot) quill.deleteText(quill.getIndex(blot), 1, 'api');
        showToast('Sekce zrušena'); scheduleSectionStyling();
    },

    deleteSection(sn) {
        if (!confirm('Opravdu odstranit sekci včetně obsahu?')) return;
        const blot = Quill.find(sn); if (!blot) return;
        const startIdx = quill.getIndex(blot);
        let endIdx = quill.getLength();
        const delta = quill.getContents(startIdx + 1, endIdx - startIdx - 1);
        let pos = startIdx + 1;
        for (const op of delta.ops) {
            if (op.insert && typeof op.insert === 'object' && op.insert['fhir-section']) { endIdx = pos; break; }
            pos += (typeof op.insert === 'string') ? op.insert.length : 1;
        }
        quill.deleteText(startIdx, endIdx - startIdx, 'api');
        showToast('Sekce odstraněna'); scheduleSectionStyling();
    }
};


// ===================================================================
// 7. Event Handlers
// ===================================================================
window.addEventListener('keydown', (e) => {
    if (UI.isOpen()) {
        if (e.key === 'Escape') { UI.hide(); e.preventDefault(); return; }
        if (['SEARCH','SUGGEST_NEW','SUGGEST_EDIT','SECTION_SEARCH'].includes(UI.state)) {
            if (e.key === 'ArrowDown') { UI.moveSelection(1); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { UI.moveSelection(-1); e.preventDefault(); }
            else if (e.key === 'Enter') { if (UI.selIndex >= 0) { UI.confirmSelection(); e.preventDefault(); } else UI.hide(); }
        } else if (UI.state === 'EDIT_FORM') {
            if (e.key === 'Enter') { UI.saveEdit(); e.preventDefault(); }
            if (e.key === '/') { const inps = Array.from(UI.el.querySelectorAll('input')); const ai = inps.indexOf(document.activeElement); if (ai >= 0 && ai < inps.length - 1) { e.preventDefault(); inps[ai + 1].focus(); } }
        }
    } else {
        if (e.ctrlKey && e.key === '.') { e.preventDefault(); const section = getCurrentSection(); UI.filteredItems = getFilteredTemplates(section); const r = quill.getSelection(); UI.show('SEARCH', getCursorRect() || quill.container.getBoundingClientRect(), { insertIndex: r ? r.index : 0 }); }
        if (e.key === 'F2') { e.preventDefault(); SectionUI.openSectionSearch(); }
        // Ctrl+Enter: opustit sekci — vloží neviditelný general oddělovač
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            const range = quill.getSelection(); if (!range) return;
            const curType = getCurrentSectionType(range.index);
            if (!curType || curType === 'general') return; // Není v sekci

            const curIdx = range.index;
            // Najít pozici: další sekce nebo konec dokumentu
            const totalLen = quill.getLength();
            const delta = quill.getContents(curIdx, totalLen - curIdx);
            let pos = curIdx;
            for (const op of delta.ops) {
                if (pos > curIdx && op.insert && typeof op.insert === 'object' && op.insert['fhir-section']) break;
                pos += (typeof op.insert === 'string') ? op.insert.length : 1;
            }
            // Neviditelný general boundary marker ukončí CSS rozsah sekce
            quill.insertEmbed(pos, 'fhir-section', { sectionType: 'general', id: crypto.randomUUID(), level: 0 }, 'api');
            quill.insertText(pos + 1, '\n', 'api'); // Vytvořit nový odstavec za hranicí
            quill.setSelection(pos + 2, 0);
            scheduleSectionStyling();
            showToast('Sekce ukončena');
        }
    }
}, true);

// Keyword autocompletion: resources + sections
quill.on('text-change', (delta, oldDelta, source) => {
    if (source !== 'user') return;
    const range = quill.getSelection(); if (!range) return;
    const text = quill.getText(0, range.index);
    const lastChar = text.slice(-1);
    if (UI.state === 'SUGGEST_NEW' && (lastChar === ' ' || lastChar === '\n')) { UI.hide(); return; }
    if (UI.isOpen() && UI.state !== 'SUGGEST_NEW') return;

    const match = text.match(/(?:^|\s)([a-zA-Záčďéěíňóřšťúůýž]{2,})$/i);
    if (match) {
        const word = match[1].toLowerCase();
        const section = getCurrentSection();

        // Hledáme resources
        const matchedResources = getFilteredTemplates(section).filter(t => t.keywords.some(k => k.startsWith(word)));

        // Hledáme i sekce (jen pokud je povoleno vkládat podsekce)
        const parentType = getCurrentSectionType();
        const availableSections = getAvailableSections(parentType);
        const matchedSections = availableSections.filter(s => s.keywords.some(k => k.startsWith(word))).map(s => ({ ...s, _isSection: true }));

        const allMatches = [...matchedSections, ...matchedResources];

        if (allMatches.length > 0) {
            UI.filteredItems = allMatches;
            const bounds = quill.getBounds(range.index);
            const containerRect = quill.container.getBoundingClientRect();
            UI.show('SUGGEST_NEW', { top: bounds.top + containerRect.top, bottom: bounds.bottom + containerRect.top, left: bounds.left + containerRect.left, right: bounds.right + containerRect.left },
                { insertIndex: range.index, wordRange: { index: range.index - match[1].length, length: match[1].length } });
        } else if (UI.state === 'SUGGEST_NEW') UI.hide();
    } else if (UI.state === 'SUGGEST_NEW') UI.hide();
});

// Selection change: suggest edit on fhir-blot
quill.on('selection-change', (range) => {
    if (!range) { if (UI.isOpen() && UI.state === 'SUGGEST_EDIT') UI.hide(); return; }
    const [leaf] = quill.getLeaf(range.index);
    const [leafBefore] = range.index > 0 ? quill.getLeaf(range.index - 1) : [null];
    let domNode = null;
    if (leaf?.domNode?.classList?.contains('fhir-blot')) domNode = leaf.domNode;
    else if (leafBefore?.domNode?.classList?.contains('fhir-blot')) domNode = leafBefore.domNode;

    if (UI.isOpen()) {
        if (UI.state === 'SUGGEST_NEW' && UI.ctx.wordRange) { const w = UI.ctx.wordRange; if (range.index < w.index || range.index > w.index + w.length + 1) UI.hide(); return; }
        if (UI.state === 'SUGGEST_EDIT') { if (!domNode || domNode !== UI.ctx.node) UI.hide(); else return; }
        else return;
    }
    if (domNode && UI.state === 'CLOSED') {
        const rect = domNode.getBoundingClientRect(); const data = FhirBlot.value(domNode);
        UI.show('SUGGEST_EDIT', rect, { node: domNode, type: data.type, id: data.id, value: data.value });
    }
});

// Click handlers
document.getElementById('editor-container').addEventListener('click', e => {
    const blotNode = e.target.closest('.fhir-blot');
    if (blotNode) { UI.openEditForm(blotNode); return; }
    const sectionBtn = e.target.closest('.section-btn');
    if (sectionBtn) {
        e.preventDefault(); e.stopPropagation();
        const sn = sectionBtn.closest('.fhir-section'); if (!sn) return;
        const action = sectionBtn.getAttribute('data-action');
        if (action === 'change') SectionUI.changeSectionType(sn);
        else if (action === 'unlink') SectionUI.unlinkSection(sn);
        else if (action === 'delete') SectionUI.deleteSection(sn);
    }
});

document.addEventListener('mousedown', (e) => {
    if (!UI.isOpen() || UI.state !== 'SUGGEST_EDIT') return;
    if (UI.el.contains(e.target) || e.target.closest('.fhir-blot')) return;
    UI.hide();
});


// ===================================================================
// 8. Toolbar Button Wiring
// ===================================================================
document.getElementById('btn-insert').onclick = () => { quill.focus(); const r = quill.getSelection(true); const idx = r ? r.index : 0; const section = getCurrentSection(); UI.filteredItems = getFilteredTemplates(section); UI.show('SEARCH', getCursorRect() || quill.container.getBoundingClientRect(), { insertIndex: idx }); };
document.getElementById('btn-insert-section').onclick = () => SectionUI.openSectionSearch();
document.getElementById('btn-save').onclick = () => { FHIRBundleBuilder.downloadBundle(FHIRBundleBuilder.buildBundle(quill)); showToast('FHIR Bundle uložen'); };
document.getElementById('btn-load').onclick = () => document.getElementById('file-input').click();
document.getElementById('file-input').onchange = e => { const f = e.target.files[0]; if (!f) return; const reader = new FileReader(); reader.onload = evt => { try { FHIRBundleBuilder.importBundle(quill, evt.target.result); showToast('Bundle načten'); scheduleSectionStyling(); } catch (err) { alert('Chyba: ' + err.message); } e.target.value = ''; }; reader.readAsText(f); };
document.getElementById('btn-edit-code').onclick = () => Modals.openCodeEditor();
document.getElementById('btn-show-json').onclick = () => Modals.openJsonPreview();
document.getElementById('btn-print-report').onclick = () => Modals.openPrintPreview();
