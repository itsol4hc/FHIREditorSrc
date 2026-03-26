# FHIR Editor

🇨🇿 **Česká verze** | 🇬🇧 [English Version](#english-version)

---

## 🇨🇿 Česká verze

**FHIR Editor** je opensource webový klinický editor postavený na moderním standardu [HL7 FHIR (Fast Healthcare Interoperability Resources)](https://hl7.org/fhir/). Umožňuje lékařům a zdravotnickému personálu snadno a vizuálně tvořit strukturované klinické zápisy, které jsou na pozadí automaticky převáděny do validního formátu FHIR Document Bundle (JSON).

🚀 **[Vyzkoušejte si online demo editoru zde](https://mudr-nosek-sro.cz/editor_fhir/)**

### Hlavní funkce
- **Vizuální psaní (WYSIWYG):** Editor postavený na knihovně Quill.js, obohacený o FHIR komponenty.
- **Rychlé zadávání parametrů:** Našeptávač pro hodnoty a vitální funkce (tlak, tep, teplota, SpO2, hmotnost atd.) dostupný pomocí stisku `Ctrl+.` nebo automaticky při psaní zkratek.
- **Sekce dokumentu:** Záznam je rozdělen do klinických sekcí (Subjektivně, Objektivně, Závěr atd.) – přidání sekce klávesou `F2`. Zajišťuje logické členění zprávy i z pohledu struktury FHIR Composition.
- **Okamžitá FHIR Validace a Export:** Možnost exportovat Bundle do JSON formátu nebo jej pomocí jednoho kliknutí rovnou zkopírovat do FHIR validátoru (např. Inferno Health IT).
- **Tiskový výstup:** Generování čistého náhledu bez editačních prvků, optimalizovaného pro přímý tisk zprávy pacienta.

### Technologie
- Vanilla JavaScript, CSS, HTML5.
- [Quill.js (verze 2.x)](https://quilljs.com/) pro vizuální textový editor.
- Datové profily FHIR R4 (zohledňuje i předepsaná doporučení pro vitální funkce a kategorie).

### Architektura projektu
- `FHIREditor.js` - Hlavní obsluha editoru, UI komponent, našeptávačů a práce se sekcemi. Uživatelské rozhraní a tooltipy jsou navrženy v češtině, samotné zdrojové kódy a vnitřní komentáře jsou však **v angličtině** pro snadnější mezinárodní kolaboraci.
- `FHIRTemplates.js` - Definice jednotlivých druhů záznamů (krevní tlak, výška, váha) a sekcí v dokumentu. Zde konfigurujete vlastní parametry, ikony a LOINC či SNOMED CT kódy pro nové vlastnosti editoru.
- `FHIRBundleBuilder.js` - Modul zajišťující bezchybnou transformaci editorového HTML záznamu a připojených hodnot do strukturálně korektní podoby reprezentující `<Bundle>`.
- `mockPatient.js` a `mockHealthCareProvider.js` - Zkušební JSON testovací data představující základního pacienta a poskytovatele péče.

### Instalace a použití
Stačí otevřít soubor `editor.html` ve kterémkoli moderním webovém prohlížeči. Celý projekt pro testovací a frontendové účely nevyžaduje žádný serverový backend.

### Licence
Projekt je vydán pod [MIT licencí](LICENCE.md). Můžete jej libovolně používat a upravovat, i pro komerční účely, s uvedením původního autora.

---

<a name="english-version"></a>
## 🇬🇧 English Version

**FHIR Editor** is an open-source web-based clinical editor constructed upon the modern [HL7 FHIR (Fast Healthcare Interoperability Resources)](https://hl7.org/fhir/) standard. It enables doctors and healthcare staff to easily and visually create structured clinical notes that are automatically converted into a valid FHIR Document Bundle envelope (JSON) in the background.

🚀 **[Try the online demo of the editor here](https://mudr-nosek-sro.cz/editor_fhir/)**

### Main Features
- **Visual Editing (WYSIWYG):** An editor built leveraging the Quill.js library, enriched natively with custom FHIR components.
- **Fast Parameter Entry:** An auto-complete suggester for vital signs (blood pressure, pulse, temperature, SpO2, weight, etc.) accessible by pressing `Ctrl+.` or automatically triggered by typing typical clinical shorthands.
- **Document Sections:** The clinical record is compartmentalized into structured clinical sections (Subjective, Objective, Conclusion, etc.) – sections can be inserted by pressing `F2`. This ensures logically structured nesting in adherence with FHIR Composition resource capabilities.
- **Instant FHIR Validation & Export:** Effortlessly generate the ultimate Bundle and export it to a JSON format, or quickly validate it against external validation environments (e.g., Inferno Health IT validator).
- **Print Output:** Automatically renders a clean, un-editable preview optimized for immediate printing of the patient's medical report.

### Technology Stack
- Vanilla JavaScript, CSS, HTML5.
- [Quill.js (Version 2.x)](https://quilljs.com/) for visual rich-text editing capacities.
- FHIR Release 4 framework profiles (incorporating required HL7 vital signs profiles and categorical observations).

### Project Architecture
- `FHIREditor.js` - Core bootstrapping sequence, handling the editor's runtime, UI elements, suggestion mechanisms, and document section DOM manipulations. While the frontend user interface strings remain in Czech to accommodate local physicians, **the codebase's internal structure and JSDoc comments are strictly in English** to support future open-source development.
- `FHIRTemplates.js` - Declarative definitions configuring all distinct clinical data inputs (e.g., blood pressure, height, weight) alongside valid document section descriptors. Utilize this configuration file to effortlessly establish distinct properties, UI icons, and structural FHIR elements like LOINC or SNOMED CT terminology for emerging editor functions.
- `FHIRBundleBuilder.js` - The algorithmic engine processing the seamless, standardized transformation of the front-end layout styling and its attached resources into a structurally valid `FHIR Document Bundle` topology.
- `mockPatient.js` and `mockHealthCareProvider.js` - Dummy payloads providing minimal yet robust required clinical entity contexts: representing a simulated patient identity alongside an active healthcare practitioner.

### How to Run
There is virtually zero barrier to entry. Simply load the `editor.html` file into any modern web browser. The primary editor runtime operates entirely on the client-side, eliminating any mandatory backend requirements.

### License
This project operates under the permissive guidelines of the [MIT License](LICENCE.md). You are free to adopt, modify, re-distribute, and embed it, including for commercial enterprises.
