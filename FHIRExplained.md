# Úvodní příručka: FHIR a jeho implementace v editoru

Tento dokument slouží jako rychlý úvod pro vývojáře, kteří s protokolem FHIR v minulosti nepracovali a chtějí pochopit, jak je integrován do našeho klinického editoru.

---

## 1. Co je to FHIR?
**FHIR** (Fast Healthcare Interoperability Resources) je moderní datový standard vytvořený organizací HL7 pro výměnu zdravotnických informací.

Rozlučte se s nepřehlednými proprietárními databázemi; FHIR definuje otevřené JSON (nebo XML) struktury, kterým rozumí jakýkoliv moderní zdravotnický systém. 

### Základní pojmy FHIR
Základním stavebním kamenem FHIRu jsou tzv. **Zdroje (Resources)**. Každý Resource reprezentuje jeden izolovaný koncept ve zdravotnictví. V našem editoru se běžně setkáte s těmito:
- **`Patient`**: Údaje o pacientovi (Jméno, pojišťovna, datum narození).
- **`Practitioner`**: Údaje o lékaři (Kdo záznam pořídil).
- **`Organization`**: Organizace (Nemocnice, oddělení).
- **`Observation`**: Klinické pozorování či měření (Tělesná teplota, krevní tlak, tep, atd.). Těchto objektů generujeme v editoru nejvíce.
- **`Composition`**: Samotný "Klinický dokument" – např. lékařská zpráva. Odkazuje se na pacienta, lékaře, obsahuje prostý text zprávy a má odkazy na konkrétní položky (`Observation`).
- **`Bundle`**: "Balíček", který všechny výše zmíněné Zdroje spojuje dohromady do jednoho velkého JSON souboru, aby se daly bezpečně odeslat přes síť. Typ Bundle, který používáme, se jmenuje `document`.

---

## 2. Jak kódujeme klinické pojmy?
Ve FHIR nestačí jen říct "Tlak je 120/80". Počítač neví, co je "Tlak". FHIR proto využívá mezinárodně standardizované číselníky – nejčastěji **LOINC** (pro laboratorní výsledky a vital signs) nebo **SNOMED CT** (pro diagnózy). 

Když v šabloně u krevního tlaku uvidíte objekt `code`, říká přesně terminologií *"Tento záznam znamená měření systolického a diastolického krevního tlaku podle standardu LOINC kód 85354-9"*. To zaručuje, že data budou správně interpretována i v softwaru na druhé straně planety.

---

## 3. Implementace FHIR do našeho Editoru
Náš editor řeší klíčový problém: **Lékaři chtějí psát přirozený text (jako ve Wordu), ale systémy potřebují strukturovaná data (jako ve FHIR).**

Proto vizuálně vše vypadá jako běžný editor (využíváme knihovnu Quill.js), ale pod povrchem si pro každou zjištěnou hodnotu držíme datový FHIR model. Architektura stojí na 3 pilířích:

### A. Datový model v editoru (`FHIREditor.js`)
Při vložení například krevního tlaku nevložíme do editoru prostý text "TK: 120/80 mmHg". Pomocí vlastní komponenty (tzv. Quill Blot třídy `FhirBlot`) vložíme speciální HTML tag `<span>`. 
Tento tag je pro uživatele neupravitelný přes klávesnici a nese s sebou skrytá data v atributech (zejména `data-id` jako URN identifikátor, `data-type` pro typ šablony, `data-value` pro samotnou hodnotu). Díky těmto atributům editor vždy ví, kde se data nachází.

### B. Šablony (`FHIRTemplates.js`)
Tento soubor definuje převodní pravidla. Říká: *"Když editor zaznamená vložení šablony `bp` (krevní tlak), vygeneruj formulář se dvěma políčky a až uživatel zadá hodnoty např. `120/80`, přelož to do JSON objektu typu `Observation`"*.

**Pokud chcete přidat nový typ měření (např. glykémii), toto je jediné místo, kam musíte zasáhnout.** Zkopírujete existující šablonu v `TEMPLATES`, zadáte nové kódování LOINC, nastavíte formulář, jednotky a je hotovo. Zbytek systému si to přebere.

### C. Generování výsledného dokumentu (`FHIRBundleBuilder.js`)
Ve chvíli, kdy kliknete na *"Uložit"*, spustí se Builder:
1. Vygeneruje hlavičku správy (`Composition`).
2. Projde celý editor a přeloží všechny `<span>` tagy zpět na HTML text bez "špionážních" atributů. Tento čistý HTML text vloží do vygenerované hlavičky.
3. Posbírá všechny interaktivní tagy (podle `data-type` a `data-value`), prožene je přes `FHIRTemplates.js` a vygeneruje plnohodnotné zdroje `Observation`.
4. Všechno to vezme, přidruží (mockovaného) pacienta a lékaře, obalí to do obřího JSON `Bundle` ohlásí hotovo.

Tento Bundle se dá pak jednoduše kdykoliv naparsovat zpět, stáhnout, či odeslat do nemocničního systému.

---

## Shrnutí pro vývojáře
- **Co si přečíst jako první:** `FHIRTemplates.js`. Tam je de-facto veškerá klinická logika a vysvětlující komentáře.
- **Kde se řeší UI:** Plovoucí okna a chování Quill.js najdete ve `FHIREditor.js`.
- **Kde se generuje JSON balíček pro export:** `FHIRBundleBuilder.js`.

Další informace a referenční manuály k samotnému FHIR najdete na [hl7.org/fhir](https://hl7.org/fhir/).
