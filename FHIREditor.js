/**
 * FHIREditor.js
 * Hlavní logika editoru. 
 * Řeší: 
 * 1. Definici vlastního Quill objektu (tzv. "Blot") pro klinický záznam.
 * 2. Zobrazení interaktivních plovoucích oken (našeptávač pro Ctrl+. a formulář po kliku na hodnotu).
 * 3. Obsluhu chování kláves a myši.
 *
 * Dependencies: Quill.js (global), FHIRTemplates.js, FHIRBundleBuilder.js
 */

// ===================================================================
// 1. Custom Quill Blot for FHIR Resources
//
// Blot v terminologii Quillu znamená jakýkoliv kus formátovaného textu nebo objektu.
// Třída FhirBlot zajišťuje, aby se v editoru nevkládal jen obyčejný text, ale 
// speciální neupravitelný `<span>`, který má datové atributy (id, type záznamu, hodnota).
//
// Tento oddělený element umožňuje:
// - Rozpoznat, kde se nachází naměřená hodnota.
// - Zobrazit plovoucí formulář po kliknutí.
// - Během exportu přesně identifikovat FHIR element a vybudovat z něj JSON (`FHIRBundleBuilder`).
// ===================================================================
const Embed = Quill.import('blots/embed');

class FhirBlot extends Embed {
    static create(data) {
        const node = super.create();
        const id = data.id || crypto.randomUUID();
        const t = TEMPLATES[data.type];
        const resClass = t && t.fhirResourceType ? t.fhirResourceType : 'Observation';

        // Nastavení atributů `<span>` uzlu. Tyto atributy jsou kruciální pro uložení datového 
        // modelu editoru nezávisle na vizuální prezentaci.
        node.setAttribute('id', id);
        node.setAttribute('data-id', id);                 // FHIR unikátní ID pro resource URN
        node.setAttribute('data-type', data.type);        // Klíč šablony (např. 'bp', 'temp')
        node.setAttribute('data-value', data.value || '');// Aktuální surová textová hodnota (např. "120/80")
        node.setAttribute('class', `fhir-blot ${resClass}`); // Identifikační třídy
        node.setAttribute('contenteditable', 'false');    // Uživatel nesmí přepisovat objekt přímo, ale přes plovoucí UI

        if (t) {
            // Pokud záznam nemá hotovou hodnotu (uživatel teprve vkládá přes našeptávač),
            // přidá se třída 'empty', která v CSS bliká nebo je šedá.
            if (!data.value) node.classList.add('empty');
            // Pro vizuální zobrazení v editoru zavoláme formatter definovaný v naší šabloně.
            node.innerHTML = t.formatDisplay(data.value);
        }
        return node;
    }

    // formats: Informuje Quill, co má vrátit, když editor nebo jiná část programu potřebuje 
    // vědět, co v tomto nodu je. V našem případě vracíme slovník datových atributů.
    static formats(node) {
        return {
            id: node.getAttribute('data-id'),
            type: node.getAttribute('data-type'),
            value: node.getAttribute('data-value')
        };
    }

    // value: Stejný účel jako formats. Quill API tuto metodu občas potřebuje k deserializaci.
    static value(node) {
        return {
            id: node.getAttribute('data-id'),
            type: node.getAttribute('data-type'),
            value: node.getAttribute('data-value')
        };
    }
}
FhirBlot.blotName = 'fhir-resource';
FhirBlot.tagName = 'span';
Quill.register(FhirBlot);


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
// 3. Utility Functions
// ===================================================================
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => t.style.opacity = '1', 10);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.style.display = 'none', 300);
    }, 3000);
}

function getCursorRect() {
    const range = quill.getSelection();
    if (!range) return null;
    const bounds = quill.getBounds(range.index);
    const containerRect = quill.container.getBoundingClientRect();
    return {
        top: bounds.top + containerRect.top,
        bottom: bounds.bottom + containerRect.top,
        left: bounds.left + containerRect.left,
        right: bounds.right + containerRect.left
    };
}




// ===================================================================
// 5. Modal Dialogs
// ===================================================================
const Modals = {
    _overlay: null,
    _cmInstance: null,  // CodeMirror instance

    /**
     * Open a modal dialog.
     * @param {object} opts - { title, icon, headerActions: [{label, icon, cls, onClick}], bodyHtml, onOpen }
     */
    open(opts) {
        this.close(); // close any existing

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'modal-overlay';

        // Close on overlay click
        overlay.addEventListener('mousedown', e => {
            if (e.target === overlay) this.close();
        });

        const actionsHtml = (opts.headerActions || []).map(a =>
            `<button class="modal-btn ${a.cls || ''}" id="${a.id || ''}" title="${a.title || ''}">${a.icon ? `<i class="fa-solid ${a.icon}"></i> ` : ''}${a.label}</button>`
        ).join('');

        overlay.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3><i class="fa-solid ${opts.icon} text-slate-400"></i> ${opts.title}</h3>
                    <div class="modal-header-actions">
                        ${actionsHtml}
                        <button class="modal-close" id="modal-maximize-btn" title="Maximalizovat / Obnovit"><i class="fa-solid fa-expand"></i></button>
                        <button class="modal-close" id="modal-close-btn" title="Zavřít (Esc)"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
                <div class="modal-body" id="modal-body">
                    ${opts.bodyHtml || ''}
                </div>
            </div>`;

        document.body.appendChild(overlay);
        this._overlay = overlay;

        // Close button
        overlay.querySelector('#modal-close-btn').onclick = () => this.close();

        // Maximize/Restore button
        const maxBtn = overlay.querySelector('#modal-maximize-btn');
        maxBtn.onclick = () => this._toggleMaximize(overlay, maxBtn);

        // Esc key
        this._escHandler = e => { if (e.key === 'Escape') { this.close(); e.preventDefault(); } };
        window.addEventListener('keydown', this._escHandler);

        // Wire action buttons
        (opts.headerActions || []).forEach(a => {
            if (a.id && a.onClick) {
                const btn = overlay.querySelector(`#${a.id}`);
                if (btn) btn.onclick = a.onClick;
            }
        });

        // Callback after DOM insertion
        if (opts.onOpen) setTimeout(() => opts.onOpen(overlay), 0);
    },

    close() {
        if (this._cmInstance) {
            this._cmInstance = null;
        }
        if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
        }
        if (this._escHandler) {
            window.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
    },

    _toggleMaximize(overlay, btn) {
        const container = overlay.querySelector('.modal-container');
        if (!container) return;
        const isMax = container.classList.toggle('modal-maximized');
        const icon = btn.querySelector('i');
        if (isMax) {
            icon.className = 'fa-solid fa-compress';
            btn.title = 'Obnovit velikost';
        } else {
            icon.className = 'fa-solid fa-expand';
            btn.title = 'Maximalizovat';
        }
        // Refresh CodeMirror after resize
        if (this._cmInstance) {
            setTimeout(() => this._cmInstance.refresh(), 50);
        }
    },

    /**
     * Open Code Editor modal (edit Quill HTML directly) — uses CodeMirror
     */
    openCodeEditor() {
        const currentHtml = quill.root.innerHTML;
        const formatted = this._prettyHtml(currentHtml);

        this.open({
            title: 'Editor HTML kódu',
            icon: 'fa-code',
            headerActions: [
                { id: 'btn-code-apply', label: 'Použít', icon: 'fa-check', cls: 'primary', onClick: () => this._applyCodeEdit() }
            ],
            bodyHtml: `<div id="cm-editor-container" style="height:100%"></div>`,
            onOpen: (overlay) => {
                const container = overlay.querySelector('#cm-editor-container');
                if (!container) return;
                this._cmInstance = CodeMirror(container, {
                    value: formatted,
                    mode: 'htmlmixed',
                    theme: 'material-darker',
                    lineNumbers: true,
                    lineWrapping: true,
                    tabSize: 2,
                    indentWithTabs: false,
                    matchBrackets: true,
                    autoCloseTags: true,
                    foldGutter: false,
                    extraKeys: {
                        'Escape': () => this.close()
                    }
                });
                // Ensure CodeMirror fills the container
                this._cmInstance.setSize('100%', '100%');
                setTimeout(() => this._cmInstance.refresh(), 10);
            }
        });
    },

    _applyCodeEdit() {
        if (!this._cmInstance) return;
        quill.root.innerHTML = this._cmInstance.getValue();
        this.close();
        showToast('HTML kód byl aplikován');
    },

    /**
     * Open JSON Bundle preview modal (read-only, syntax-highlighted)
     */
    openJsonPreview() {
        const bundle = FHIRBundleBuilder.buildBundle(quill);
        const jsonStr = FHIRBundleBuilder.toJson(bundle);

        this.open({
            title: 'FHIR Bundle (JSON)',
            icon: 'fa-file-code',
            headerActions: [
                { id: 'btn-json-copy', label: 'Kopírovat', icon: 'fa-copy', onClick: () => this._copyJson() },
                { id: 'btn-json-download', label: 'Stáhnout', icon: 'fa-download', onClick: () => { FHIRBundleBuilder.downloadBundle(bundle); showToast('FHIR Bundle stažen'); } },
                { id: 'btn-json-validate', label: 'Validovat', icon: 'fa-shield-check', cls: '', onClick: () => this._openValidatorWithJson() }
            ],
            bodyHtml: `<div id="cm-json-container" style="height:100%"></div>`,
            onOpen: (overlay) => {
                const container = overlay.querySelector('#cm-json-container');
                if (!container) return;
                this._cmInstance = CodeMirror(container, {
                    value: jsonStr,
                    mode: 'application/json',
                    theme: 'material-darker',
                    lineNumbers: true,
                    lineWrapping: true,
                    readOnly: true,
                    tabSize: 2,
                    foldGutter: false,
                    extraKeys: {
                        'Escape': () => this.close()
                    }
                });
                this._cmInstance.setSize('100%', '100%');
                setTimeout(() => this._cmInstance.refresh(), 10);
            }
        });
    },

    async _copyJson() {
        const json = this._cmInstance ? this._cmInstance.getValue() : '';
        try {
            await navigator.clipboard.writeText(json);
            showToast('JSON zkopírován do schránky');
        } catch {
            const ta = document.createElement('textarea');
            ta.value = json;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            showToast('JSON zkopírován');
        }
    },

    _openValidatorWithJson() {
        window.open('https://inferno.healthit.gov/validator/', '_blank');
        this._copyJson();
        showToast('Validátor otevřen – JSON zkopírován do schránky');
    },

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _prettyHtml(html) {
        // Simple HTML pretty-printer (indent by tags)
        let result = '';
        let indent = 0;
        const step = '  ';

        // Normalize: add newlines around block-level tags
        html = html.replace(/>\s*</g, '>\n<');
        const lines = html.split('\n');

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // Closing tag first → decrease indent before printing
            if (line.match(/^<\/(div|p|ul|ol|li|h[1-6]|blockquote|section|table|thead|tbody|tr|td|th)/i)) {
                indent = Math.max(0, indent - 1);
            }

            result += step.repeat(indent) + line + '\n';

            // Opening tag → increase indent for next lines
            if (line.match(/^<(div|p|ul|ol|li|h[1-6]|blockquote|section|table|thead|tbody|tr|td|th)[^/]*>/i) &&
                !line.match(/<\/(div|p|ul|ol|li|h[1-6]|blockquote|section|table|thead|tbody|tr|td|th)>/i)) {
                indent += 1;
            }
        }

        return result.trim();
    }
};


// ===================================================================
// 6. Floating UI Manager (Autocomplete / Edit)
// ===================================================================
const UI = {
    el: document.getElementById('floating-ui'),
    state: 'CLOSED', // CLOSED, SEARCH, SUGGEST_NEW, SUGGEST_EDIT, EDIT_FORM
    ctx: {},
    filteredItems: [],
    selIndex: -1,

    isOpen() { return this.state !== 'CLOSED'; },

    init() {
        this.el.addEventListener('mousedown', e => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
                e.preventDefault();
            }
        });
    },

    show(state, rect, context = {}) {
        this.state = state;
        this.ctx = context;

        if (this.ctx.insertIndex === undefined) {
            const range = quill.getSelection();
            if (range) this.ctx.insertIndex = range.index;
        }

        this.el.style.display = 'block';
        this.el.style.opacity = '0';

        setTimeout(() => {
            const uiRect = this.el.getBoundingClientRect();
            let top = rect.bottom + 8;
            let left = rect.left;

            if (this.state === 'SEARCH') {
                top = rect.top - 4;
                left = rect.left + 4;
            }

            if (top + uiRect.height > window.innerHeight) {
                if (this.state === 'SEARCH') {
                    this.el.style.display = 'flex';
                    this.el.style.flexDirection = 'column-reverse';
                    top = rect.bottom - uiRect.height + 4;
                } else {
                    top = rect.top - uiRect.height - 8;
                }
            } else {
                this.el.style.display = 'block';
                this.el.style.flexDirection = 'column';
            }
            if (left + uiRect.width > window.innerWidth) {
                left = window.innerWidth - uiRect.width - 16;
            }

            this.el.style.top = `${Math.max(10, top)}px`;
            this.el.style.left = `${Math.max(10, left)}px`;
            this.el.style.opacity = '1';
        }, 0);

        this.selIndex = -1;
        this.render();
    },

    hide() {
        this.state = 'CLOSED';
        this.el.style.display = 'none';
        this.el.style.flexDirection = 'column';
        this.el.style.opacity = '0';
        if (this.ctx.node) this.ctx.node.classList.remove('active');
        this.ctx = {};
        quill.focus();
    },

    renderListOnly() {
        const container = document.getElementById('ui-list-container');
        if (!container) return;
        if (this.filteredItems.length === 0) {
            container.innerHTML = `<div style="padding:8px;font-size:13px;color:#94a3b8;text-align:center">Nic nenalezeno</div>`;
            return;
        }
        let html = '';
        this.filteredItems.forEach((t, i) => {
            const sel = i === this.selIndex ? 'selected' : '';
            html += `
                <div class="ui-item ${sel}" onclick="UI.execAction(${i})">
                    <span class="res-name">${t.label}</span>
                    <span class="res-keys">${t.keywords.join(', ')}</span>
                </div>`;
        });
        container.innerHTML = html;
    },

    render() {
        if (this.state === 'SEARCH' || this.state === 'SUGGEST_NEW') {
            let html = '';
            if (this.state === 'SEARCH') {
                html += `<input type="text" id="ui-search-input" class="ui-search-input" placeholder="hledat údaj..." autocomplete="off">`;
            }
            html += `<div class="ui-list" id="ui-list-container"></div>`;
            this.el.innerHTML = html;
            this.renderListOnly();

            if (this.state === 'SEARCH') {
                const searchInp = document.getElementById('ui-search-input');
                searchInp.focus();
                searchInp.oninput = (e) => {
                    const q = e.target.value.toLowerCase();
                    this.filteredItems = Object.values(TEMPLATES).filter(t =>
                        t.label.toLowerCase().includes(q) ||
                        t.keywords.some(k => k.includes(q))
                    );
                    this.selIndex = this.filteredItems.length > 0 ? 0 : -1;
                    this.renderListOnly();
                };
            }
        }
        else if (this.state === 'SUGGEST_EDIT') {
            const t = TEMPLATES[this.ctx.type];
            const sel = this.selIndex === 0 ? 'selected' : '';
            this.el.innerHTML = `
                <div class="ui-list">
                    <div class="ui-item ${sel}" onclick="UI.openEditForm()">
                        <span class="res-name"><i class="fa-solid fa-pen-to-square" style="color:#3b82f6;margin-right:8px"></i> Editovat ${t.label}</span>
                    </div>
                </div>`;
        }
        else if (this.state === 'EDIT_FORM') {
            const t = TEMPLATES[this.ctx.type];
            const vals = (this.ctx.value || '').split('/');

            let html = `
                <div class="ui-minimal-edit">
                    <i class="fa-solid ${t.icon}" style="color:#94a3b8;font-size:14px" title="${t.label}"></i>
                    <div style="display:flex;align-items:center;gap:4px">
                        ${t.renderInput(vals)}
                    </div>
                    <div style="width:1px;height:20px;background:#e5e7eb;margin:0 4px"></div>
                    <button style="color:#16a34a;background:none;border:none;cursor:pointer;padding:4px;border-radius:4px" title="Uložit" onclick="UI.saveEdit()"><i class="fa-solid fa-check"></i></button>
                    ${this.ctx.value ? `<button style="color:#dc2626;background:none;border:none;cursor:pointer;padding:4px;border-radius:4px" title="Odstranit" onclick="UI.deleteBlot()"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                    <button style="color:#94a3b8;background:none;border:none;cursor:pointer;padding:4px;border-radius:4px" title="Zrušit" onclick="UI.hide()"><i class="fa-solid fa-xmark"></i></button>
                </div>`;

            this.el.innerHTML = html;

            setTimeout(() => {
                const inps = this.el.querySelectorAll('input.fhir-input');
                if (inps[0]) { inps[0].focus(); inps[0].select(); }
            }, 50);
        }
    },

    moveSelection(dir) {
        if (this.state === 'SUGGEST_EDIT') {
            this.selIndex = 0;
            this.render();
            return;
        }
        if (this.state === 'SEARCH' || this.state === 'SUGGEST_NEW') {
            if (this.filteredItems.length === 0) return;
            if (this.selIndex === -1) {
                this.selIndex = dir === 1 ? 0 : this.filteredItems.length - 1;
            } else {
                this.selIndex = (this.selIndex + dir + this.filteredItems.length) % this.filteredItems.length;
            }
            this.renderListOnly();
            const container = document.getElementById('ui-list-container');
            if (container) {
                const selectedEl = container.querySelector('.selected');
                if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
            }
        }
    },

    confirmSelection() {
        if (this.state === 'SEARCH' || this.state === 'SUGGEST_NEW') {
            if (this.selIndex >= 0) this.execAction(this.selIndex);
        } else if (this.state === 'SUGGEST_EDIT') {
            if (this.selIndex >= 0) this.openEditForm();
        } else if (this.state === 'EDIT_FORM') {
            this.saveEdit();
        }
    },

    execAction(index) {
        const template = this.filteredItems[index];
        if (!template) return;

        let insertIndex = 0;
        if (this.ctx.insertIndex !== undefined) {
            insertIndex = this.ctx.insertIndex;
        } else {
            const sel = quill.getSelection(true);
            if (sel && sel.index !== undefined) insertIndex = sel.index;
        }

        if (this.ctx.wordRange) {
            const wIndex = Math.max(0, this.ctx.wordRange.index || 0);
            const wLen = this.ctx.wordRange.length || 0;
            quill.deleteText(wIndex, wLen, 'user');
            insertIndex = wIndex;
        }

        const id = crypto.randomUUID();
        quill.insertEmbed(insertIndex, 'fhir-resource', { type: template.id, id: id, value: '' }, 'api');
        quill.insertText(insertIndex + 1, ' ', 'user');

        this.hide();
        setTimeout(() => {
            const insertedNode = document.querySelector(`.fhir-blot[data-id="${id}"]`);
            if (insertedNode) {
                this.ctx.node = insertedNode;
                this.openEditForm(insertedNode);
            }
        }, 50);
    },

    openEditForm(node = null) {
        if (node) this.ctx.node = node;
        const n = this.ctx.node;
        if (!n || !n.classList) return;

        n.classList.add('active');
        const rect = n.getBoundingClientRect();
        const data = FhirBlot.value(n);

        this.show('EDIT_FORM', rect, {
            node: n,
            id: data.id,
            type: data.type,
            value: data.value
        });
    },

    saveEdit() {
        const t = TEMPLATES[this.ctx.type];
        this.ctx.value = t.getValue(this.el);

        const blot = Quill.find(this.ctx.node);
        if (blot) {
            const idx = quill.getIndex(blot);
            if (!this.ctx.value) {
                quill.deleteText(idx, 1, 'user');
            } else {
                quill.deleteText(idx, 1, 'api');
                quill.insertEmbed(idx, 'fhir-resource', { type: this.ctx.type, id: this.ctx.id, value: this.ctx.value }, 'api');
                quill.setSelection(idx + 1, 0);
            }
        }
        this.hide();
    },

    deleteBlot() {
        const blot = Quill.find(this.ctx.node);
        if (blot) quill.deleteText(quill.getIndex(blot), 1, 'user');
        this.hide();
    }
};

UI.init();


// ===================================================================
// 7. Event Handlers
// ===================================================================
window.addEventListener('keydown', (e) => {
    if (UI.isOpen()) {
        if (e.key === 'Escape') { UI.hide(); e.preventDefault(); return; }

        if (UI.state === 'SEARCH' || UI.state === 'SUGGEST_NEW' || UI.state === 'SUGGEST_EDIT') {
            if (e.key === 'ArrowDown') { UI.moveSelection(1); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { UI.moveSelection(-1); e.preventDefault(); }
            else if (e.key === 'Enter') {
                if (UI.selIndex >= 0) {
                    UI.confirmSelection();
                    e.preventDefault();
                } else {
                    UI.hide();
                }
            }
        } else if (UI.state === 'EDIT_FORM') {
            if (e.key === 'Enter') { UI.saveEdit(); e.preventDefault(); }
            if (e.key === '/') {
                const inps = Array.from(UI.el.querySelectorAll('input'));
                const activeIdx = inps.indexOf(document.activeElement);
                if (activeIdx >= 0 && activeIdx < inps.length - 1) {
                    e.preventDefault();
                    inps[activeIdx + 1].focus();
                }
            }
        }
    } else {
        // Ctrl+. → open search
        if (e.ctrlKey && e.key === '.') {
            e.preventDefault();
            UI.filteredItems = Object.values(TEMPLATES);
            const range = quill.getSelection();
            const insertIdx = range ? range.index : 0;
            const rect = getCursorRect() || quill.container.getBoundingClientRect();
            UI.show('SEARCH', rect, { insertIndex: insertIdx });
        }
    }
}, true);

// Text-change: keyword autocompletion
quill.on('text-change', (delta, oldDelta, source) => {
    if (source !== 'user') return;

    const range = quill.getSelection();
    if (!range) return;

    const text = quill.getText(0, range.index);
    const lastChar = text.slice(-1);

    if (UI.state === 'SUGGEST_NEW' && (lastChar === ' ' || lastChar === '\n')) {
        UI.hide();
        return;
    }

    if (UI.isOpen() && UI.state !== 'SUGGEST_NEW') return;

    const match = text.match(/(?:^|\s)([a-zA-Záčďéěíňóřšťúůýž]{2,})$/i);

    if (match) {
        const word = match[1].toLowerCase();
        const matchedTemplates = Object.values(TEMPLATES).filter(t =>
            t.keywords.some(k => k.startsWith(word))
        );

        if (matchedTemplates.length > 0) {
            UI.filteredItems = matchedTemplates;

            const posIndex = range.index;
            const bounds = quill.getBounds(posIndex);
            const containerRect = quill.container.getBoundingClientRect();
            const rect = {
                top: bounds.top + containerRect.top,
                bottom: bounds.bottom + containerRect.top,
                left: bounds.left + containerRect.left,
                right: bounds.right + containerRect.left
            };

            UI.show('SUGGEST_NEW', rect, {
                insertIndex: range.index,
                wordRange: { index: range.index - match[1].length, length: match[1].length }
            });
        } else if (UI.state === 'SUGGEST_NEW') {
            UI.hide();
        }
    } else if (UI.state === 'SUGGEST_NEW') {
        UI.hide();
    }
});

// Selection change: show edit popup on fhir-blot
quill.on('selection-change', (range) => {
    if (!range) {
        // Editor lost focus — hide suggestion popups (but keep edit forms open)
        if (UI.isOpen() && UI.state === 'SUGGEST_EDIT') {
            UI.hide();
        }
        return;
    }

    const [leaf] = quill.getLeaf(range.index);
    const [leafBefore] = range.index > 0 ? quill.getLeaf(range.index - 1) : [null];

    let domNode = null;
    if (leaf && leaf.domNode && leaf.domNode.classList && leaf.domNode.classList.contains('fhir-blot')) {
        domNode = leaf.domNode;
    } else if (leafBefore && leafBefore.domNode && leafBefore.domNode.classList && leafBefore.domNode.classList.contains('fhir-blot')) {
        domNode = leafBefore.domNode;
    }

    if (UI.isOpen()) {
        if (UI.state === 'SUGGEST_NEW' && UI.ctx.wordRange) {
            const w = UI.ctx.wordRange;
            if (range.index < w.index || range.index > w.index + w.length + 1) UI.hide();
            return;
        }
        if (UI.state === 'SUGGEST_EDIT') {
            if (!domNode || domNode !== UI.ctx.node) UI.hide();
            else return;
        } else {
            return;
        }
    }

    if (domNode && UI.state === 'CLOSED') {
        const rect = domNode.getBoundingClientRect();
        const data = FhirBlot.value(domNode);
        UI.show('SUGGEST_EDIT', rect, { node: domNode, type: data.type, id: data.id, value: data.value });
    }
});

// Click on fhir-blot → open edit
document.getElementById('editor-container').addEventListener('click', e => {
    const blotNode = e.target.closest('.fhir-blot');
    if (blotNode) {
        UI.openEditForm(blotNode);
    }
});

// Dismiss SUGGEST_EDIT when clicking outside the floating UI / blot
document.addEventListener('mousedown', (e) => {
    if (!UI.isOpen()) return;
    if (UI.state !== 'SUGGEST_EDIT') return;
    if (UI.el.contains(e.target)) return;
    const blotNode = e.target.closest('.fhir-blot');
    if (blotNode) return;
    UI.hide();
});


// ===================================================================
// 8. Toolbar Button Wiring
// ===================================================================

// Insert clinical data (Ctrl+.)
document.getElementById('btn-insert').onclick = () => {
    quill.focus();
    const range = quill.getSelection(true);
    const insertIdx = range ? range.index : 0;
    UI.filteredItems = Object.values(TEMPLATES);

    const bounds = quill.getBounds(insertIdx);
    const containerRect = quill.container.getBoundingClientRect();
    const rect = {
        top: bounds.top + containerRect.top,
        bottom: bounds.bottom + containerRect.top,
        left: bounds.left + containerRect.left,
        right: bounds.right + containerRect.left
    };

    UI.show('SEARCH', rect, { insertIndex: insertIdx });
};

// Save (download FHIR Bundle)
document.getElementById('btn-save').onclick = () => {
    const bundle = FHIRBundleBuilder.buildBundle(quill);
    FHIRBundleBuilder.downloadBundle(bundle);
    showToast('FHIR Bundle uložen');
};

// Load FHIR Bundle
document.getElementById('btn-load').onclick = () => document.getElementById('file-input').click();

document.getElementById('file-input').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
        try {
            const bundleJson = evt.target.result;
            FHIRBundleBuilder.importBundle(quill, bundleJson);
            showToast('FHIR Bundle byl úspěšně načten');
        } catch (err) {
            alert('Chyba při čtení souboru: ' + err.message);
            console.error(err);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
};

// Edit HTML code (modal)
document.getElementById('btn-edit-code').onclick = () => {
    Modals.openCodeEditor();
};

// Show FHIR Bundle JSON (modal)
document.getElementById('btn-show-json').onclick = () => {
    Modals.openJsonPreview();
};
