/**
 * Mock Healthcare Provider Data
 * Based on CZ Core Organization + Practitioner profiles
 * (https://build.fhir.org/ig/HL7-cz/cz-core/)
 * This object will be replaced by real provider data from the system.
 */

const MOCK_HEALTHCARE_PROVIDER = (() => {
    const practitionerUuid = crypto.randomUUID();
    const organizationUuid = crypto.randomUUID();
    const practitionerRoleUuid = crypto.randomUUID();

    return {
        practitioner: {
            uuid: practitionerUuid,
            reference: { reference: `urn:uuid:${practitionerUuid}`, display: "MUDr. Anna Svobodová" },
            resource: {
                resourceType: "Practitioner",
                id: practitionerUuid,
                meta: {
                    profile: [
                        "https://hl7.cz/fhir/core/StructureDefinition/cz-practitioner-core"
                    ]
                },
                text: {
                    status: "generated",
                    div: '<div xmlns="http://www.w3.org/1999/xhtml">Lékař: MUDr. Anna Svobodová, IČP: 12345678</div>'
                },
                identifier: [
                    {
                        use: "official",
                        system: "https://ncez.mzcr.cz/standards/fhir/sid/krzp",
                        value: "123456789"
                    }
                ],
                name: [
                    {
                        use: "official",
                        family: "Svobodová",
                        given: ["Anna"],
                        prefix: ["MUDr."],
                        text: "MUDr. Anna Svobodová"
                    }
                ],
                telecom: [
                    {
                        system: "phone",
                        value: "+420 234 567 890",
                        use: "work"
                    },
                    {
                        system: "email",
                        value: "anna.svobodova@nemocnice.cz",
                        use: "work"
                    }
                ],
                qualification: [
                    {
                        code: {
                            coding: [{
                                system: "https://ncez.mzcr.cz/standards/fhir/CodeSystem/cz-qualification",
                                code: "GP",
                                display: "Všeobecné praktické lékařství"
                            }],
                            text: "Všeobecné praktické lékařství"
                        }
                    }
                ]
            }
        },

        organization: {
            uuid: organizationUuid,
            reference: { reference: `urn:uuid:${organizationUuid}`, display: "Ordinace praktického lékaře s.r.o." },
            resource: {
                resourceType: "Organization",
                id: organizationUuid,
                meta: {
                    profile: [
                        "https://hl7.cz/fhir/core/StructureDefinition/cz-organization-core"
                    ]
                },
                text: {
                    status: "generated",
                    div: '<div xmlns="http://www.w3.org/1999/xhtml">Organizace: Ordinace praktického lékaře s.r.o., IČO: 12345678</div>'
                },
                identifier: [
                    {
                        use: "official",
                        type: {
                            coding: [{
                                system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                                code: "PRN",
                                display: "Provider number"
                            }]
                        },
                        system: "https://ncez.mzcr.cz/standards/fhir/sid/ico",
                        value: "12345678"
                    },
                    {
                        use: "official",
                        type: {
                            coding: [{
                                system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                                code: "PRN",
                                display: "Provider number"
                            }]
                        },
                        system: "https://ncez.mzcr.cz/standards/fhir/sid/nrzp",
                        value: "87654321"
                    }
                ],
                active: true,
                type: [
                    {
                        coding: [{
                            system: "http://terminology.hl7.org/CodeSystem/organization-type",
                            code: "prov",
                            display: "Healthcare Provider"
                        }]
                    }
                ],
                name: "Ordinace praktického lékaře s.r.o.",
                telecom: [
                    {
                        system: "phone",
                        value: "+420 234 567 890",
                        use: "work"
                    }
                ],
                address: [
                    {
                        use: "work",
                        type: "physical",
                        text: "Nemocniční 5, 120 00 Praha 2",
                        line: ["Nemocniční 5"],
                        city: "Praha",
                        postalCode: "12000",
                        country: "CZ"
                    }
                ]
            }
        },

        practitionerRole: {
            uuid: practitionerRoleUuid,
            resource: {
                resourceType: "PractitionerRole",
                id: practitionerRoleUuid,
                meta: {
                    profile: [
                        "https://hl7.cz/fhir/core/StructureDefinition/cz-practitionerrole-core"
                    ]
                },
                text: {
                    status: "generated",
                    div: '<div xmlns="http://www.w3.org/1999/xhtml">MUDr. Anna Svobodová — Všeobecné praktické lékařství v Ordinace praktického lékaře s.r.o.</div>'
                },
                active: true,
                practitioner: { reference: `urn:uuid:${practitionerUuid}`, display: "MUDr. Anna Svobodová" },
                organization: { reference: `urn:uuid:${organizationUuid}`, display: "Ordinace praktického lékaře s.r.o." },
                code: [
                    {
                        coding: [{
                            system: "http://terminology.hl7.org/CodeSystem/practitioner-role",
                            code: "doctor",
                            display: "Doctor"
                        }]
                    }
                ],
                specialty: [
                    {
                        coding: [{
                            system: "https://ncez.mzcr.cz/standards/fhir/CodeSystem/cz-qualification",
                            code: "GP",
                            display: "Všeobecné praktické lékařství"
                        }]
                    }
                ]
            }
        }
    };
})();
