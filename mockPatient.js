/**
 * Mock Patient Data
 * Based on CZ Core Patient profile (https://build.fhir.org/ig/HL7-cz/cz-core/)
 * This object will be replaced by real patient data from the system.
 */

const MOCK_PATIENT = (() => {
    const uuid = crypto.randomUUID();
    return {
        uuid: uuid,
        reference: { reference: `urn:uuid:${uuid}`, display: "Novák, Jan" },
        resource: {
            resourceType: "Patient",
            id: uuid,
            meta: {
                profile: [
                    "https://hl7.cz/fhir/core/StructureDefinition/cz-patient-core"
                ]
            },
            text: {
                status: "generated",
                div: '<div xmlns="http://www.w3.org/1999/xhtml">Pacient: Jan Novák, nar. 15.3.1985, RČ: 850315/1234</div>'
            },
            identifier: [
                {
                    use: "usual",
                    type: {
                        coding: [{
                            system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                            code: "NI",
                            display: "National unique individual identifier"
                        }]
                    },
                    system: "https://ncez.mzcr.cz/standards/fhir/sid/rcis",
                    value: "8503151234"
                }
            ],
            name: [
                {
                    use: "official",
                    family: "Novák",
                    given: ["Jan"],
                    text: "Jan Novák"
                }
            ],
            gender: "male",
            birthDate: "1985-03-15",
            address: [
                {
                    use: "home",
                    type: "physical",
                    text: "Dlouhá 12, 110 00 Praha 1",
                    line: ["Dlouhá 12"],
                    city: "Praha",
                    postalCode: "11000",
                    country: "CZ"
                }
            ],
            telecom: [
                {
                    system: "phone",
                    value: "+420 602 123 456",
                    use: "mobile"
                },
                {
                    system: "email",
                    value: "jan.novak@example.cz",
                    use: "home"
                }
            ],
            // generalPractitioner will be populated with real provider reference
        }
    };
})();
